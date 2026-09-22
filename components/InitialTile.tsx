// 写真もアイコンも無い団体のタイル（CLAUDE.md §6 / 要件 4）。
//
// 欠落に見せないことが目的なので「No Image」「準備中」とは書かない。
// ジャンル色のベタ塗りに、通称の頭文字を1文字だけ大きく置く。
//
// 文字の大きさは cqmin（＝箱の短いほうの1%）で決める。
// 一覧のタイルでも詳細の全画面でも同じ見え方になり、
// タイル→詳細の拡大の途中でも文字が箱と一緒に育つ。

import type { Circle } from "@/types/circle";
import { genreColor } from "@/lib/design";

/** 通称の先頭1文字。絵文字や結合文字でも1文字として数える */
function initialOf(name: string): string {
  return Array.from(name.trim())[0] ?? "?";
}

export default function InitialTile({ circle }: { circle: Circle }) {
  return (
    // 団体名は一覧でも詳細でも別に出ている。ここは飾りなので読み上げない
    <div
      className="initial-tile"
      style={{ background: genreColor(circle.genre) }}
      aria-hidden="true"
    >
      <span className="initial-tile__char">{initialOf(circle.short_name)}</span>
    </div>
  );
}
