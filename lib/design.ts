// Claude Design（design/ksu-circles-v3.dc.html）から持ち込んだ設計トークン。
// 値は移植元そのまま。**勝手に別のCSS体系へ書き換えない**（CLAUDE.md 技術構成）。
//
// 移植元でクラスのプロパティになっていたもの（EASE / SHADOW / GENRE_COLORS / num など）を
// ここに集約した。一覧と詳細の両方から読む。

import type { Category, Genre } from "@/types/circle";
import type { CSSProperties } from "react";

/** 移植元の色。名前は docs/ui/06-design-reference.md の呼び名に合わせた */
export const INK = "#14213A";
export const INK_MID = "#6B7484";
export const BG = "#EFEFEB";
export const RULE = "#E2E2DB";
export const WHITE = "#FFFFFF";
export const DARK = "#1B1A18";
export const PHOTO = "#40434A";

/** 山吹。「一致」にしか使わない（CLAUDE.md §5）。ボタン・リンク・装飾に流用しない */
export const MATCH = "#E8A33D";

export const EASE = "cubic-bezier(0.16,1,0.3,1)";
export const SHADOW = "0 1px 2px rgba(20,33,58,.04), 0 10px 28px rgba(20,33,58,.06)";

/**
 * 曜日の並び。
 *
 * ★移植元との違い。Design のダミーは 0=日曜（JSのDate準拠）で `DAY_ORDER = [1,2,3,4,5,6,0]`
 * だった。本番の型は `0=月 … 6=日`（types/circle.ts）なので、そのまま 0..6 が月〜日になる。
 * 画面に出る並び（月→日）は移植元と同じ。
 */
export const DAY_ORDER = [0, 1, 2, 3, 4, 5, 6];

/** ジャンル色。写真がない団体のベタ塗りに使う（CLAUDE.md §6） */
export const GENRE_COLORS: Record<Genre, string> = {
  球技: "#1F7A5A",
  武道: "#363B45",
  音楽: "#3A55A8",
  "文化・創作": "#6E4A8E",
  ボランティア: "#147C86",
  その他: "#6B665E",
};

export function genreColor(g: Genre): string {
  return GENRE_COLORS[g] ?? GENRE_COLORS["その他"];
}

/** 絞り込みの選択肢。types/circle.ts の union をそのまま並べる */
export const CATS: Category[] = [
  "体育会所属クラブ",
  "文化団体連盟",
  "届出団体",
  "学生プロジェクトチーム",
  "委員会・その他",
];

export const GENRES: Genre[] = [
  "球技",
  "武道",
  "音楽",
  "文化・創作",
  "ボランティア",
  "その他",
];

export const FEES = ["0円", "〜3,000円", "〜10,000円", "10,000円〜", "指定なし"] as const;
export type FeeChoice = (typeof FEES)[number];
export const FEE_ANY: FeeChoice = "指定なし";

/** 数字の書体。移植元の num() */
export function num(size: number, color?: string): CSSProperties {
  return {
    fontFamily: "Outfit, sans-serif",
    fontWeight: 500,
    fontVariantNumeric: "tabular-nums",
    fontSize: size,
    color: color || INK,
  };
}

/** 一覧の曜日セル。match（山吹）は「選んだ曜日と一致」のときだけ */
export type CellKind = "match" | "on" | "hatch" | "off";

export function cellStyle(kind: CellKind, i: number): CSSProperties {
  const base: CSSProperties = {
    width: 26,
    height: 26,
    boxSizing: "border-box",
    clipPath:
      "polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px), 0 3px)",
    transition: "background-color 200ms " + EASE,
    transitionDelay: i * 40 + "ms",
  };
  if (kind === "match") return { ...base, backgroundColor: MATCH };
  if (kind === "on") return { ...base, backgroundColor: INK };
  if (kind === "hatch")
    return {
      ...base,
      border: "1px solid " + RULE,
      backgroundImage:
        "repeating-linear-gradient(45deg," + RULE + " 0px," + RULE + " 1px,transparent 1px,transparent 5px)",
    };
  return { ...base, border: "1px solid " + RULE };
}

/** 絞り込みシートのチップ */
export function chipStyle(active: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "10px 14px",
    minHeight: 44,
    fontSize: 13,
    cursor: "pointer",
    borderRadius: 999,
    background: active ? INK : WHITE,
    color: active ? WHITE : INK,
    boxShadow: active ? "none" : "inset 0 0 0 1px " + RULE,
  };
}

export function switchTrack(on: boolean): CSSProperties {
  return {
    width: 48,
    height: 28,
    borderRadius: 999,
    background: on ? INK : WHITE,
    boxShadow: on ? "none" : "inset 0 0 0 1px " + RULE,
    display: "flex",
    alignItems: "center",
    padding: 3,
    justifyContent: on ? "flex-end" : "flex-start",
    transition: "background 200ms " + EASE,
  };
}

export function switchKnob(on: boolean): CSSProperties {
  return { width: 20, height: 20, borderRadius: 999, background: on ? WHITE : RULE };
}

export const BIG_BTN: CSSProperties = {
  height: 54,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  background: DARK,
  color: WHITE,
  cursor: "pointer",
  borderRadius: 999,
  fontFamily: "'Noto Sans JP',sans-serif",
  fontWeight: 500,
  fontSize: 14,
  letterSpacing: "0.02em",
  boxShadow: SHADOW,
};

/** 白いカード。活動日カード・数字カード・ABOUT で使い回す（docs/ui/07-content.md §3） */
export const CARD: CSSProperties = {
  background: WHITE,
  borderRadius: 16,
  padding: 20,
  boxShadow: SHADOW,
};

/** セクション見出しの小さいラベル */
export const EYEBROW: CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.14em",
  fontWeight: 500,
  color: INK_MID,
};

export const SECTION_TITLE: CSSProperties = {
  fontFamily: "'Schibsted Grotesk',sans-serif",
  fontWeight: 700,
  fontSize: 32,
  letterSpacing: "-0.03em",
  lineHeight: 1.1,
  color: INK,
  marginTop: 6,
};

/**
 * 写真のパス。sync が /public/photos に幅1200と @600 を出している。
 * 一覧のサムネは @600、ヒーローは 1200（docs/12-deploy-spec.md §4）。
 */
export function photoSrc(filename: string, size: "full" | "thumb" = "full"): string {
  if (size === "thumb") return "/photos/" + filename.replace(/\.webp$/, "@600.webp");
  return "/photos/" + filename;
}
