// 書体。next/font で読み、自サイトから配る（Google Fonts の CSS を読みにいかない）。
//
// これまでは app/layout.tsx の <link> で Google Fonts の CSS を読んでいた。
// その CSS（4ファミリ・約119KB）を読み終わるまで何も描かれず、FCP が 6〜8秒になっていた
// （docs/ui-audit-2026-09-24.md F1）。
//
// 書体・太さは移植元（design/ksu-circles-v3.dc.html の <helmet>）と同じ。変えない。
// next/font は書体名を生成名に変えるので、画面側は名前ではなく CSS 変数で指定する。
//   var(--font-zen)        Zen Kaku Gothic New 700  見出し・団体名
//   var(--font-noto)       Noto Sans JP 400/500     本文（400）、ラベル・ボタン（500）
//   var(--font-schibsted)  Schibsted Grotesk 700    英字の見出し（CIRCLES / NUMBERS …）
//   var(--font-outfit)     Outfit 500               数字（件数・金額・人数）
//
// **読み込むのは、実際に描いている太さだけ。**移植元の <link> は Zen 500・Outfit 400/600 も読んでいたが、
// 全画面の文字を調べて一度も使われていなかった（2026-09-24）。日本語の書体は太さ1つで約120個の
// @font-face になり、その CSS が描画を止めるので、使わない太さを書くだけで表示が遅れる。
// 太さを足すときは、ここにも足す（無い太さは、ブラウザが太字を合成して見た目が変わる）。
//
// preload するのは Schibsted 700 の英字だけ。一覧で最初に大きく描く「CIRCLES」を、
// 日本語の書体を待たずに本来の書体で描くため。日本語の2つは分割ファイルが多いので preload しない
// （表示に要る分だけ読まれる）。Outfit も最初の画面で目立たないので preload しない。

import { Noto_Sans_JP, Outfit, Schibsted_Grotesk, Zen_Kaku_Gothic_New } from "next/font/google";

export const zen = Zen_Kaku_Gothic_New({
  weight: "700",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-zen",
});

export const noto = Noto_Sans_JP({
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-noto",
});

export const schibsted = Schibsted_Grotesk({
  weight: "700",
  // 英字（latin）だけを preload する。CIRCLES などの見出しは英字しか使わない
  subsets: ["latin"],
  preload: true,
  display: "swap",
  variable: "--font-schibsted",
});

export const outfit = Outfit({
  weight: "500",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-outfit",
});

/** <html> に付けるクラス。4つの CSS 変数を定義する */
export const fontVariables = [zen.variable, noto.variable, schibsted.variable, outfit.variable].join(" ");
