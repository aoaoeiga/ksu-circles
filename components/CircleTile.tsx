"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { Circle } from "@/types/circle";
import CircleAvatar from "@/components/CircleAvatar";
import { genreColor, photoSrc } from "@/lib/design";
import type { TileShape } from "@/lib/tile-layout";

export default function CircleTile({ circle, shape }: { circle: Circle; shape: TileShape }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  // 詳細ヒーローと同じ写真を優先し、写真がない団体だけアイコンを使う。
  const sources = [circle.photos[0], circle.icon].filter(
    (file, index, all): file is string => Boolean(file) && all.indexOf(file) === index
  );
  const file = sources[sourceIndex] ?? null;
  const hasImage = file !== null;

  return (
    <motion.div
      layoutId={`circle-image-${circle.id}`}
      className="circle-tile__media"
      style={{ background: genreColor(circle.genre) }}
      transition={{ type: "spring", stiffness: 240, damping: 28 }}
    >
      {file ? (
        // 変換済みWebPをそのまま使う。読み込み失敗時は頭文字へ戻す。
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoSrc(file, "thumb")}
          alt=""
          width={600}
          height={400}
          loading="lazy"
          onError={() => setSourceIndex((index) => index + 1)}
        />
      ) : (
        <div className="circle-tile__fallback">
          <CircleAvatar circle={{ ...circle, icon: null }} size={shape === "large" ? 88 : 60} />
        </div>
      )}

      <div className="circle-tile__gradient" />
      <div className="circle-tile__copy">
        <div className="circle-tile__name">{circle.short_name}</div>
        {shape === "large" && <div className="circle-tile__tagline">{circle.one_liner}</div>}
      </div>
      {!hasImage && <span className="sr-only">画像なし</span>}
    </motion.div>
  );
}
