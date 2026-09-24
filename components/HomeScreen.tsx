"use client";

// 一覧（S-01）。絞り込みは従来のまま、表示だけを大小のタイルグリッドにする。
//
// 移植元はクラス1つで画面切り替えまで持っていたが、こちらは Next のルーティングに載せる。
// タイルのサイズは団体IDから決め、再読込や絞り込みで変えない。
//
// 絞り込みの状態はURLに載せる（要件定義 §6-1「共有できること」）。ただし
// **サーバーで searchParams を読むとページが動的になる**ので、読むのはこの client 側だけ。
// 詳しくは docs/14-nextjs-notes.md §2。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Circle } from "@/types/circle";
import {
  BG,
  BIG_BTN,
  BUTTON_RESET,
  CATS,
  DAY_ORDER,
  EASE,
  FEES,
  FEE_ANY,
  GENRES,
  INK,
  INK_MID,
  RULE,
  WHITE,
  chipStyle,
  genreColor,
  num,
  switchKnob,
  switchTrack,
  type FeeChoice,
} from "@/lib/design";
import { DAY_LABELS } from "@/lib/gender";
import CircleTile from "@/components/CircleTile";
import { rememberTile } from "@/lib/flip";
import { usePrefersReducedMotion } from "@/components/usePrefersReducedMotion";
import { tileShapeForId } from "@/lib/tile-layout";

export type Filters = {
  days: number[];
  cats: string[];
  genres: string[];
  fee: FeeChoice;
  beginner: boolean;
};

export const EMPTY_FILTERS: Filters = {
  days: [],
  cats: [],
  genres: [],
  fee: FEE_ANY,
  beginner: false,
};

// 一度出したタイルは覚えておく。詳細から戻ったときに一覧ぜんぶが入り直すと、
// 縮んでくるヒーローの着地点が動いてしまう（lib/flip.ts）。
// 絞り込みで新しく現れたタイルは、これまでどおり下から入る。
const revealed = new Set<string>();

/** 移植元の passes(). 絞り込みの判定 */
function passes(o: Circle, f: Filters): boolean {
  if (f.days.length && !f.days.some((d) => o.active_days.indexOf(d) >= 0)) return false;
  if (f.cats.length && f.cats.indexOf(o.category) < 0) return false;
  if (f.genres.length && f.genres.indexOf(o.genre) < 0) return false;
  if (f.fee !== FEE_ANY) {
    // 年会費が未確認の団体は、金額で絞ったときには出さない。
    // 0（無料）とは別扱い。ここを混ぜると未確認が無料に見える（CLAUDE.md §4）
    if (o.annual_fee === null) return false;
    if (f.fee === "0円" && o.annual_fee !== 0) return false;
    if (f.fee === "〜3,000円" && o.annual_fee > 3000) return false;
    if (f.fee === "〜10,000円" && o.annual_fee > 10000) return false;
    if (f.fee === "10,000円〜" && o.annual_fee <= 10000) return false;
  }
  if (f.beginner && !o.beginner_count) return false;
  return true;
}

/** 絞り込みをURLの検索文字列にする。既定値は書かない（きれいなURLを保つ） */
export function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.days.length) p.set("days", [...f.days].sort((a, b) => a - b).join(","));
  if (f.cats.length) p.set("cats", f.cats.join(","));
  if (f.genres.length) p.set("genres", f.genres.join(","));
  if (f.fee !== FEE_ANY) p.set("fee", f.fee);
  if (f.beginner) p.set("beginner", "1");
  const s = p.toString();
  return s ? "?" + s : "";
}

export default function HomeScreen({
  circles,
  initial = EMPTY_FILTERS,
}: {
  circles: Circle[];
  initial?: Filters;
}) {
  const [f, setF] = useState<Filters>(initial);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [leaving, setLeaving] = useState<string[]>([]);
  const [visible, setVisible] = useState<string[]>(() =>
    circles.filter((c) => passes(c, initial)).map((c) => c.id)
  );

  const rects = useRef<Record<string, number>>({});
  const pendingFlip = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const byId = useMemo(() => {
    const m: Record<string, Circle> = {};
    circles.forEach((c) => (m[c.id] = c));
    return m;
  }, [circles]);

  const reduced = usePrefersReducedMotion();

  const filteredCount = useMemo(
    () => circles.filter((c) => passes(c, f)).length,
    [circles, f]
  );

  // --- 絞り込みの反映（移植元の measure / flip / applyFilters） -------------
  const measure = useCallback(() => {
    const m: Record<string, number> = {};
    document.querySelectorAll("[data-org]").forEach((el) => {
      const id = el.getAttribute("data-org");
      if (id) m[id] = el.getBoundingClientRect().top;
    });
    rects.current = m;
  }, []);

  useEffect(() => {
    if (reduced || !pendingFlip.current) return;
    pendingFlip.current = false;
    document.querySelectorAll("[data-org]").forEach((node) => {
      const el = node as HTMLElement;
      const id = el.getAttribute("data-org");
      const prev = id ? rects.current[id] : undefined;
      if (prev === undefined) return;
      const delta = prev - el.getBoundingClientRect().top;
      if (!delta) return;
      el.style.transition = "none";
      el.style.transform = "translateY(" + delta + "px)";
      requestAnimationFrame(() => {
        el.style.transition = "transform 280ms " + EASE;
        el.style.transform = "translateY(0)";
      });
    });
  }, [visible, reduced]);

  const applyFilters = useCallback(
    (patch: Partial<Filters>) => {
      measure();
      const next = { ...f, ...patch };
      setF(next);

      // URLに反映する。router.push だと絞り込むたびに履歴が積もって
      // 戻るボタンが壊れるので replaceState で書き換える（docs/14-nextjs-notes.md §2）
      window.history.replaceState(null, "", window.location.pathname + filtersToQuery(next));

      const nextIds = circles.filter((c) => passes(c, next)).map((c) => c.id);
      const gone = visible.filter((id) => nextIds.indexOf(id) < 0);
      pendingFlip.current = true;
      if (gone.length && !reduced) {
        setLeaving(gone);
        clearTimeout(leaveTimer.current);
        leaveTimer.current = setTimeout(() => {
          measure();
          pendingFlip.current = true;
          setVisible(nextIds);
          setLeaving([]);
        }, 180);
      } else {
        setVisible(nextIds);
        setLeaving([]);
      }
    },
    [circles, f, measure, reduced, visible]
  );

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  // --- カードの現れ方（移植元の observe / IntersectionObserver） -----------
  useEffect(() => {
    if (reduced) {
      document.querySelectorAll("[data-reveal]").forEach((n) => {
        const el = n as HTMLElement;
        el.style.opacity = "1";
        el.style.transform = "none";
      });
      return;
    }
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          el.style.transition = "opacity 420ms " + EASE + ", transform 420ms " + EASE;
          el.style.opacity = "1";
          el.style.transform = "translateY(0)";
          el.setAttribute("data-shown", "1");
          const id = el.getAttribute("data-org");
          if (id) revealed.add(id);
          io.unobserve(el);
        });
      },
      { threshold: 0.06, rootMargin: "0px 0px -6% 0px" }
    );
    document
      .querySelectorAll("[data-reveal]:not([data-shown]):not([data-observed])")
      .forEach((n) => {
        const el = n as HTMLElement;
        el.setAttribute("data-observed", "1");
        const id = el.getAttribute("data-org");
        if (id && revealed.has(id)) {
          // すでに見せたタイル。戻ってきただけなので、出ている形のまま置く
          el.setAttribute("data-shown", "1");
          return;
        }
        el.style.opacity = "0";
        el.style.transform = "translateY(24px)";
        io.observe(el);
      });
    return () => io.disconnect();
  }, [visible, reduced]);

  const toggleIn = (key: "days" | "cats" | "genres", v: never | number | string) => {
    const a = (f[key] as (number | string)[]).slice();
    const i = a.indexOf(v);
    if (i >= 0) a.splice(i, 1);
    else a.push(v);
    applyFilters({ [key]: a } as Partial<Filters>);
  };

  const filterCount =
    f.days.length +
    f.cats.length +
    f.genres.length +
    (f.fee !== FEE_ANY ? 1 : 0) +
    (f.beginner ? 1 : 0);

  return (
    <div data-screen="home">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 20px 0",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-zen), sans-serif",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: "-0.04em",
            color: INK,
          }}
        >
          京産大サークル名鑑
        </div>
      </div>

      <div style={{ padding: "30px 20px 0" }}>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-zen), sans-serif",
            fontWeight: 700,
            fontSize: 48,
            lineHeight: 1.15,
            letterSpacing: "-0.05em",
            color: INK,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span style={{ animation: `lineUp 480ms ${EASE} both`, animationDelay: "0ms" }}>
            京産大の
          </span>
          <span style={{ animation: `lineUp 480ms ${EASE} both`, animationDelay: "80ms" }}>
            サークル、
          </span>
          <span style={{ animation: `lineUp 480ms ${EASE} both`, animationDelay: "160ms" }}>
            全部ここに。
          </span>
        </h1>
        <p
          style={{
            margin: "20px 0 0",
            fontSize: 15,
            lineHeight: 1.8,
            color: INK_MID,
            animation: `lineUp 480ms ${EASE} both`,
            animationDelay: "260ms",
          }}
        >
          {circles.length}団体を、活動曜日と年会費から探せます。
        </p>
      </div>

      <div style={{ padding: "44px 20px 120px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            paddingBottom: 18,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 5,
                  border: "1px solid " + INK_MID,
                }}
              />
              <div
                style={{ fontSize: 11, letterSpacing: "0.14em", fontWeight: 500, color: INK_MID }}
              >
                団体をさがす
              </div>
            </div>
            <h2
              style={{
                margin: "6px 0 0",
                fontFamily: "var(--font-schibsted), sans-serif",
                fontWeight: 700,
                fontSize: 32,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                color: INK,
              }}
            >
              CIRCLES
            </h2>
          </div>
          <div style={num(14, INK_MID)}>{filteredCount}件</div>
        </div>

        {filteredCount === 0 && (
          <div style={{ padding: "56px 8px", textAlign: "center" }}>
            <div
              style={{
                fontFamily: "var(--font-zen), sans-serif",
                fontWeight: 700,
                fontSize: 18,
                letterSpacing: "-0.04em",
                color: INK,
              }}
            >
              条件に合う団体がありません
            </div>
            <div style={{ fontSize: 14, color: INK_MID, marginTop: 10, lineHeight: 1.8 }}>
              曜日か会費の条件をゆるめてみてください。
            </div>
          </div>
        )}

        <div className="circle-grid">
          {visible.map((id, order) => {
            const o = byId[id];
            if (!o) return null;
            const going = leaving.indexOf(o.id) >= 0;
            const shape = tileShapeForId(o.id);
            return (
              <Link
                key={o.id}
                href={`/c/${o.id}${filtersToQuery(f)}`}
                // 押した瞬間のタイルの位置を控える。詳細のヒーローはここから広がる
                onClick={(e) => rememberTile(o.id, e.currentTarget)}
                data-org={o.id}
                data-reveal="1"
                className={`circle-tile circle-tile--${shape}`}
                style={{
                  opacity: going ? 0 : undefined,
                  transform: going ? "scale(0.96)" : undefined,
                  transition: going ? "opacity 180ms ease-out, transform 180ms ease-out" : undefined,
                }}
              >
                {/* 先頭の3枚は最初の画面に入る（390px 幅で実測）。遅延読み込みにしない */}
                <CircleTile circle={o} shape={shape} priority={order < 3} />
              </Link>
            );
          })}
        </div>
      </div>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          padding: "12px 20px 20px",
          background: `linear-gradient(to top,${BG} 62%,rgba(239,239,235,0))`,
        }}
      >
        <button type="button" onClick={() => setSheetOpen(true)} style={{ ...BUTTON_RESET, ...BIG_BTN, width: "100%" }}>
          <span>絞り込み</span>
          <span>•</span>
          {filterCount > 0 && (
            <span
              style={{
                ...num(12, INK),
                minWidth: 22,
                height: 22,
                padding: "0 6px",
                borderRadius: 11,
                background: WHITE,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {filterCount}
            </span>
          )}
        </button>
      </div>

      {sheetOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            zIndex: 20,
          }}
        >
          <div
            onClick={() => setSheetOpen(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(20,22,26,0.42)" }}
          />
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 960,
              background: BG,
              maxHeight: "88vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "18px 20px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-zen), sans-serif",
                  fontWeight: 700,
                  fontSize: 18,
                  letterSpacing: "-0.04em",
                  color: INK,
                }}
              >
                絞り込み
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                style={{ ...BUTTON_RESET, fontSize: 13, color: INK_MID, cursor: "pointer", padding: "12px 8px", minHeight: 44 }}
              >
                閉じる
              </button>
            </div>

            <div style={{ overflowY: "auto", padding: "6px 20px 22px" }}>
              <SheetHeading>空いている曜日</SheetHeading>
              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                {DAY_ORDER.map((dayIdx) => {
                  const on = f.days.indexOf(dayIdx) >= 0;
                  return (
                    <button
                      type="button"
                      key={dayIdx}
                      aria-pressed={on}
                      onClick={() => toggleIn("days", dayIdx)}
                      style={{
                        ...BUTTON_RESET,
                        width: 44,
                        height: 44,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        cursor: "pointer",
                        borderRadius: 999,
                        background: on ? INK : WHITE,
                        color: on ? WHITE : INK,
                        boxShadow: on ? "none" : "inset 0 0 0 1px " + RULE,
                      }}
                    >
                      {DAY_LABELS[dayIdx]}
                    </button>
                  );
                })}
              </div>

              <SheetHeading top>区分</SheetHeading>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {CATS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    aria-pressed={f.cats.indexOf(c) >= 0}
                    onClick={() => toggleIn("cats", c)}
                    style={{ ...BUTTON_RESET, ...chipStyle(f.cats.indexOf(c) >= 0) }}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <SheetHeading top>ジャンル</SheetHeading>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {GENRES.map((c) => (
                  <button
                    type="button"
                    key={c}
                    aria-pressed={f.genres.indexOf(c) >= 0}
                    onClick={() => toggleIn("genres", c)}
                    style={{ ...BUTTON_RESET, ...chipStyle(f.genres.indexOf(c) >= 0) }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        background: genreColor(c),
                        flex: "0 0 8px",
                      }}
                    />
                    <span>{c}</span>
                  </button>
                ))}
              </div>

              <SheetHeading top>年会費</SheetHeading>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {FEES.map((c) => (
                  <button
                    type="button"
                    key={c}
                    aria-pressed={f.fee === c}
                    onClick={() => applyFilters({ fee: c })}
                    style={{ ...BUTTON_RESET, ...chipStyle(f.fee === c) }}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 26, borderTop: "1px solid " + RULE }}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={f.beginner}
                  onClick={() => applyFilters({ beginner: !f.beginner })}
                  style={{
                    ...BUTTON_RESET,
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    height: 54,
                    borderBottom: "1px solid " + RULE,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 14, color: INK }}>初心者がいる団体だけ</div>
                  <div style={switchTrack(f.beginner)}>
                    <div style={switchKnob(f.beginner)} />
                  </div>
                </button>
              </div>
            </div>

            <div
              style={{
                padding: "12px 20px 20px",
                display: "flex",
                gap: 10,
                alignItems: "center",
                background: BG,
              }}
            >
              <button
                type="button"
                onClick={() => applyFilters(EMPTY_FILTERS)}
                style={{
                  ...BUTTON_RESET,
                  height: 52,
                  padding: "0 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  color: INK_MID,
                  cursor: "pointer",
                }}
              >
                条件をクリア
              </button>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                style={{ ...BUTTON_RESET, ...BIG_BTN, flex: 1, height: 52 }}
              >
                {filteredCount}件を表示 •
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SheetHeading({ children, top }: { children: React.ReactNode; top?: boolean }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-zen), sans-serif",
        fontWeight: 700,
        fontSize: 14,
        color: INK,
        letterSpacing: "-0.04em",
        marginTop: top ? 26 : undefined,
      }}
    >
      {children}
    </div>
  );
}
