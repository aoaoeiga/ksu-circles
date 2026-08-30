// 掲載データの読み込み口。画面からは必ずここを通す。
//
// data/circles.json は npm run sync が生成する中間生成物。手で編集しない（CLAUDE.md §1）。
// ビルド時に import するだけで、fetch もデータベースも使わない（docs/12-deploy-spec.md §3）。
//
// 将来データの出どころが Supabase に変わっても、circles.json の「形」は変えない。
// 差し替えるのはこのファイルの中だけで、画面には手を入れない。

import type { Circle, CircleFile } from "@/types/circle";
import file from "@/data/circles.json";

// JSON の import は配列リテラルをタプルに推論しない（active_times の [string, string] が
// string[] になる）ので、ここで一度だけ型を当てる。形の保証は sync 側の責任。
const data = file as unknown as CircleFile;

/** 公開対象の全団体。並び順は circles.json のまま（＝シートの行順） */
export const circles: Circle[] = data.circles;

/** c001 形式のIDで1件引く。存在しなければ undefined（呼び出し側で notFound()） */
export function getCircle(id: string): Circle | undefined {
  return circles.find((c) => c.id === id);
}

/** generateStaticParams 用。公開対象の全ID */
export function allCircleIds(): string[] {
  return circles.map((c) => c.id);
}
