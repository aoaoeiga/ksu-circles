"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import type { Circle } from "@/types/circle";
import { genreColor, photoBgSrc, photoSrc, photoSrcSet } from "@/lib/design";
import { divisionText } from "@/lib/labels";
import InitialTile from "@/components/InitialTile";
import { usePrefersReducedMotion } from "@/components/usePrefersReducedMotion";

const FIRST_DELAY = 6000;
const SLIDE_DELAY = 5000;

export default function Hero({ circle }: { circle: Circle }) {
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const drag = useRef<{ x: number; y: number; axis: "x" | "y" | null } | null>(null);
  const [broken, setBroken] = useState<Record<string, true>>({});
  const [slide, setSlide] = useState(0);
  const [autoplay, setAutoplay] = useState(true);

  const files = useMemo(
    () => (circle.photos.length ? circle.photos : circle.icon ? [circle.icon] : []).filter((file) => !broken[file]),
    [circle.icon, circle.photos, broken]
  );
  const index = files.length ? slide % files.length : 0;
  const showCarousel = files.length > 1;

  useEffect(() => {
    clearTimeout(timer.current);
    if (reduced || !autoplay || !showCarousel) return;
    timer.current = setTimeout(
      () => setSlide((current) => (current + 1) % files.length),
      slide === 0 ? FIRST_DELAY : SLIDE_DELAY
    );
    return () => clearTimeout(timer.current);
  }, [autoplay, files.length, reduced, showCarousel, slide]);

  const stopAuto = () => {
    clearTimeout(timer.current);
    setAutoplay(false);
  };

  const goTo = (next: number) => {
    stopAuto();
    if (files.length) setSlide((next + files.length) % files.length);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!showCarousel) return;
    drag.current = { x: event.clientX, y: event.clientY, axis: null };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const state = drag.current;
    if (!state || state.axis === "y") return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
      state.axis = Math.abs(dx) > Math.abs(dy) * 1.4 ? "x" : "y";
      if (state.axis === "x") stopAuto();
    }
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const state = drag.current;
    drag.current = null;
    if (!state || state.axis !== "x") return;
    const dx = event.clientX - state.x;
    if (Math.abs(dx) > Math.min(90, window.innerWidth * 0.18)) goTo(slide + (dx < 0 ? 1 : -1));
  };

  const back = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <section
      className="detail-hero"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { drag.current = null; }}
    >
      <motion.div
        layoutId={`circle-media-${circle.id}`}
        className="detail-hero__media"
        style={{ background: genreColor(circle.genre) }}
        transition={{ type: "spring", stiffness: 300, damping: 34, mass: 0.8 }}
      >
        {!files.length && <InitialTile circle={circle} />}
        {files.map((file, fileIndex) => (
          <div key={file} className={`detail-hero__slide ${fileIndex === index ? "is-active" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="detail-hero__blur"
              src={photoBgSrc(file) ?? photoSrc(file, "thumb")}
              alt=""
              aria-hidden="true"
              width={48}
              height={32}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="detail-hero__photo"
              src={photoSrc(file, fileIndex === 0 ? "large" : "thumb")}
              srcSet={photoSrcSet(file)}
              sizes="(min-width: 1440px) 1440px, 100vw"
              alt={`${circle.short_name}の活動写真 ${fileIndex + 1}`}
              width={1200}
              height={800}
              loading={fileIndex === 0 ? "eager" : "lazy"}
              fetchPriority={fileIndex === 0 ? "high" : undefined}
              onError={() => setBroken((current) => ({ ...current, [file]: true }))}
            />
          </div>
        ))}
      </motion.div>

      <div className="detail-hero__veil" />
      <button type="button" className="detail-back" onClick={back} aria-label="団体一覧へ戻る">← <span>一覧へ戻る</span></button>

      <div className="detail-hero__copy">
        <div className="detail-hero__classification">{divisionText(circle)}</div>
        <h1>{circle.short_name}</h1>
        {circle.name !== circle.short_name && <p>{circle.name}</p>}
        {showCarousel && (
          <div className="detail-hero__controls" aria-label="活動写真">
            {files.map((file, fileIndex) => (
              <button
                type="button"
                key={file}
                onClick={() => goTo(fileIndex)}
                aria-label={`${fileIndex + 1}枚目を表示`}
                aria-current={fileIndex === index ? "true" : undefined}
                className={fileIndex === index ? "is-active" : ""}
              />
            ))}
            {autoplay ? (
              <button type="button" className="detail-hero__pause" onClick={stopAuto}>自動送りを止める</button>
            ) : (
              <span className="detail-hero__stopped">自動送り停止中</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
