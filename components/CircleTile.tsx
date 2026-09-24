"use client";

import { useState } from "react";
import type { Circle } from "@/types/circle";
import InitialTile from "@/components/InitialTile";
import { genreColor, photoSrc, photoSrcSet } from "@/lib/design";
import type { TileShape } from "@/lib/tile-layout";

/**
 * タイルが画面で占める幅。app/globals.css の .circle-grid に合わせる
 * （スマホは2列、768px 以上は最大 960px の4列。wide / large は2列ぶん）
 */
const SIZES: Record<TileShape, string> = {
  square: "(min-width: 960px) 240px, (min-width: 768px) 25vw, 50vw",
  wide: "(min-width: 960px) 480px, (min-width: 768px) 50vw, 100vw",
  large: "(min-width: 960px) 480px, (min-width: 768px) 50vw, 100vw",
};

export default function CircleTile({
  circle,
  shape,
  priority = false,
}: {
  circle: Circle;
  shape: TileShape;
  /** 最初の画面に入るタイル。遅延読み込みにしない（LCP を遅らせないため） */
  priority?: boolean;
}) {
  const [sourceIndex, setSourceIndex] = useState(0);
  // 詳細ヒーローと同じ写真を優先し、写真がない団体だけアイコンを使う。
  const sources = [circle.photos[0], circle.icon].filter(
    (file, index, all): file is string => Boolean(file) && all.indexOf(file) === index
  );
  const file = sources[sourceIndex] ?? null;
  const hasImage = file !== null;

  return (
    // data-shared-image は詳細ヒーローとの行き来で位置を測るための印（lib/flip.ts）
    <div
      data-shared-image={circle.id}
      className="circle-tile__media"
      style={{ background: genreColor(circle.genre) }}
    >
      {file ? (
        // 変換済みWebPをそのまま使う。読み込み失敗時は頭文字へ戻す。
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoSrc(file, "thumb")}
          srcSet={photoSrcSet(file)}
          sizes={SIZES[shape]}
          alt=""
          width={600}
          height={400}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          onError={() => setSourceIndex((index) => index + 1)}
        />
      ) : (
        <InitialTile circle={circle} />
      )}

      <div className="circle-tile__gradient" />
      <div className="circle-tile__copy">
        <div className="circle-tile__name">{circle.short_name}</div>
        {shape === "large" && <div className="circle-tile__tagline">{circle.one_liner}</div>}
      </div>
      {!hasImage && <span className="sr-only">画像なし</span>}
    </div>
  );
}
