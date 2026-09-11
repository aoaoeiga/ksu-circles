// 画面に出す文字列の組み立て。
//
// **丸めの実装はここに書かない。**必ず lib/gender.ts の関数を通す（CLAUDE.md 共通関数）。
// このファイルがやるのは「通した結果に単位や接頭辞を足す」ことと、
// 未確認をどう言い換えるかの一元管理だけ。
//
// 未確認の出しかた（docs/ui/07-content.md §4-3）
// - 数字カードの**中**は `—`  … feeLabel / numLabel が返し、genderRatio の null は呼び出し側で変換する
// - カードの**外**は文字で `未確認` … このファイルの *Text() が付ける

import type { Circle } from "@/types/circle";
import { feeLabel, numLabel } from "@/lib/gender";

/** 一覧カードの年会費。`¥0` と `未確認` を混同しない（CLAUDE.md §4） */
export function feeText(c: Circle): string {
  if (c.annual_fee === null) return "未確認";
  return feeLabel(c.annual_fee) + "/年";
}

/** 一覧カードの人数 */
export function membersText(c: Circle): string {
  if (c.member_count === null) return "人数 未確認";
  return numLabel(c.member_count) + "人";
}

/** 掛け持ちの状況。回答文字列をそのまま出し、null は未確認にする */
export function multiText(c: Circle): string {
  return c.multi_club ?? "未確認";
}

/** 参加の緩さ。null は未確認 */
export function easeText(c: Circle): string {
  return c.ease ?? "未確認";
}

/** 先輩の呼び方。null は未確認 */
export function seniorCallText(c: Circle): string {
  return c.senior_call ?? "未確認";
}

/** 区分。大分類 ・ 公式の所属区分（docs/ui/07-content.md §1） */
export function divisionText(c: Circle): string {
  return c.division + " ・ " + c.category;
}

/** "2026-09-02" → "2026年9月2日 取材"。旧形式の "2026-09" も読める */
export function surveyedText(surveyedAt: string): string {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(surveyedAt);
  if (day) return `${day[1]}年${Number(day[2])}月${Number(day[3])}日 取材`;
  const month = /^(\d{4})-(\d{2})$/.exec(surveyedAt);
  if (month) return `${month[1]}年${Number(month[2])}月 取材`;
  return surveyedAt ? `${surveyedAt} 取材` : "取材日 未確認";
}

/**
 * 新歓バッジの状態。
 *
 * ★移植元との違い。Design は `RECRUIT[id] || "募集していない"` で、**未確認が「募集していない」に
 * 化けていた。**本番は `recruiting: Recruiting | null` なので、null は `未確認` として出す。
 */
export function recruitingLabel(c: Circle): string {
  return c.recruiting ?? "未確認";
}
