// 画面に出す文字列の組み立て。
//
// **丸めの実装はここに書かない。**必ず lib/gender.ts の関数を通す（CLAUDE.md 共通関数）。
// このファイルがやるのは「通した結果に単位や接頭辞を足す」ことと、
// 未確認をどう言い換えるかの一元管理だけ。
//
// 未確認の出しかた（docs/ui/07-content.md §4-3）
// - 数字カードの**中**は `—`  … feeLabel / numLabel / genderRatio がそのまま返す
// - カードの**外**は文字で `未確認` … このファイルの *Text() が付ける

import type { Circle } from "@/types/circle";
import { feeLabel, numLabel, timesLabel } from "@/lib/gender";

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

/**
 * 掛け持ち。値は "できる" / "できない" / 条件文 / null（未確認）。
 * null を「できない」に落とさない（未確認と拒否は別物）。
 */

/** 一覧カード。1行に収める必要があるので、条件文は出さず「条件つき」に畳む */
export function multiText(c: Circle): string {
  const v = c.multi_club_ok;
  if (v === null || v === undefined) return "掛け持ち 未確認";
  if (v === "できる") return "掛け持ちできる";
  if (v === "できない") return "掛け持ちできない";
  return "掛け持ち 条件つき";
}

/**
 * 活動日カード下段（docs/ui/07-content.md §3）。
 * **こちらは条件文をそのまま出す。**一覧で畳んだ内容を確かめる場所がここしかない。
 */
export function multiDualText(c: Circle): string {
  const v = c.multi_club_ok;
  if (v === null || v === undefined) return "掛け持ち 未確認";
  if (v === "できる") return "掛け持ち できる";
  if (v === "できない") return "掛け持ち できない";
  return "掛け持ち " + v;
}

/** 活動場所 ・ 掛け持ち の1行 */
export function placeDualText(c: Circle): string {
  return (c.place || "活動場所 未確認") + " ・ " + multiDualText(c);
}

/** 活動時間。曜日ごとに違えば timesLabel が並べて返す */
export function timeText(c: Circle): string | null {
  return timesLabel(c.active_days, c.active_times);
}

/**
 * 年会費以外にかかる金（docs/ui/07-content.md §4-2）。
 *
 * ★移植元との違い。Design は `note ? "別途："+note : "かかる費用はありません。"` の2分岐で、
 * **未確認が「費用なし」に化けていた。**本番の型は `"なし"`=確認済みで無い / `null`=聞けていない
 * を区別する（types/circle.ts, docs/13-schema-mapping.md §5）ので3分岐にする。
 */
export function extraCostText(c: Circle): string {
  if (c.extra_cost_note === null || c.extra_cost_note === undefined) {
    return "年会費以外の費用 未確認";
  }
  if (c.extra_cost_note === "なし") return "年会費のほかにかかる費用はありません。";
  return "別途：" + c.extra_cost_note;
}

/** 区分。大分類 ・ 公式の所属区分（docs/ui/07-content.md §1） */
export function divisionText(c: Circle): string {
  return c.division + " ・ " + c.category;
}

/** "2026-09" → "2026年9月 取材"（docs/ui/07-content.md §8） */
export function surveyedText(surveyedAt: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(surveyedAt);
  if (!m) return surveyedAt + " 取材";
  return `${m[1]}年${Number(m[2])}月 取材`;
}

/** "2026-10-02" → "2026.10.02" */
export function recruitDateText(date: string | null | undefined): string | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  return `${m[1]}.${m[2]}.${m[3]}`;
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
