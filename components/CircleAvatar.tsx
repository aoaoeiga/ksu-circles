"use client";

import { useState } from "react";
import type { Circle } from "@/types/circle";

const TONES = ["#111111", "#2f2f2f", "#4b4b4b", "#626262", "#777777"];

function toneFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

function initialFor(name: string): string {
  return Array.from(name.trim())[0] ?? "?";
}

export default function CircleAvatar({ circle, size = 44 }: { circle: Circle; size?: number }) {
  const [failed, setFailed] = useState(false);
  const showIcon = Boolean(circle.icon) && !failed;

  return (
    <span
      className="circle-avatar"
      aria-label={showIcon ? undefined : `${circle.short_name}の頭文字`}
      style={{ width: size, height: size, background: toneFor(circle.id), fontSize: size * 0.42 }}
    >
      {showIcon ? (
        // 変換済みWebPをそのまま使う。読み込み失敗時も頭文字へ戻す。
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/photos/${circle.icon}`}
          alt={`${circle.short_name}のアイコン`}
          width={size}
          height={size}
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initialFor(circle.short_name)}</span>
      )}
    </span>
  );
}
