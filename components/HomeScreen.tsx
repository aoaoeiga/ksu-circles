"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Circle } from "@/types/circle";
import {
  BUTTON_RESET,
  CATS,
  DAY_ORDER,
  FEES,
  FEE_ANY,
  GENRES,
  chipStyle,
  genreColor,
  photoSrc,
  switchKnob,
  switchTrack,
  type FeeChoice,
} from "@/lib/design";
import { DAY_LABELS } from "@/lib/gender";
import CircleTile from "@/components/CircleTile";
import InitialTile from "@/components/InitialTile";

export type Filters = {
  q: string;
  days: number[];
  cats: string[];
  genres: string[];
  fee: FeeChoice;
  beginner: boolean;
};

export const EMPTY_FILTERS: Filters = {
  q: "",
  days: [],
  cats: [],
  genres: [],
  fee: FEE_ANY,
  beginner: false,
};

function passes(circle: Circle, filters: Filters): boolean {
  const query = filters.q.trim().toLocaleLowerCase("ja");
  if (
    query &&
    ![circle.short_name, circle.name, circle.one_liner, circle.genre, circle.category]
      .join(" ")
      .toLocaleLowerCase("ja")
      .includes(query)
  )
    return false;
  if (filters.days.length && !filters.days.some((day) => circle.active_days.includes(day))) return false;
  if (filters.cats.length && !filters.cats.includes(circle.category)) return false;
  if (filters.genres.length && !filters.genres.includes(circle.genre)) return false;
  if (filters.fee !== FEE_ANY) {
    if (circle.annual_fee === null) return false;
    if (filters.fee === "0円" && circle.annual_fee !== 0) return false;
    if (filters.fee === "〜3,000円" && circle.annual_fee > 3000) return false;
    if (filters.fee === "〜10,000円" && circle.annual_fee > 10000) return false;
    if (filters.fee === "10,000円〜" && circle.annual_fee <= 10000) return false;
  }
  if (filters.beginner && !circle.beginner_count) return false;
  return true;
}

export function filtersToQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.days.length) params.set("days", [...filters.days].sort((a, b) => a - b).join(","));
  if (filters.cats.length) params.set("cats", filters.cats.join(","));
  if (filters.genres.length) params.set("genres", filters.genres.join(","));
  if (filters.fee !== FEE_ANY) params.set("fee", filters.fee);
  if (filters.beginner) params.set("beginner", "1");
  const value = params.toString();
  return value ? `?${value}` : "";
}

function coverCircles(circles: Circle[]): Circle[] {
  const candidates = circles.filter((circle) => circle.icon || circle.photos[0]);
  const result: Circle[] = [];
  const lead = candidates.find((circle) => circle.tile_size === "L") ?? candidates[0];
  if (lead) result.push(lead);
  for (const circle of candidates) {
    if (result.some((item) => item.id === circle.id)) continue;
    if (result.length < 3 && result.some((item) => item.genre === circle.genre)) continue;
    result.push(circle);
    if (result.length === 4) break;
  }
  for (const circle of candidates) {
    if (result.length === 4) break;
    if (!result.some((item) => item.id === circle.id)) result.push(circle);
  }
  return result;
}

function EditorialPhoto({ circle, className }: { circle: Circle; className: string }) {
  const [failed, setFailed] = useState(false);
  const file = circle.icon ?? circle.photos[0] ?? null;
  return (
    <div className={className} style={{ background: genreColor(circle.genre) }}>
      {file && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoSrc(file, "thumb")}
          alt={`${circle.short_name}の活動写真`}
          width={600}
          height={400}
          loading="eager"
          onError={() => setFailed(true)}
        />
      ) : (
        <InitialTile circle={circle} />
      )}
      <span>{circle.short_name}</span>
    </div>
  );
}

export default function HomeScreen({
  circles,
  initial = EMPTY_FILTERS,
}: {
  circles: Circle[];
  initial?: Filters;
}) {
  const [filters, setFilters] = useState(initial);
  const [sheetOpen, setSheetOpen] = useState(false);
  const featured = useMemo(() => coverCircles(circles), [circles]);
  const filtered = useMemo(() => circles.filter((circle) => passes(circle, filters)), [circles, filters]);

  // App Router のハイドレーション後も表紙の「団体を探す」アンカーを復元する。
  useEffect(() => {
    if (window.location.hash !== "#directory") return;
    document.getElementById("directory")?.scrollIntoView({ behavior: "auto", block: "start" });
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [sheetOpen]);

  const applyFilters = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    window.history.replaceState(null, "", window.location.pathname + filtersToQuery(next));
  };

  const toggleIn = (key: "days" | "cats" | "genres", value: number | string) => {
    const selected = [...(filters[key] as (number | string)[])];
    const index = selected.indexOf(value);
    if (index >= 0) selected.splice(index, 1);
    else selected.push(value);
    applyFilters({ [key]: selected } as Partial<Filters>);
  };

  const conditionCount =
    filters.days.length +
    filters.cats.length +
    filters.genres.length +
    (filters.fee !== FEE_ANY ? 1 : 0) +
    (filters.beginner ? 1 : 0);

  return (
    <main className="home">
      <header className="site-header">
        <a href="#top" className="site-wordmark">京産大サークル名鑑</a>
        <a href="#directory" className="site-header__link">団体を探す ↓</a>
      </header>

      <section className="cover" id="top" aria-labelledby="cover-title">
        <div className="cover__copy">
          <p className="cover__kicker">京都産業大学のサークル案内</p>
          <h1 id="cover-title">知らなかった<br />居場所に、<br />会いにいこう。</h1>
          <p className="cover__lead">
            運営が一団体ずつ聞き取った情報と、実際の活動写真から探せるサークル名鑑です。
          </p>
          <a className="cover__cta" href="#directory">掲載中の{circles.length}団体を見る</a>
        </div>
        <div className="cover-collage" aria-label="掲載団体の活動写真">
          {featured.map((circle, index) => (
            <EditorialPhoto key={circle.id} circle={circle} className={`cover-photo cover-photo--${index + 1}`} />
          ))}
        </div>
      </section>

      <section className="directory" id="directory" aria-labelledby="directory-title">
        <div className="directory__heading">
          <div>
            <p className="section-kicker">自分の条件から見つける</p>
            <h2 id="directory-title">団体を探す</h2>
          </div>
          <div className="directory__count" aria-live="polite">{filtered.length}件</div>
        </div>

        <div className="search-bar">
          <label className="search-field">
            <span className="sr-only">団体名や活動内容で検索</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
              <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            <input
              type="search"
              value={filters.q}
              onChange={(event) => applyFilters({ q: event.target.value })}
              placeholder="団体名・活動内容で検索"
            />
          </label>
          <button type="button" className="filter-button" onClick={() => setSheetOpen(true)}>
            絞り込み
            {conditionCount > 0 && <span>{conditionCount}</span>}
          </button>
        </div>

        {conditionCount > 0 && (
          <div className="active-filter-row">
            <span>{conditionCount}個の条件を適用中</span>
            <button type="button" onClick={() => applyFilters({ ...EMPTY_FILTERS, q: filters.q })}>条件をクリア</button>
          </div>
        )}

        {filtered.length ? (
          <div className="directory-grid">
            {filtered.map((circle, index) => (
              <Link
                key={circle.id}
                href={`/c/${circle.id}${filtersToQuery(filters)}`}
                className="directory-link"
              >
                <CircleTile circle={circle} priority={index < 2} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-result">
            <h3>条件に合う団体がありません</h3>
            <p>検索語や絞り込み条件を少し変えてみてください。</p>
            <button type="button" onClick={() => applyFilters(EMPTY_FILTERS)}>すべての条件をクリア</button>
          </div>
        )}
      </section>

      {sheetOpen && (
        <div className="filter-dialog" role="dialog" aria-modal="true" aria-labelledby="filter-title">
          <button className="filter-dialog__backdrop" aria-label="絞り込みを閉じる" onClick={() => setSheetOpen(false)} />
          <div className="filter-sheet">
            <div className="filter-sheet__header">
              <div>
                <p className="section-kicker">条件を組み合わせる</p>
                <h2 id="filter-title">絞り込み</h2>
              </div>
              <button type="button" onClick={() => setSheetOpen(false)}>閉じる</button>
            </div>
            <div className="filter-sheet__body">
              <FilterHeading>この曜日に活動</FilterHeading>
              <div className="day-filters">
                {DAY_ORDER.map((day) => {
                  const on = filters.days.includes(day);
                  return (
                    <button type="button" key={day} aria-pressed={on} onClick={() => toggleIn("days", day)} className={on ? "is-active" : ""}>
                      {DAY_LABELS[day]}
                    </button>
                  );
                })}
              </div>

              <FilterHeading>区分</FilterHeading>
              <div className="chip-row">
                {CATS.map((category) => (
                  <button type="button" key={category} aria-pressed={filters.cats.includes(category)} onClick={() => toggleIn("cats", category)} style={{ ...BUTTON_RESET, ...chipStyle(filters.cats.includes(category)) }}>
                    {category}
                  </button>
                ))}
              </div>

              <FilterHeading>ジャンル</FilterHeading>
              <div className="chip-row">
                {GENRES.map((genre) => (
                  <button type="button" key={genre} aria-pressed={filters.genres.includes(genre)} onClick={() => toggleIn("genres", genre)} style={{ ...BUTTON_RESET, ...chipStyle(filters.genres.includes(genre)) }}>
                    <span className="genre-dot" style={{ background: genreColor(genre) }} />{genre}
                  </button>
                ))}
              </div>

              <FilterHeading>年会費</FilterHeading>
              <div className="chip-row">
                {FEES.map((fee) => (
                  <button type="button" key={fee} aria-pressed={filters.fee === fee} onClick={() => applyFilters({ fee })} style={{ ...BUTTON_RESET, ...chipStyle(filters.fee === fee) }}>
                    {fee}
                  </button>
                ))}
              </div>

              <button type="button" role="switch" aria-checked={filters.beginner} className="beginner-switch" onClick={() => applyFilters({ beginner: !filters.beginner })}>
                <span>初心者がいる団体だけ</span>
                <span style={switchTrack(filters.beginner)} aria-hidden="true"><span style={switchKnob(filters.beginner)} /></span>
              </button>
            </div>
            <div className="filter-sheet__footer">
              <button type="button" className="clear-button" onClick={() => applyFilters({ ...EMPTY_FILTERS, q: filters.q })}>条件をクリア</button>
              <button type="button" className="show-button" onClick={() => setSheetOpen(false)}>{filtered.length}件を表示</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function FilterHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="filter-heading">{children}</h3>;
}
