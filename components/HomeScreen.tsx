"use client";

// 一覧（S-01）。design/ksu-circles-v3.dc.html の `isHome` ブロックの移植。
//
// 移植元はクラス1つで画面切り替えまで持っていたが、こちらは Next のルーティングに載せる。
// 見た目・余白・色・書体・アニメーションは移植元の値をそのまま持ってきている。
//
// 絞り込みの状態はURLに載せる（要件定義 §6-1「共有できること」）。ただし
// **サーバーで searchParams を読むとページが動的になる**ので、読むのはこの client 側だけ。
// 詳しくは docs/14-nextjs-notes.md §2。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Circle } from "@/types/circle";
import {
  BG,
  BIG_BTN,
  CATS,
  DAY_ORDER,
  EASE,
  FEES,
  FEE_ANY,
  GENRES,
  INK,
  INK_MID,
  RULE,
  SHADOW,
  WHITE,
  cellStyle,
  chipStyle,
  genreColor,
  num,
  switchKnob,
  switchTrack,
  type CellKind,
  type FeeChoice,
} from "@/lib/design";
import { DAY_LABELS } from "@/lib/gender";
import { feeText, membersText, multiText } from "@/lib/labels";
import PhotoTile from "@/components/PhotoTile";
import { openDetailZoom } from "@/components/zoom";
import { usePrefersReducedMotion } from "@/components/usePrefersReducedMotion";

export type Filters = {
  q: string;
  days: number[];
  cats: string[];
  genres: string[];
  fee: FeeChoice;
  beginner: boolean;
  multi: boolean;
};

export const EMPTY_FILTERS: Filters = {
  q: "",
  days: [],
  cats: [],
  genres: [],
  fee: FEE_ANY,
  beginner: false,
  multi: false,
};

/** 移植元の COVER_ROWS。表紙タイルの行の組み方 */
const COVER_ROWS = [
  { count: 1, cols: "1fr", aspect: "3 / 2" },
  { count: 2, cols: "1.75fr 1fr", aspect: "16 / 11" },
  { count: 2, cols: "1fr 2.1fr", aspect: "16 / 8" },
  { count: 2, cols: "1.3fr 1fr", aspect: "16 / 13" },
];

const TILE_RANK: Record<Circle["tile_size"], number> = { L: 0, M: 1, S: 2 };

/** 移植元の passes(). 絞り込みの判定 */
function passes(o: Circle, f: Filters): boolean {
  const q = f.q.trim().toLowerCase();
  if (q) {
    const hay = (o.short_name + " " + o.name + " " + o.genre + " " + o.category).toLowerCase();
    if (hay.indexOf(q) < 0) return false;
  }
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
  if (f.multi && !o.multi_club_ok) return false;
  return true;
}

/** 絞り込みをURLの検索文字列にする。既定値は書かない（きれいなURLを保つ） */
export function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.days.length) p.set("days", [...f.days].sort((a, b) => a - b).join(","));
  if (f.cats.length) p.set("cats", f.cats.join(","));
  if (f.genres.length) p.set("genres", f.genres.join(","));
  if (f.fee !== FEE_ANY) p.set("fee", f.fee);
  if (f.beginner) p.set("beginner", "1");
  if (f.multi) p.set("multi", "1");
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
  const router = useRouter();
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

  // 表紙のタイル。移植元はランダムに並べ替えていたが、静的生成では
  // サーバーとクライアントで結果がずれる（ハイドレーション不一致）ので使えない。
  // 代わりに tile_size（docs/13-schema-mapping.md §4）の L→M→S 順で先頭7件を採る。
  const coverRows = useMemo(() => {
    const picked = [...circles]
      .sort((a, b) => TILE_RANK[a.tile_size] - TILE_RANK[b.tile_size])
      .slice(0, 7);
    const rows: { tiles: Circle[]; cols: string; aspect: string }[] = [];
    let k = 0;
    for (const spec of COVER_ROWS) {
      const tiles: Circle[] = [];
      for (let n = 0; n < spec.count && k < picked.length; n++, k++) tiles.push(picked[k]);
      if (tiles.length === spec.count) rows.push({ tiles, cols: spec.cols, aspect: spec.aspect });
    }
    return rows;
  }, [circles]);

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

  /** カードを押したとき。写真がそのまま全画面へ育つ（要件定義 §6-2） */
  const open = (id: string) => (e: React.MouseEvent<HTMLElement>) => {
    const href = "/c/" + id + filtersToQuery(f);
    openDetailZoom(e.currentTarget, href, router, reduced);
  };

  const filterCount =
    f.days.length +
    f.cats.length +
    f.genres.length +
    (f.fee !== FEE_ANY ? 1 : 0) +
    (f.beginner ? 1 : 0) +
    (f.multi ? 1 : 0);

  const cellsFor = (o: Circle) =>
    DAY_ORDER.map((dayIdx, i) => {
      let kind: CellKind = "off";
      if (o.active_days.length === 0) kind = "hatch";
      else if (o.active_days.indexOf(dayIdx) >= 0)
        kind = f.days.indexOf(dayIdx) >= 0 ? "match" : "on";
      return { label: DAY_LABELS[dayIdx], style: cellStyle(kind, i) };
    });

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
            fontFamily: "'Zen Kaku Gothic New',sans-serif",
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
            fontFamily: "'Zen Kaku Gothic New',sans-serif",
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

      <div style={{ padding: "24px 20px 0" }}>
        <div
          style={{
            background: WHITE,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            boxShadow: SHADOW,
            padding: "0 6px",
          }}
        >
          <input
            type="text"
            value={f.q}
            onChange={(e) => applyFilters({ q: e.target.value })}
            placeholder="団体名やジャンルで検索"
            aria-label="団体名やジャンルで検索"
            style={{
              width: "100%",
              height: 50,
              border: 0,
              outline: "none",
              background: "transparent",
              padding: "0 16px",
              fontFamily: "'Noto Sans JP',sans-serif",
              fontSize: 15,
              color: INK,
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "26px 20px 0" }}>
        {coverRows.map((row, ri) => (
          <div
            key={ri}
            style={{
              display: "grid",
              gridTemplateColumns: row.cols,
              gap: 10,
              aspectRatio: row.aspect,
            }}
          >
            {row.tiles.map((o, ti) => {
              const idx = COVER_ROWS.slice(0, ri).reduce((a, r) => a + r.count, 0) + ti;
              return (
                <div
                  key={o.id}
                  onClick={open(o.id)}
                  style={{
                    position: "relative",
                    height: "100%",
                    minWidth: 0,
                    animation: `tileOpen 520ms ${EASE} both`,
                    animationDelay: 340 + idx * 60 + "ms",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      overflow: "hidden",
                      borderRadius: 16,
                      display: "flex",
                      alignItems: "flex-end",
                    }}
                  >
                    <PhotoTile
                      circle={o}
                      nameSize={idx === 0 ? 26 : 16}
                      nameSizeNoPhoto={idx === 0 ? 26 : 16}
                      namePadding={16}
                      veilOpacity={0.62}
                      priority={idx === 0}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
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
                fontFamily: "'Schibsted Grotesk',sans-serif",
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
                fontFamily: "'Zen Kaku Gothic New',sans-serif",
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

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          {visible.map((id) => {
            const o = byId[id];
            if (!o) return null;
            const going = leaving.indexOf(o.id) >= 0;
            return (
              <div
                key={o.id}
                data-org={o.id}
                data-reveal="1"
                onClick={open(o.id)}
                style={{
                  cursor: "pointer",
                  background: WHITE,
                  borderRadius: 16,
                  overflow: "hidden",
                  boxShadow: SHADOW,
                  opacity: going ? 0 : undefined,
                  transform: going ? "scale(0.96)" : undefined,
                  transition: going ? "opacity 180ms ease-out, transform 180ms ease-out" : undefined,
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "3 / 2",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "flex-end",
                  }}
                >
                  <PhotoTile
                    circle={o}
                    nameSize={22}
                    nameSizeNoPhoto={26}
                    namePadding={18}
                    nameZIndex={2}
                    veilOpacity={0.6}
                  />
                </div>
                <div style={{ padding: "18px 20px 20px" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {cellsFor(o).map((c, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <div style={{ fontSize: 10, lineHeight: 1, color: INK_MID }}>{c.label}</div>
                        <div style={c.style} />
                      </div>
                    ))}
                  </div>
                  {o.active_days.length === 0 && (
                    <div style={{ fontSize: 11, color: INK_MID, marginTop: 7 }}>活動曜日 未確認</div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      marginTop: 14,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={o.annual_fee === null ? { fontSize: 13, color: INK_MID } : num(14)}>
                      {feeText(o)}
                    </div>
                    <div
                      style={
                        o.member_count === null ? { fontSize: 13, color: INK_MID } : num(14)
                      }
                    >
                      {membersText(o)}
                    </div>
                    <div style={{ fontSize: 13, color: INK }}>{multiText(o)}</div>
                  </div>
                </div>
              </div>
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
        <div onClick={() => setSheetOpen(true)} style={BIG_BTN} role="button" tabIndex={0}>
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
        </div>
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
                  fontFamily: "'Zen Kaku Gothic New',sans-serif",
                  fontWeight: 700,
                  fontSize: 18,
                  letterSpacing: "-0.04em",
                  color: INK,
                }}
              >
                絞り込み
              </div>
              <div
                onClick={() => setSheetOpen(false)}
                style={{ fontSize: 13, color: INK_MID, cursor: "pointer", padding: "8px 4px" }}
              >
                閉じる
              </div>
            </div>

            <div style={{ overflowY: "auto", padding: "6px 20px 22px" }}>
              <SheetHeading>空いている曜日</SheetHeading>
              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                {DAY_ORDER.map((dayIdx) => {
                  const on = f.days.indexOf(dayIdx) >= 0;
                  return (
                    <div
                      key={dayIdx}
                      onClick={() => toggleIn("days", dayIdx)}
                      style={{
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
                    </div>
                  );
                })}
              </div>

              <SheetHeading top>区分</SheetHeading>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {CATS.map((c) => (
                  <div
                    key={c}
                    onClick={() => toggleIn("cats", c)}
                    style={chipStyle(f.cats.indexOf(c) >= 0)}
                  >
                    {c}
                  </div>
                ))}
              </div>

              <SheetHeading top>ジャンル</SheetHeading>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {GENRES.map((c) => (
                  <div
                    key={c}
                    onClick={() => toggleIn("genres", c)}
                    style={chipStyle(f.genres.indexOf(c) >= 0)}
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
                  </div>
                ))}
              </div>

              <SheetHeading top>年会費</SheetHeading>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {FEES.map((c) => (
                  <div key={c} onClick={() => applyFilters({ fee: c })} style={chipStyle(f.fee === c)}>
                    {c}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 26, borderTop: "1px solid " + RULE }}>
                <div
                  onClick={() => applyFilters({ beginner: !f.beginner })}
                  style={{
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
                </div>
                <div
                  onClick={() => applyFilters({ multi: !f.multi })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    height: 54,
                    borderBottom: "1px solid " + RULE,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 14, color: INK }}>掛け持ちできる団体だけ</div>
                  <div style={switchTrack(f.multi)}>
                    <div style={switchKnob(f.multi)} />
                  </div>
                </div>
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
              <div
                onClick={() => applyFilters(EMPTY_FILTERS)}
                style={{
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
              </div>
              <div
                onClick={() => setSheetOpen(false)}
                style={{ ...BIG_BTN, flex: 1, height: 52 }}
              >
                {filteredCount}件を表示 •
              </div>
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
        fontFamily: "'Zen Kaku Gothic New',sans-serif",
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
