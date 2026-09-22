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
import { mkdir, writeFile, readFile, readdir, access } from 'node:fs/promises'
import path from 'node:path'

type Auth = GoogleAuth | JWT

/** DriveのファイルIDらしき連続文字列 */
const FILE_ID_RE = /[-\w]{25,}/

/**
 * 画像処理の設定を変えたらこの数字を上げる。
 * manifest に記録され、値が変わっていれば同じファイルでも作り直す。
 */
const PROCESS_VERSION = 2

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

export type CirclePhotos = {
  icon: string | null
  photos: string[]
}

type Manifest = {
  v?: number
  files?: Record<string, string>
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
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  )
  return Buffer.from(res.data as ArrayBuffer)
}

/**
 * 平均輝度を測って、暗い写真にだけ明るさ補正をかける。
 * 既に明るい写真には 1.0（無補正）を返す。
 */
async function brightnessFor(buf: Buffer): Promise<number> {
  try {
    const stats = await sharp(buf).stats()
    const rgb = stats.channels.slice(0, 3)
    if (!rgb.length) return 1
    const mean = rgb.reduce((s, c) => s + c.mean, 0) / rgb.length
    if (mean >= TARGET_LUMA) return 1
    // 真っ黒に近い写真で倍率が暴れないよう下限を切る
    return Math.min(MAX_BRIGHTNESS, TARGET_LUMA / Math.max(mean, 60))
  } catch {
    return 1
  }
}

async function processImage(
  buf: Buffer,
  opts: { width: number; height: number; quality: number },
): Promise<Buffer> {
  const brightness = await brightnessFor(buf)

  return sharp(buf)
    .rotate() // EXIFの向きを反映（スマホ写真が横倒しになるのを防ぐ）
    .resize(opts.width, opts.height, {
      fit: 'cover',
      position: sharp.strategy.attention,
      withoutEnlargement: true, // 元が小さい写真を無理に拡大しない
    })
    .modulate({
      brightness,
      saturation: brightness > 1 ? 1.05 : 1, // 明るくした分だけ色が抜けるので軽く戻す
    })
    .sharpen({ sigma: 0.8 })
    .webp({ quality: opts.quality, effort: 6 })
    .toBuffer()
}

/** すでにディスクにある画像を拾う（スプレッドシートが空のときの保険） */
async function existingFiles(outDir: string, slug: string): Promise<CirclePhotos> {
  const result: CirclePhotos = { icon: null, photos: [] }
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

/**
 * 1団体ぶんの写真を同期する。
 */
export async function syncCirclePhotos(
  auth: Auth,
  slug: string,
  iconCell: string | undefined,
  photoCell: string | undefined,
  publicDir: string,
): Promise<CirclePhotos> {
  const outDir = path.join(publicDir, 'circles', slug)

  const iconIds = parseDriveCell(iconCell)
  const photoIds = parseDriveCell(photoCell)

  // スプレッドシートに何もない場合は、既存のファイルをそのまま使う。
  // ここで空配列を返すと、サイトから写真が消えたように見えてしまう。
  if (iconIds.length === 0 && photoIds.length === 0) {
    return existingFiles(outDir, slug)
  }

  await mkdir(outDir, { recursive: true })

  const manifestPath = path.join(outDir, '.manifest.json')
  let manifest: Manifest = {}
  if (await exists(manifestPath)) {
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    } catch {
      manifest = {}
    }
  }
  const prev = manifest.v === PROCESS_VERSION ? manifest.files || {} : {}
  const next: Record<string, string> = {}

  // 既存のファイルを土台にする。今回書き換えたものだけ上書きされる
  const result = await existingFiles(outDir, slug)

  // --- アイコン: 正方形 ---
  const iconId = iconIds[0]
  if (iconId) {
    const abs = path.join(outDir, 'icon.webp')
    next['icon'] = iconId
    if (prev['icon'] !== iconId || !(await exists(abs))) {
      const raw = await downloadFile(auth, iconId)
      const out = await processImage(raw, {
        width: ICON.size,
        height: ICON.size,
        quality: ICON.quality,
      })
      await writeFile(abs, out)
    }
    result.icon = `/circles/${slug}/icon.webp`
  }

  // --- 写真: 詳細ページのカルーセル。3:2 ---
  if (photoIds.length) {
    const paths: string[] = []
    for (const [i, id] of photoIds.entries()) {
      const name = `${String(i + 1).padStart(2, '0')}.webp`
      const abs = path.join(outDir, name)
      next[name] = id
      if (prev[name] !== id || !(await exists(abs))) {
        const raw = await downloadFile(auth, id)
        const out = await processImage(raw, PHOTO)
        await writeFile(abs, out)
      }
      paths.push(`/circles/${slug}/${name}`)
    }
    // 枚数が減った場合でも、既存ファイルは消さずに残す。
    // 表示に使うのはスプレッドシートにある分だけ。
    result.photos = paths
  }

  // 前回あって今回なかったキーも manifest には残す（ファイルが残っているので）
  Object.keys(prev).forEach((k) => {
    if (next[k] == null) next[k] = prev[k]
  })

  await writeFile(
    manifestPath,
    JSON.stringify({ v: PROCESS_VERSION, files: next }, null, 2),
  )
  return result
}
