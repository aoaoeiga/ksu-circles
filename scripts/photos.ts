// scripts/photos.ts
//
// Googleフォームのファイルアップロード回答（カンマ区切りのDrive URL）を
// 実ファイルに変換して public/circles/<slug>/ に吐く。
//
// 方針:
//   - 一度書き出したファイルは絶対に消さない。スプレッドシートが空でも、
//     すでにディスクにある画像をそのまま使い続ける
//   - 暗い写真は中間調だけ持ち上げる（ガンマ）。白は飛ばさない。明るい写真には触らない
//   - 画質優先（webp q88-90 / 長辺1600 / 軽くシャープ）

import { google } from 'googleapis'
import type { GoogleAuth, JWT } from 'google-auth-library'
import sharp from 'sharp'
import heicConvert from 'heic-convert'
import { mkdir, writeFile, readFile, readdir, access, stat } from 'node:fs/promises'
import path from 'node:path'

type Auth = GoogleAuth | JWT

/** DriveのファイルIDらしき連続文字列 */
const FILE_ID_RE = /[-\w]{25,}/

/**
 * 画像処理の設定を変えたらこの数字を上げる。
 * manifest に記録され、値が変わっていれば同じファイルでも作り直す。
 */
const PROCESS_VERSION = 4

const ICON = {
  size: 640,
  quality: 90,
}

const PHOTO = {
  width: 1600,
  height: 1067, // 3:2
  quality: 88,
}

/** 目標の平均輝度（0-255）。これを下回る写真だけ持ち上げる */
const TARGET_LUMA = 120
/**
 * 中間調を持ち上げる上限（平均輝度を何倍までにするか）。
 * 1.35 の掛け算では白飛びと質感の変化が目立ったので、ガンマに変えて上限も下げた
 */
const MAX_BRIGHTNESS = 1.15

/** 1枚ぶんの明るさ補正の記録。data/report.md に出す */
export type PhotoStat = {
  /** 出力ファイル名。icon.webp / 01.webp … */
  name: string
  /** 元画像の平均輝度（0-255）。測れなかったときは null */
  mean: number | null
  /** 中間調の持ち上げ倍率（補正後の平均輝度の目安 ÷ 元の平均輝度）。1 は無補正 */
  brightness: number
  /** トーンカーブの指数 p（out = in^p）。1 は無補正。古い記録には無い */
  gamma?: number
}

/** 取り込めなかった1枚ぶん */
export type PhotoFailure = {
  /** 出力ファイル名。icon.webp / 01.webp … */
  name: string
  fileId: string
  message: string
}

export type CirclePhotos = {
  icon: string | null
  photos: string[]
  /**
   * 取り込めなかった写真。**1枚落ちても他の写真は出す。**
   * HEIC など sharp が読めない形式が1枚混ざっただけで、
   * その団体の写真が全部消えてしまうのを避ける。
   */
  failures: PhotoFailure[]
  /**
   * 明るさ補正の記録。**manifest に残すので、取り込み直さない回でも出せる。**
   * 毎回レポートに出したいが、変わっていない画像は読み直さないため。
   */
  stats: PhotoStat[]
}

type Manifest = {
  v?: number
  files?: Record<string, string>
  stats?: Record<string, RecordedStat>
}

type RecordedStat = { mean: number | null; brightness: number; gamma?: number }

/**
 * フォームの1セル（カンマ区切りのDrive URL）からファイルIDを取り出す。
 * 空セル・想定外の文字列は黙って捨てる。
 */
export function parseDriveCell(cell: string | undefined | null): string[] {
  if (!cell) return []
  return cell
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((url) => url.match(FILE_ID_RE)?.[0])
    .filter((id): id is string => Boolean(id))
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function downloadFile(auth: Auth, fileId: string): Promise<Buffer> {
  const drive = google.drive({ version: 'v3', auth: auth as never })
  try {
    const res = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' },
    )
    return Buffer.from(res.data as ArrayBuffer)
  } catch (error) {
    // どのファイルで落ちたか分からないと直せない。IDを添えて投げ直す
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Drive のファイル ${fileId} を取れませんでした（${reason}）`)
  }
}

/**
 * HEVC で圧縮された HEIF（iPhone の .HEIC）か。**拡張子ではなく中身で見る。**
 * フォームのアップロードは名前が .JPG でも中身が HEIC のことがあり、逆もある。
 *
 * 先頭の ftyp ボックスのブランド（主＋互換）に HEVC 系があれば true。
 * AVIF（av01）は sharp が自前で読めるので対象外。
 */
const HEVC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'])

export function isHevcHeif(buf: Uint8Array): boolean {
  if (buf.length < 16) return false
  const ascii = (from: number) => String.fromCharCode(...buf.subarray(from, from + 4))
  if (ascii(4) !== 'ftyp') return false
  const boxSize = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(0)
  const end = Math.min(boxSize, buf.length)
  // 8: 主ブランド / 12: マイナーバージョン / 16〜: 互換ブランド
  const brands = [ascii(8)]
  for (let at = 16; at + 4 <= end; at += 4) brands.push(ascii(at))
  return brands.some((brand) => HEVC_BRANDS.has(brand))
}

/**
 * sharp が読める形にそろえる。
 * sharp 同梱の libvips は HEVC のデコーダを持たない（ヘッダは読めるが画素で落ちる）ので、
 * HEIC だけ先に JPEG へ変換する。向きは libheif が画素に焼き込むので EXIF は要らない。
 */
async function toDecodable(buf: Buffer): Promise<Buffer> {
  if (!isHevcHeif(buf)) return buf
  try {
    const jpeg = await heicConvert({ buffer: buf, format: 'JPEG', quality: 1 })
    return Buffer.from(jpeg)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`HEIC を JPEG に変換できませんでした（${reason}）`)
  }
}

/**
 * 平均輝度を測って、暗い写真にだけかけるトーンカーブを決める。
 * 既に明るい写真には 1.0（無補正）を返す。
 *
 * 掛け算で明るくすると、もともと明るい部分が 255 に張り付いて白く飛ぶ。
 * out = 255·(in/255)^p（p < 1）なら 0 と 255 は動かず、中間調だけが持ち上がる。
 * p は「平均輝度 mean の画素が target に来る」ように決める
 */
export function toneFor(mean: number | null): { brightness: number; gamma: number } {
  if (mean == null || mean <= 0 || mean >= TARGET_LUMA) return { brightness: 1, gamma: 1 }
  const target = Math.min(TARGET_LUMA, mean * MAX_BRIGHTNESS)
  return {
    brightness: target / mean,
    gamma: Math.log(target / 255) / Math.log(mean / 255),
  }
}

async function measure(buf: Buffer): Promise<RecordedStat> {
  let mean: number | null = null
  try {
    const stats = await sharp(buf).stats()
    const rgb = stats.channels.slice(0, 3)
    if (rgb.length) mean = rgb.reduce((s, c) => s + c.mean, 0) / rgb.length
  } catch {
    // 測れなければ補正しない
  }
  return { mean, ...toneFor(mean) }
}

/** RGB の各チャンネルにトーンカーブをかける。アルファには触らない */
function applyGamma(pixels: Buffer, channels: number, gamma: number): Buffer {
  if (gamma === 1) return pixels
  const lut = new Uint8Array(256)
  for (let v = 0; v < 256; v++) lut[v] = Math.round(255 * Math.pow(v / 255, gamma))
  const out = Buffer.from(pixels)
  for (let i = 0; i < out.length; i++) {
    if (channels === 4 && i % 4 === 3) continue
    out[i] = lut[out[i]]
  }
  return out
}

/**
 * 幅 width × 高さ height の画像から、縦横比 ratio の最大の領域を中央で取る。
 * 端数は切り捨てる（はみ出すと extract が落ちる）
 */
export function centerCrop(
  width: number,
  height: number,
  ratio: number,
): { left: number; top: number; width: number; height: number } {
  const w = Math.min(width, Math.floor(height * ratio))
  const h = Math.min(height, Math.floor(w / ratio))
  return {
    left: Math.floor((width - w) / 2),
    top: Math.floor((height - h) / 2),
    width: w,
    height: h,
  }
}

async function processImage(
  buf: Buffer,
  opts: { width: number; height: number; quality: number },
): Promise<{ data: Buffer } & RecordedStat> {
  buf = await toDecodable(buf)
  const stat = await measure(buf)

  // 先に中央で目標の縦横比に切り抜いてから縮める。
  // cover と withoutEnlargement を併用すると、元が小さい写真は切り抜きが効かず
  // 比率が崩れる（1108×1067 のような正方形に近いものが出ていた）。
  // **幅が足りなくても比率を守るのを優先する。**拡大はしない
  const meta = await sharp(buf).metadata()
  const crop = centerCrop(meta.autoOrient.width, meta.autoOrient.height, opts.width / opts.height)

  const resized = await sharp(buf)
    .rotate() // EXIFの向きを反映（スマホ写真が横倒しになるのを防ぐ）。extract より前に呼ぶ
    .extract(crop)
    .resize(opts.width, opts.height, {
      fit: 'fill', // 比率は extract で合わせ済み。丸めの1px差で切り落とさない
      withoutEnlargement: true, // 元が小さい写真を無理に拡大しない
    })
    .toColorspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height, channels } = resized.info

  const data = await sharp(applyGamma(resized.data, channels, stat.gamma ?? 1), {
    raw: { width, height, channels },
  })
    .modulate({
      saturation: stat.brightness > 1 ? 1.03 : 1, // 持ち上げた分だけ色が浅くなるので、ごく軽く戻す
    })
    .sharpen({ sigma: 0.8 })
    .webp({ quality: opts.quality, effort: 6 })
    .toBuffer()

  return { data, ...stat }
}

/**
 * 表示用の縮小版。写真（01.webp …）1枚ごとに、同じフォルダへ次を置く。
 *   01@600.webp   一覧のタイル・ヒーローの初回表示
 *   01@1200.webp  ヒーロー（スマホの高解像度画面）
 *   01@bg.webp    ヒーローの背面に敷くぼかし。幅48を拡大して使うので、CSS の blur が要らない
 * 元（01.webp）から作るので、Drive 経由の団体も手元コピーの団体も同じように揃う。
 * 元より古い版だけ作り直す。拡大はしない
 */
export const VARIANTS = [
  { suffix: '@600', width: 600, quality: 82 },
  { suffix: '@1200', width: 1200, quality: 84 },
  { suffix: '@bg', width: 48, quality: 70, blur: 1 },
] as const

export async function ensureVariants(outDir: string): Promise<number> {
  let names: string[]
  try {
    names = await readdir(outDir)
  } catch {
    return 0
  }
  let made = 0
  for (const name of names.filter((n) => /^\d{2}\.webp$/.test(n))) {
    const src = path.join(outDir, name)
    const srcTime = (await stat(src)).mtimeMs
    for (const v of VARIANTS) {
      const dest = path.join(outDir, name.replace(/\.webp$/, `${v.suffix}.webp`))
      const fresh = await stat(dest).then((d) => d.mtimeMs >= srcTime).catch(() => false)
      if (fresh) continue
      try {
        let img = sharp(src).resize({ width: v.width, withoutEnlargement: true })
        if ('blur' in v) img = img.blur(v.blur)
        await img.webp({ quality: v.quality, effort: 6 }).toFile(dest)
        made += 1
      } catch {
        // 読めない1枚のために、ほかの写真や sync 全体を止めない。
        // 元が読めない写真はブラウザでも読めないので、表示側は読み込み失敗として頭文字タイルに落ちる
      }
    }
  }
  return made
}

/** すでにディスクにある画像を拾う（スプレッドシートが空のときの保険） */
async function existingFiles(outDir: string, slug: string): Promise<CirclePhotos> {
  const result: CirclePhotos = { icon: null, photos: [], stats: [], failures: [] }
  let names: string[]
  try {
    names = await readdir(outDir)
  } catch {
    return result
  }

  if (names.includes('icon.webp')) {
    result.icon = `/circles/${slug}/icon.webp`
  }
  result.photos = names
    .filter((n) => /^\d{2}\.webp$/.test(n))
    .sort()
    .map((n) => `/circles/${slug}/${n}`)

  return result
}

/** 表示に使うファイルの並びどおりに、明るさの記録を組み立てる */
function statsFor(
  result: CirclePhotos,
  recorded: Record<string, RecordedStat>,
): PhotoStat[] {
  const names = [
    ...(result.icon ? ['icon.webp'] : []),
    ...result.photos.map((p) => path.basename(p)),
  ]
  return names
    .map((name) => ({ name, stat: recorded[name] }))
    .filter((x): x is { name: string; stat: RecordedStat } => Boolean(x.stat))
    .map((x) => ({ name: x.name, ...x.stat }))
}

/**
 * 1団体ぶんの写真を同期する。
 */
export async function syncCirclePhotos(
  auth: Auth,
  slug: string,
  iconCell: string | undefined,
  photoCell: string | undefined,
  publicDir: string,
  /** 取得の差し替え口。テストから1枚だけ失敗させるために使う */
  deps: { download?: (auth: Auth, fileId: string) => Promise<Buffer> } = {},
): Promise<CirclePhotos> {
  const download = deps.download ?? downloadFile
  const outDir = path.join(publicDir, 'circles', slug)

  const iconIds = parseDriveCell(iconCell)
  const photoIds = parseDriveCell(photoCell)

  // manifest は先に読む。取り込み直さない回でも明るさの記録を出したいので、
  // シートが空で早く返すときにも使う
  const manifestPath = path.join(outDir, '.manifest.json')
  let manifest: Manifest = {}
  if (await exists(manifestPath)) {
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    } catch {
      manifest = {}
    }
  }
  const sameVersion = manifest.v === PROCESS_VERSION
  const prev = sameVersion ? manifest.files || {} : {}
  const prevStats = sameVersion ? manifest.stats || {} : {}

  // スプレッドシートに何もない場合は、既存のファイルをそのまま使う。
  // ここで空配列を返すと、サイトから写真が消えたように見えてしまう。
  // 手で置いた写真（manifest が無い）もこの経路で拾う。
  if (iconIds.length === 0 && photoIds.length === 0) {
    const kept = await existingFiles(outDir, slug)
    kept.stats = statsFor(kept, prevStats)
    // 手で置いた写真にも縮小版を用意する
    await ensureVariants(outDir)
    return kept
  }

  await mkdir(outDir, { recursive: true })

  const next: Record<string, string> = {}
  const nextStats: Record<string, RecordedStat> = {}

  // 既存のファイルを土台にする。今回書き換えたものだけ上書きされる
  const result = await existingFiles(outDir, slug)

  // --- アイコン: 正方形 ---
  const failures: PhotoFailure[] = []
  const iconId = iconIds[0]
  if (iconId) {
    const abs = path.join(outDir, 'icon.webp')
    try {
      if (prev['icon'] !== iconId || !(await exists(abs))) {
        const raw = await download(auth, iconId)
        const out = await processImage(raw, {
          width: ICON.size,
          height: ICON.size,
          quality: ICON.quality,
        })
        await writeFile(abs, out.data)
        nextStats['icon.webp'] = { mean: out.mean, brightness: out.brightness, gamma: out.gamma }
      }
      next['icon'] = iconId
      result.icon = `/circles/${slug}/icon.webp`
    } catch (error) {
      failures.push({
        name: 'icon.webp',
        fileId: iconId,
        message: error instanceof Error ? error.message : String(error),
      })
      // 前に取り込んだものが残っていれば、それを使い続ける
      if (await exists(abs)) {
        if (prev['icon']) next['icon'] = prev['icon']
        result.icon = `/circles/${slug}/icon.webp`
      }
    }
  }

  // --- 写真: 詳細ページのカルーセル。3:2 ---
  if (photoIds.length) {
    const paths: string[] = []
    for (const [i, id] of photoIds.entries()) {
      const name = `${String(i + 1).padStart(2, '0')}.webp`
      const abs = path.join(outDir, name)
      try {
        if (prev[name] !== id || !(await exists(abs))) {
          const raw = await download(auth, id)
          const out = await processImage(raw, PHOTO)
          await writeFile(abs, out.data)
          nextStats[name] = { mean: out.mean, brightness: out.brightness, gamma: out.gamma }
        }
        next[name] = id
        paths.push(`/circles/${slug}/${name}`)
      } catch (error) {
        // この1枚だけ諦める。番号は詰めない（他の写真の並びを動かさないため）
        failures.push({
          name,
          fileId: id,
          message: error instanceof Error ? error.message : String(error),
        })
        if (await exists(abs)) {
          if (prev[name]) next[name] = prev[name]
          paths.push(`/circles/${slug}/${name}`)
        }
      }
    }
    // 枚数が減った場合でも、既存ファイルは消さずに残す。
    // 表示に使うのはスプレッドシートにある分だけ。
    result.photos = paths
  }

  // 前回あって今回なかったキーも manifest には残す（ファイルが残っているので）
  Object.keys(prev).forEach((k) => {
    if (next[k] == null) next[k] = prev[k]
  })
  // 明るさの記録も同じ。読み直さなかった画像は前回の値を引き継ぐ
  const mergedStats = { ...prevStats, ...nextStats }

  // 1枚も取り込めなかった回に空の manifest を置かない
  if (Object.keys(next).length > 0 || Object.keys(mergedStats).length > 0) {
    await writeFile(
      manifestPath,
      JSON.stringify({ v: PROCESS_VERSION, files: next, stats: mergedStats }, null, 2),
    )
  }
  result.stats = statsFor(result, mergedStats)
  result.failures = failures
  await ensureVariants(outDir)
  return result
}
