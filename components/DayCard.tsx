"use client";

import { useSearchParams } from "next/navigation";
import type { Circle } from "@/types/circle";
import { DAY_ORDER } from "@/lib/design";
import { DAY_LABELS } from "@/lib/gender";
import { easeText, multiText, seniorCallText } from "@/lib/labels";

export function DayCardStatic({ circle }: { circle: Circle }) {
  return <Card circle={circle} matched={[]} />;
}

export default function DayCard({ circle }: { circle: Circle }) {
  const params = useSearchParams();
  const selected = (params.get("days") ?? "")
    .split(",")
    .map(Number)
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  return <Card circle={circle} matched={circle.active_days.filter((day) => selected.includes(day))} />;
}

function Card({ circle, matched }: { circle: Circle; matched: number[] }) {
  const rows = [
    ["活動頻度", circle.frequency ?? "未確認"],
    ["活動場所", circle.place ?? "未確認"],
    ["掛け持ちの状況", multiText(circle)],
    ["参加の緩さ", easeText(circle)],
    ["先輩の呼び方", seniorCallText(circle)],
  ];
  const hasDays = circle.active_days.length > 0;

  return (
    <div className="activity-card">
      <div className="activity-card__days">
        <div className="activity-card__label">活動日</div>
        {hasDays ? (
          <div className="weekday-row" aria-label={`活動日: ${circle.active_days.map((day) => DAY_LABELS[day]).join("・")}`}>
            {DAY_ORDER.map((day) => {
              const active = circle.active_days.includes(day);
              const isMatch = matched.includes(day);
              return <span key={day} className={`${active ? "is-active" : ""} ${isMatch ? "is-match" : ""}`}>{DAY_LABELS[day]}</span>;
            })}
          </div>
        ) : (
          <strong>{circle.days_undecided ? "不定期" : "活動日 未確認"}</strong>
        )}
      </div>
      <dl className="activity-facts">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
