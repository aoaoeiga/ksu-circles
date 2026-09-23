// 掲載データの読み込み口。画面からは必ずここを通す。
//
// data/circles.json は npm run sync が生成する中間生成物。手で編集しない（CLAUDE.md §1）。
// ビルド時に import するだけで、fetch もデータベースも使わない（docs/12-deploy-spec.md §3）。
//
// 将来データの出どころが Supabase に変わっても、circles.json の「形」は変えない。
// 差し替えるのはこのファイルの中だけで、画面には手を入れない。

import type { Circle, CircleFile } from "@/types/circle";
import file from "@/data/circles.json";

// JSON import の推論結果に、ここで一度だけ型を当てる。形の保証は sync 側の責任。
const data = file as unknown as CircleFile;

/**
 * ビルドに含める全団体。確認用ページ（listed: false）も入る。並び順は circles.json のまま（＝シートの行順）。
 * **一覧には listedCircles を使う。**こちらを一覧に渡すと、掲載前の団体が出てしまう
 */
export const circles: Circle[] = data.circles;

/** 一覧に出す団体（公開可否 = OK）。確認用ページの団体は含まない */
export const listedCircles: Circle[] = circles.filter((c) => c.listed);

/** c001 形式のIDで1件引く。存在しなければ undefined（呼び出し側で notFound()） */
export function getCircle(id: string): Circle | undefined {
  return circles.find((c) => c.id === id);
}

/** generateStaticParams 用。確認用ページも含む全ID（URL を直接開けば見られるようにするため） */
export function allCircleIds(): string[] {
  return circles.map((c) => c.id);
}
