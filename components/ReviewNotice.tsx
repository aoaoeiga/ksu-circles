// 掲載前の確認用ページ（circle.listed === false）の上部に出す帯。
//
// 一覧には出さず、URL を直接開いたときだけ見られるページであることを、団体側に伝える。
// ヒーローは全画面なので、画面の上端に固定する。左上の戻るボタン（left 20〜64px）と
// スクロールで降りてくるバー（zIndex 12）を隠さないよう、中央に小さく置いて一段上に重ねる。
// 色は docs/12-deploy-spec.md §5 の「ink 地」。山吹は「一致」専用なので使わない（CLAUDE.md §5）。

import { INK, WHITE } from "@/lib/design";

export default function ReviewNotice() {
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 14,
        left: 0,
        right: 0,
        zIndex: 13,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          padding: "6px 14px",
          borderRadius: 999,
          background: INK,
          color: WHITE,
          fontSize: 12,
          letterSpacing: "0.02em",
          boxShadow: "0 2px 10px rgba(0,0,0,.18)",
        }}
      >
        掲載前の確認用ページです
      </div>
    </div>
  );
}
