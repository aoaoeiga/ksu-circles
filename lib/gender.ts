/**
 * 男子の割合（%）を、合計10の比率に丸めて表示用の文字列にする。
 *
 * ルール（要件定義 §5 / docs/ui/07-content.md §4-1）
 * - 合計が必ず10になる
 * - 1%でもいれば0にしない
 * - 0%なら "女子のみ"、100%なら "男子のみ"
 * - 未確認は null
 *
 * 一覧と詳細の両方からこの関数を呼ぶ。片方だけ独自実装しない。
 */
export function genderRatio(maleRatio: number | null | undefined): string | null {
  if (maleRatio === null || maleRatio === undefined) return null;
  if (!Number.isFinite(maleRatio) || maleRatio < 0 || maleRatio > 100) return null;
  if (maleRatio === 0) return "女子のみ";
  if (maleRatio === 100) return "男子のみ";

  let m = Math.round(maleRatio / 10);
  if (m < 1) m = 1;
  if (m > 9) m = 9;
  return `${m} : ${10 - m}`;
}

/** 年会費。0=無料、null=未確認。混同すると未確認が無料に見える */
export function feeLabel(fee: number | null | undefined): string {
  if (fee === null || fee === undefined) return "—";
  return "¥" + fee.toLocaleString("ja-JP");
}

/** 数値カード。null は棒線 */
export function numLabel(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : String(n);
}

/** 0=月 … 6=日。曜日の表記はここ1か所。一覧のセルも詳細の活動日カードもこれを読む */
export const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

/** "月・木" の形。未確認は null を返す（呼び出し側で「活動日 未確認」を出す） */
export function daysLabel(days: number[] | null | undefined): string | null {
  if (!days || days.length === 0) return null;
  return [...days].sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join("・");
}

/** "18:00–20:00" / 曜日で違えば "月 18:00–20:00 ／ 木 19:00–21:00"。未確認は null */
export function timesLabel(
  days: number[] | null | undefined,
  times: Record<string, [string, string]> | null | undefined
): string | null {
  if (!days || days.length === 0 || !times) return null;
  const sorted = [...days].sort((a, b) => a - b);
  const entries = sorted.map((d) => times[String(d)]).filter(Boolean);
  if (entries.length === 0) return null;

  const allSame = entries.every(
    (t) => t[0] === entries[0][0] && t[1] === entries[0][1]
  );
  if (allSame && entries.length === sorted.length) {
    return `${entries[0][0]}–${entries[0][1]}`;
  }
  return sorted
    .filter((d) => times[String(d)])
    .map((d) => `${DAY_LABELS[d]} ${times[String(d)][0]}–${times[String(d)][1]}`)
    .join(" ／ ");
}
