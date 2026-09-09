"use client";

// 活動日カード（docs/ui/07-content.md §3）。数字カードと同じ枠・角丸・影で、幅だけ全幅。
//
// **一覧で選んだ曜日と一致した曜日だけを山吹にする。**山吹はここ以外で使わない（CLAUDE.md §5）。
// 選んだ曜日はURL（?days=）から読む。サーバーで読むとページが動的になるので client 側で読み、
// 呼び出し側で Suspense に包む（docs/14-nextjs-notes.md §2）。

import { useSearchParams } from "next/navigation";
import type { Circle } from "@/types/circle";
import { CARD, EASE, EYEBROW, INK, INK_MID, MATCH, RULE } from "@/lib/design";
import { DAY_LABELS } from "@/lib/gender";
import { easeText, multiText, seniorCallText } from "@/lib/labels";

const big = (color: string) => ({
  fontFamily: "'Zen Kaku Gothic New',sans-serif",
  fontWeight: 700,
  fontSize: 30,
  lineHeight: 1.25,
  letterSpacing: "-0.02em",
  color,
  transition: "color 240ms " + EASE,
});

/** 曜日の一致を反映しない素の状態。Suspense の fallback に使う */
export function DayCardStatic({ circle }: { circle: Circle }) {
  return <Card circle={circle} matched={[]} />;
}

export default function DayCard({ circle }: { circle: Circle }) {
  const sp = useSearchParams();
  const raw = sp.get("days");
  const selected = raw
    ? raw
        .split(",")
        .map((s) => Number(s))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : [];
  const matched = circle.active_days.filter((d) => selected.indexOf(d) >= 0);
  return <Card circle={circle} matched={matched} />;
}

function Card({ circle, matched }: { circle: Circle; matched: number[] }) {
  const days = [...circle.active_days].sort((a, b) => a - b);
  const rows = [
    ["活動頻度", circle.frequency ?? "未確認"],
    ["活動場所", circle.place ?? "未確認"],
    ["掛け持ちの状況", multiText(circle)],
    ["参加の緩さ", easeText(circle)],
    ["先輩の呼び方", seniorCallText(circle)],
  ];

  return (
    <div style={{ ...CARD, marginTop: 20 }}>
      <div style={EYEBROW}>活動日</div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", marginTop: 12 }}>
        {days.length === 0 ? (
          // 未確認でも 30px のまま出す。小さくして誤魔化さない（docs/ui/07-content.md §3）
          <div style={big(INK_MID)}>活動日 未確認</div>
        ) : (
          days.map((d, n) => (
            <span key={d} style={{ display: "contents" }}>
              <div style={big(matched.indexOf(d) >= 0 ? MATCH : INK)}>{DAY_LABELS[d]}</div>
              {n < days.length - 1 && <div style={big(INK_MID)}>・</div>}
            </span>
          ))
        )}
      </div>

      <div style={{ height: 1, background: RULE, margin: "16px 0 0" }} />
      {rows.map(([label, value]) => (
        <div key={label} style={{ fontSize: 13, color: INK_MID, marginTop: 14, lineHeight: 1.7 }}>
          {label} {value}
        </div>
      ))}
    </div>
  );
}
