// scripts/photos.ts
//
// Googleフォームのファイルアップロード回答（カンマ区切りのDrive URL）を
// 実ファイルに変換して public/circles/<slug>/ に吐く。
//
// 方針:
//   - 一度書き出したファイルは絶対に消さない。スプレッドシートが空でも、
//     すでにディスクにある画像をそのまま使い続ける
//   - 暗い写真は自動で持ち上げる。明るい写真には触らない
//   - 画質優先（webp q88-90 / 長辺1600 / 軽くシャープ）

import { google } from 'googleapis'
import type { GoogleAuth, JWT } from 'google-auth-library'
import sharp from 'sharp'
import heicConvert from 'heic-convert'
import { mkdir, writeFile, readFile, readdir, access } from 'node:fs/promises'
import path from 'node:path'

type Auth = GoogleAuth | JWT

/** DriveのファイルIDらしき連続文字列 */
const FILE_ID_RE = /[-\w]{25,}/

/**
 * 画像処理の設定を変えたらこの数字を上げる。
 * manifest に記録され、値が変わっていれば同じファイルでも作り直す。
 */
const PROCESS_VERSION = 3

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
const TARGET_LUMA = 128
/** 明るさ補正の上限。これ以上は上げない（ノイズが出るので） */
const MAX_BRIGHTNESS = 1.35

/** 1枚ぶんの明るさ補正の記録。data/report.md に出す */
export type PhotoStat = {
  /** 出力ファイル名。icon.webp / 01.webp … */
  name: string
  /** 元画像の平均輝度（0-255）。測れなかったときは null */
  mean: number | null
  /** かけた明るさの倍率。1 は無補正 */
  brightness: number
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
  stats?: Record<string, { mean: number | null; brightness: number }>
}

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
 * 平均輝度を測って、暗い写真にだけ明るさ補正をかける。
 * 既に明るい写真には 1.0（無補正）を返す。
 */
async function brightnessFor(
  buf: Buffer,
): Promise<{ mean: number | null; brightness: number }> {
  try {
    const stats = await sharp(buf).stats()
    const rgb = stats.channels.slice(0, 3)
    if (!rgb.length) return { mean: null, brightness: 1 }
    const mean = rgb.reduce((s, c) => s + c.mean, 0) / rgb.length
    if (mean >= TARGET_LUMA) return { mean, brightness: 1 }
    // 真っ黒に近い写真で倍率が暴れないよう下限を切る
    return {
      mean,
      brightness: Math.min(MAX_BRIGHTNESS, TARGET_LUMA / Math.max(mean, 60)),
    }
  } catch {
    return { mean: null, brightness: 1 }
  }
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
): Promise<{ data: Buffer; mean: number | null; brightness: number }> {
  buf = await toDecodable(buf)
  const { mean, brightness } = await brightnessFor(buf)

  // 先に中央で目標の縦横比に切り抜いてから縮める。
  // cover と withoutEnlargement を併用すると、元が小さい写真は切り抜きが効かず
  // 比率が崩れる（1108×1067 のような正方形に近いものが出ていた）。
  // **幅が足りなくても比率を守るのを優先する。**拡大はしない
  const meta = await sharp(buf).metadata()
  const crop = centerCrop(meta.autoOrient.width, meta.autoOrient.height, opts.width / opts.height)

  const data = await sharp(buf)
    .rotate() // EXIFの向きを反映（スマホ写真が横倒しになるのを防ぐ）。extract より前に呼ぶ
    .extract(crop)
    .resize(opts.width, opts.height, {
      fit: 'fill', // 比率は extract で合わせ済み。丸めの1px差で切り落とさない
      withoutEnlargement: true, // 元が小さい写真を無理に拡大しない
    })
    .modulate({
      brightness,
      saturation: brightness > 1 ? 1.05 : 1, // 明るくした分だけ色が抜けるので軽く戻す
    })
    .sharpen({ sigma: 0.8 })
    .webp({ quality: opts.quality, effort: 6 })
    .toBuffer()

  return { data, mean, brightness }
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
  recorded: Record<string, { mean: number | null; brightness: number }>,
): PhotoStat[] {
  const names = [
    ...(result.icon ? ['icon.webp'] : []),
    ...result.photos.map((p) => path.basename(p)),
  ]
  return names
    .map((name) => ({ name, stat: recorded[name] }))
    .filter((x): x is { name: string; stat: { mean: number | null; brightness: number } } =>
      Boolean(x.stat),
    )
    .map((x) => ({ name: x.name, mean: x.stat.mean, brightness: x.stat.brightness }))
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
    return kept
  }

  await mkdir(outDir, { recursive: true })

  const next: Record<string, string> = {}
  const nextStats: Record<string, { mean: number | null; brightness: number }> = {}

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
        nextStats['icon.webp'] = { mean: out.mean, brightness: out.brightness }
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
          nextStats[name] = { mean: out.mean, brightness: out.brightness }
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
  return result
}
