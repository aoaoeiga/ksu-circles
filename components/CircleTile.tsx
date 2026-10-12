"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { Circle } from "@/types/circle";
import InitialTile from "@/components/InitialTile";
import { DAY_LABELS, feeLabel } from "@/lib/gender";
import { genreColor, photoSrc, photoSrcSet } from "@/lib/design";

export default function CircleTile({
  circle,
  priority = false,
}: {
  circle: Circle;
  priority?: boolean;
}) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [pressed, setPressed] = useState(false);
  // 一覧は icon が正。読み込み失敗時だけ photos[0]、最後に頭文字へ落とす。
  const sources = [circle.icon, circle.photos[0]].filter(
    (file, index, all): file is string => Boolean(file) && all.indexOf(file) === index
  );
  const file = sources[sourceIndex] ?? null;
  const days = circle.days_undecided
    ? "不定期"
    : circle.active_days.length
      ? circle.active_days.map((day) => DAY_LABELS[day]).join("・")
      : "活動日 未確認";

  return (
    <article className="directory-card">
      <motion.div
        layoutId={`circle-media-${circle.id}`}
        className={`directory-card__media ${pressed ? "is-pressed" : ""}`}
        style={{ background: genreColor(circle.genre) }}
        transition={{ type: "spring", stiffness: 300, damping: 34, mass: 0.8 }}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
      >
        {file ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc(file, "thumb")}
            srcSet={photoSrcSet(file)}
            sizes="(min-width: 1100px) 30vw, (min-width: 720px) 45vw, 100vw"
            alt={`${circle.short_name}の活動写真`}
            width={600}
            height={400}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            onError={() => setSourceIndex((index) => index + 1)}
            style={pressed ? { filter: "saturate(1) brightness(1.06)" } : undefined}
          />
        ) : (
          <InitialTile circle={circle} />
        )}
        <span className="directory-card__genre">{circle.genre}</span>
      </motion.div>

      <div className="directory-card__body">
        <div className="directory-card__category">{circle.category}</div>
        <h3 className="directory-card__name">{circle.short_name}</h3>
        <p className="directory-card__tagline">{circle.one_liner}</p>
        <dl className="directory-card__facts">
          <div>
            <dt>活動日</dt>
            <dd>{days}</dd>
          </div>
          <div>
            <dt>活動場所</dt>
            <dd>{circle.place ?? "未確認"}</dd>
          </div>
          <div>
            <dt>年会費</dt>
            <dd>{feeLabel(circle.annual_fee)}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
