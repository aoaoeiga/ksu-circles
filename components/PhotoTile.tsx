"use client";

// 一覧の写真タイル。移植元の photoLayer / thumbStyle / veil / nameStyle をまとめたもの。
//
// 写真がない団体を欠落に見せない（CLAUDE.md §6）。
// ジャンル色のベタ塗りに団体名を大きく組む。「No Image」「準備中」と書かない。
// **読み込みに失敗したときも同じタイルに落とす**ので、失敗の判定を持つ必要があり client。

import { useState } from "react";
import type { Circle } from "@/types/circle";
import { EASE, PHOTO, genreColor, photoSrc } from "@/lib/design";

type Props = {
  circle: Circle;
  /** 移植元は写真の有無で名前の大きさを変える（一覧カードは 22 / 26）。表紙は同じ値を渡す */
  nameSize: number;
  nameSizeNoPhoto: number;
  namePadding: number;
  /** 表紙タイルは名前が veil の上、一覧カードは z-index 2。移植元の差をそのまま持つ */
  nameZIndex?: number;
  veilOpacity: number;
  priority?: boolean;
};

export default function PhotoTile({
  circle,
  nameSize,
  nameSizeNoPhoto,
  namePadding,
  nameZIndex,
  veilOpacity,
  priority,
}: Props) {
  const [failed, setFailed] = useState(false);

  const file = circle.icon ?? circle.photos[0] ?? null;
  const hasPhoto = !!file && !failed;

  return (
    <>
      <div
        data-photo="1"
        style={{
          position: "absolute",
          inset: 0,
          background: hasPhoto ? PHOTO : genreColor(circle.genre),
          filter: hasPhoto ? "brightness(0.86) saturate(0.96)" : "brightness(0.92)",
          transition: "filter 260ms " + EASE + ", transform 260ms " + EASE,
          cursor: "pointer",
        }}
      >
        {file && !failed && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photoSrc(file, "thumb")}
            alt=""
            width={600}
            height={400}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            onError={() => setFailed(true)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        )}
      </div>

      <div
        style={
          hasPhoto
            ? {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "55%",
                pointerEvents: "none",
                backgroundImage: `linear-gradient(to top, rgba(0,0,0,${veilOpacity}), rgba(0,0,0,0))`,
              }
            : { display: "none" }
        }
      />

      <div
        style={{
          position: "relative",
          zIndex: nameZIndex,
          pointerEvents: "none",
          width: "100%",
          padding: namePadding,
          fontFamily: "var(--font-zen), sans-serif",
          fontWeight: 700,
          fontSize: hasPhoto ? nameSize : nameSizeNoPhoto,
          lineHeight: 1.36,
          letterSpacing: "-0.04em",
          color: "#FFFFFF",
        }}
      >
        {circle.short_name}
      </div>
    </>
  );
}
