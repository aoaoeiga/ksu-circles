"use client";

// 団体ページ（S-02）のヒーロー。design/ksu-circles-v3.dc.html の `isDetail` の上半分の移植。
//
// - 全画面（100dvh）の写真からゆっくりズームイン
// - スクロールすると写真が背後に沈み、上部にナビが出る
// - 写真が2枚以上なら 6秒後→以降5秒ごとにクロスフェード。触ったら止めて再開しない
//   （docs/ui/08-carousel.md §3-1）
//
// 移植元は image-slot に写真を差していたが、こちらは /public/photos の実ファイルを読む。
// 読み込みに失敗した写真は候補から外し、全滅したらジャンル色のベタ塗りに落とす（CLAUDE.md §6）。

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import type { Circle } from "@/types/circle";
import { BG, EASE, INK, PHOTO, RULE, genreColor, photoSrc } from "@/lib/design";
import { divisionText } from "@/lib/labels";
import { usePrefersReducedMotion } from "@/components/usePrefersReducedMotion";

const FIRST_DELAY = 6000;
const SLIDE_DELAY = 5000;

export default function Hero({ circle }: { circle: Circle }) {
  const router = useRouter();

  const navRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; axis: "x" | "y" | null; dx: number } | null>(null);
  const slideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const firstShown = useRef(false);
  const cueShown = useRef(false);

  const [broken, setBroken] = useState<Record<string, true>>({});
  const [slide, setSlide] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [heroVisible, setHeroVisible] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [hiResFile, setHiResFile] = useState<string | null>(null);
  const reduced = usePrefersReducedMotion();

  const heroFiles = circle.photos.length > 0 ? circle.photos.slice(0, 3) : circle.icon ? [circle.icon] : [];
  const photos = heroFiles.filter((p) => !broken[p]);
  const hasPhoto = photos.length > 0;
  const showCarousel = photos.length > 1;
  const idx = photos.length ? slide % photos.length : 0;
  const auto = !reduced && autoplay && heroVisible && !hidden && showCarousel;

  const firstFile = photos.length > 0 ? photos[0] : null;

  // 1枚目は @600 を先に出し、幅1200が読めてから静かに差し替える。
  useEffect(() => {
    if (!firstFile) return;
    const img = new window.Image();
    img.onload = () => setHiResFile(firstFile);
    img.src = photoSrc(firstFile);
    return () => {
      img.onload = null;
    };
  }, [firstFile]);

  // 「どの写真の高解像度が読めたか」で持つ。差し替え待ちを state のリセットで表さない
  const firstHiRes = firstFile !== null && hiResFile === firstFile;

  // --- 自動送り ------------------------------------------------------------
  const scheduleSlide = useCallback(() => {
    clearTimeout(slideTimer.current);
    if (reduced || !autoplay || !heroVisible || hidden || photos.length < 2) return;
    const first = !firstShown.current;
    firstShown.current = true;
    slideTimer.current = setTimeout(
      () => setSlide((s) => (s + 1) % photos.length),
      first ? FIRST_DELAY : SLIDE_DELAY
    );
  }, [reduced, autoplay, heroVisible, hidden, photos.length]);

  useEffect(() => {
    scheduleSlide();
    return () => clearTimeout(slideTimer.current);
  }, [scheduleSlide, slide]);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // --- スクロールで写真が沈む（移植元の driveHero） -------------------------
  useEffect(() => {
    const drive = () => {
      const y = window.scrollY || 0;
      const vh = window.innerHeight || 1;
      const p = Math.min(1, Math.max(0, y / vh));
      const hero = heroRef.current;
      if (hero) {
        hero.style.filter = "brightness(" + (1 - p * 0.45).toFixed(3) + ")";
        if (p > 0) hero.style.transformOrigin = "50% 40%";
      }
      const nav = navRef.current;
      if (nav) nav.style.transform = p > 0.92 ? "translateY(0)" : "translateY(-100%)";
      setHeroVisible(p < 0.5);
      if (y > 0 && !cueShown.current) {
        cueShown.current = true;
        if (cueRef.current) cueRef.current.style.opacity = "0";
      }
    };
    window.addEventListener("scroll", drive, { passive: true });
    drive();
    return () => window.removeEventListener("scroll", drive);
  }, []);

  // スクロール誘導は 2.6秒後に出す（移植元と同じ）
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => {
      if (cueRef.current && !cueShown.current) cueRef.current.style.opacity = "1";
    }, 2600);
    return () => clearTimeout(t);
  }, [reduced]);

  const stopAuto = () => {
    clearTimeout(slideTimer.current);
    setAutoplay(false);
  };

  const goSlide = (n: number) => {
    if (photos.length < 2) return;
    clearTimeout(slideTimer.current);
    setSlide(((n % photos.length) + photos.length) % photos.length);
    setAutoplay(false);
  };

  // --- 指で動かす（縦スクロールを優先。docs/ui/08-carousel.md §3） ----------
  const onDragStart = (e: React.PointerEvent) => {
    if (photos.length < 2) return;
    drag.current = { x: e.clientX, y: e.clientY, axis: null, dx: 0 };
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.axis = Math.abs(dx) > Math.abs(dy) * 1.4 ? "x" : "y";
      if (d.axis === "y") {
        drag.current = null;
        return;
      }
      stopAuto();
    }
    d.dx = dx;
    setDragX(dx);
  };
  const onDragEnd = () => {
    const d = drag.current;
    if (!d) return;
    const { dx, axis } = d;
    drag.current = null;
    setDragX(0);
    if (axis !== "x") return;
    const w = window.innerWidth || 1;
    if (Math.abs(dx) > w * 0.2) goSlide(slide + (dx < 0 ? 1 : -1));
  };

  /** 一覧へ戻る。一覧から来ていれば絞り込みごと戻したいので history を優先する */
  const back = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <>
      <div
        ref={navRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 12,
          height: 52,
          background: BG,
          borderBottom: "1px solid " + RULE,
          display: "flex",
          alignItems: "center",
          transform: "translateY(-100%)",
          transition: "transform 240ms cubic-bezier(.2,.7,.3,1)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 960,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 20px",
          }}
        >
          <div
            onClick={back}
            role="link"
            tabIndex={0}
            style={{
              display: "flex",
              alignItems: "center",
              height: 44,
              fontSize: 13,
              color: INK,
              cursor: "pointer",
              flex: "0 0 auto",
            }}
          >
            ⟨ 一覧
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 14,
              color: INK,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              textAlign: "center",
            }}
          >
            {circle.short_name}
          </div>
          <div style={{ flex: "0 0 44px" }} />
        </div>
      </div>

      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        style={{
          position: "sticky",
          top: 0,
          height: "100dvh",
          overflow: "hidden",
          zIndex: 0,
          touchAction: "pan-y",
        }}
      >
        <motion.div
          ref={heroRef}
          layoutId={`circle-image-${circle.id}`}
          transition={{ type: "spring", stiffness: 240, damping: 28 }}
          style={{
            position: "absolute",
            inset: 0,
            transformOrigin: "50% 50%",
            background: hasPhoto ? PHOTO : genreColor(circle.genre),
            filter: "brightness(" + (hasPhoto ? 0.94 : 1) + ")",
            animation:
              !hasPhoto && !reduced
                ? "heroZoomIn 16000ms cubic-bezier(.25,.1,.25,1) both"
                : undefined,
          }}
        >
          {photos.map((file, i) => {
            const on = i === idx;
            return (
              <div
                key={file}
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: on ? 1 : 0,
                  transition: "opacity 700ms ease-in-out",
                  transform: on && dragX ? "translateX(" + dragX * 0.4 + "px)" : undefined,
                  animation:
                    on && !reduced
                      ? i === 0
                        ? "heroZoomIn 16000ms cubic-bezier(.25,.1,.25,1) both"
                        : "slideZoom 5200ms cubic-bezier(.25,.1,.25,1) both"
                      : undefined,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={i === 0 && !firstHiRes ? photoSrc(file, "thumb") : photoSrc(file)}
                  alt=""
                  width={1200}
                  height={800}
                  loading={i === 0 ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : undefined}
                  onError={() => setBroken((b) => ({ ...b, [file]: true }))}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </div>
            );
          })}
        </motion.div>

        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "linear-gradient(to top, rgba(27,26,24,.86) 0%, rgba(27,26,24,.34) 42%, rgba(27,26,24,.06) 68%, rgba(27,26,24,.22) 100%)",
          }}
        />

        <div
          onClick={back}
          role="link"
          tabIndex={0}
          aria-label="一覧へ戻る"
          style={{
            position: "absolute",
            left: 20,
            top: 20,
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            color: "#FFFFFF",
            cursor: "pointer",
            zIndex: 3,
          }}
        >
          ⟨
        </div>

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "0 20px 56px",
            zIndex: 2,
            pointerEvents: "none",
          }}
        >
          <div
            style={
              showCarousel
                ? {
                    display: "flex",
                    alignItems: "center",
                    gap: 0,
                    marginBottom: 4,
                    marginLeft: -8,
                  }
                : { display: "none" }
            }
          >
            {showCarousel &&
              photos.map((file, i) => (
                <div
                  key={file}
                  onClick={() => goSlide(i)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${i + 1}枚目`}
                  style={{
                    width: 20,
                    height: 44,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    pointerEvents: "auto",
                  }}
                >
                  <div
                    style={{
                      width: i === idx && auto ? 18 : 5,
                      height: 5,
                      borderRadius: 3,
                      overflow: "hidden",
                      background:
                        i === idx
                          ? auto
                            ? "rgba(255,255,255,.35)"
                            : "#FFFFFF"
                          : "rgba(255,255,255,.45)",
                      transition: "width 240ms " + EASE,
                    }}
                  >
                    <div
                      style={
                        i === idx && auto
                          ? {
                              height: "100%",
                              background: "#FFFFFF",
                              animation: "dotFill 5000ms linear both",
                            }
                          : { display: "none" }
                      }
                    />
                  </div>
                </div>
              ))}
            <div
              onClick={() => {
                if (autoplay) stopAuto();
                else {
                  firstShown.current = true;
                  setAutoplay(true);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={auto ? "自動送りを止める" : "自動送りを再開する"}
              style={
                showCarousel
                  ? {
                      width: 44,
                      height: 44,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      color: "rgba(255,255,255,.7)",
                      cursor: "pointer",
                      pointerEvents: "auto",
                    }
                  : { display: "none" }
              }
            >
              {auto ? "⏸" : "▶"}
            </div>
          </div>

          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              fontWeight: 500,
              color: "rgba(255,255,255,.78)",
              animation: "heroUp 700ms cubic-bezier(.2,.7,.3,1) both",
              animationDelay: "300ms",
            }}
          >
            {divisionText(circle)}
          </div>
          <div
            style={{
              fontFamily: "'Zen Kaku Gothic New',sans-serif",
              fontWeight: 700,
              fontSize: hasPhoto ? 40 : 46,
              lineHeight: 1.22,
              letterSpacing: "-0.03em",
              color: "#FFFFFF",
              marginTop: 12,
              textWrap: "pretty",
              animation: "heroUp 700ms cubic-bezier(.2,.7,.3,1) both",
              animationDelay: "380ms",
            }}
          >
            {circle.short_name}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,.72)",
              marginTop: 10,
              lineHeight: 1.6,
              animation: "heroUp 700ms cubic-bezier(.2,.7,.3,1) both",
              animationDelay: "520ms",
            }}
          >
            {circle.name}
          </div>
        </div>

        <div
          ref={cueRef}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 20,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            opacity: 0,
            transition: "opacity 400ms ease-out",
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "rgba(255,255,255,.6)" }}>
            SCROLL
          </div>
          <div style={{ width: 18, height: 10, animation: "cueBob 2400ms ease-in-out infinite" }}>
            <div
              style={{
                width: 11,
                height: 1.5,
                background: "rgba(255,255,255,.7)",
                transform: "rotate(35deg)",
                transformOrigin: "left center",
                position: "absolute",
              }}
            />
            <div
              style={{
                width: 11,
                height: 1.5,
                background: "rgba(255,255,255,.7)",
                transform: "rotate(-35deg) translateX(-11px)",
                transformOrigin: "right center",
                position: "absolute",
                left: 18,
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
