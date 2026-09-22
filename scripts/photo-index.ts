// public/photos を走査して、団体IDごとの写真ファイル名を集める。
//
// sync は画像を変換しない（docs/10-sync-spec.md §7）。変換は手元で済ませて置く。
// ここは「置いてあるファイルを数える」だけ。Google API にも sharp にも依存しない。
//
// 期待するファイル名:
//   {id}-icon.webp        一覧タイルと OGP 用。1:1、幅400。@600 は無い
//   {id}-{n}.webp         ヒーロー用。3:2、幅1200。n は 1 から詰める。最大5枚
//   {id}-{n}@600.webp     同じ写真の幅600。photos 配列には入れない（lib/design.ts の photoSrc() が組み立てる）

import { existsSync, readdirSync } from "node:fs";

export const MAX_PHOTOS = 5;

/** 写真の置き場所ひとつぶん。public/circles でも public/photos でも同じ形で扱う */
export type PhotoSet = { icon: string | null; photos: string[] };

/**
 * 写真の置き場所は2系統ある。**新しいほうを優先し、無ければ古いほうに落とす。**
 *
 *   fresh   public/circles/<団体ID>/   シートの写真_元から取り込んだもの、または手で置いたもの
 *   legacy  public/photos/             以前に手で置いたもの
 *
 * 古いほうを切ると、まだシートに写真が無い団体（c054 など）がサイトから消える。
 * アイコンと写真は別々に判定する。写真だけ新しくなっている団体があるため。
 */
export function mergePhotoSources(
  fresh: PhotoSet,
  legacy: PhotoSet | undefined
): { icon: string | null; photos: string[]; usesLegacyPhotos: boolean; usesLegacyIcon: boolean } {
  const usesLegacyPhotos = fresh.photos.length === 0 && (legacy?.photos.length ?? 0) > 0;
  const usesLegacyIcon = fresh.icon === null && Boolean(legacy?.icon);
  return {
    icon: fresh.icon ?? legacy?.icon ?? null,
    photos: (fresh.photos.length > 0 ? fresh.photos : (legacy?.photos ?? [])).slice(0, MAX_PHOTOS),
    usesLegacyPhotos,
    usesLegacyIcon,
  };
}

export type PhotoEntry = {
  icon: string | null;
  photos: string[];
  /** この団体のファイル配置に関する警告。sync が団体IDを付けてレポートに出す */
  warnings: string[];
};

export type PhotoIndex = {
  byId: Map<string, PhotoEntry>;
  /** 走査したファイル数（@600 を含む） */
  fileCount: number;
};

const PHOTO_RE = /^(c\d{3})-(\d+)\.webp$/;
const ICON_RE = /^(c\d{3})-icon\.webp$/;

export function scanPhotos(dir: string): PhotoIndex {
  const byId = new Map<string, PhotoEntry>();
  if (!existsSync(dir)) return { byId, fileCount: 0 };

  const files = readdirSync(dir);
  const fileSet = new Set(files);
  const numbered = new Map<string, { n: number; file: string }[]>();

  for (const file of files) {
    const icon = ICON_RE.exec(file);
    if (icon) {
      entry(byId, icon[1]).icon = file;
      continue;
    }
    // @600 は数えない。1200 のほうだけを正とする
    const photo = PHOTO_RE.exec(file);
    if (!photo) continue;
    const list = numbered.get(photo[1]) ?? [];
    list.push({ n: Number(photo[2]), file });
    numbered.set(photo[1], list);
  }

  for (const [id, list] of numbered) {
    list.sort((a, b) => a.n - b.n);
    const e = entry(byId, id);
    const kept = list.slice(0, MAX_PHOTOS);
    e.photos = kept.map((x) => x.file);
    if (list.length > MAX_PHOTOS) {
      e.warnings.push(`写真が${list.length}枚。${MAX_PHOTOS + 1}枚目以降の${list.length - MAX_PHOTOS}枚は無視した`);
    }
    // 連番が飛んでいる（c054-2.webp が無いのに c054-3.webp がある）
    kept.forEach((x, i) => {
      if (x.n !== i + 1) e.warnings.push(`写真の連番が飛んでいる（${x.file} は ${i + 1} 番目）`);
    });
    // @600 が無いと一覧のサムネが404になる
    for (const x of kept) {
      const small = x.file.replace(/\.webp$/, "@600.webp");
      if (!fileSet.has(small)) e.warnings.push(`${small} が無い（一覧のサムネが読めない）`);
    }
  }

  return { byId, fileCount: files.length };
}

function entry(byId: Map<string, PhotoEntry>, id: string): PhotoEntry {
  let e = byId.get(id);
  if (!e) {
    e = { icon: null, photos: [], warnings: [] };
    byId.set(id, e);
  }
  return e;
}
