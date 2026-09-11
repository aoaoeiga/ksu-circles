"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import CircleAvatar from "@/components/CircleAvatar";
import { easeText, feeText } from "@/lib/labels";
import type { Circle, Genre } from "@/types/circle";

const GENRES: Genre[] = ["球技", "武道", "音楽", "文化・創作", "ボランティア", "その他"];
const CONDITIONS = ["会費なし", "週1以下", "緩め"] as const;
type Condition = (typeof CONDITIONS)[number];

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja-JP");
}

function isWeeklyOnceOrLess(frequency: string | null): boolean {
  if (!frequency) return false;
  const value = normalized(frequency);
  if (value.includes("隔週")) return true;
  const weekly = /週\s*(\d+(?:\.\d+)?)\s*回?/.exec(value);
  if (weekly) return Number(weekly[1]) <= 1;
  const monthly = /月\s*(\d+(?:\.\d+)?)\s*回?/.exec(value);
  return monthly ? Number(monthly[1]) <= 4 : false;
}

function isLoose(ease: string | null): boolean {
  if (!ease) return false;
  const value = normalized(ease);
  if (/(原則参加|参加必須|欠席不可)/.test(value)) return false;
  return /(緩|ゆる|自由|任意|自分のペース|途中参加|欠席.*可)/.test(value);
}

function matchesCondition(circle: Circle, condition: Condition): boolean {
  if (condition === "会費なし") return circle.annual_fee === 0;
  if (condition === "週1以下") return isWeeklyOnceOrLess(circle.frequency);
  return isLoose(circle.ease);
}

function searchableText(circle: Circle): string {
  return normalized(
    [
      circle.short_name,
      circle.name,
      circle.one_liner,
      circle.division,
      circle.category,
      circle.genre,
      circle.frequency,
      circle.place,
      circle.ease,
      circle.senior_call,
      circle.multi_club,
      circle.description,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function CardMedia({ circle }: { circle: Circle }) {
  const [failed, setFailed] = useState(false);
  const photo = circle.photos[0] ?? null;

  return (
    <div className="card-media">
      {photo && !failed ? (
        // public/photosの変換済み画像を使い、失敗時は同じ領域で頭文字へ戻す。
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/photos/${photo.replace(/\.webp$/, "@600.webp")}`}
          alt=""
          width={600}
          height={338}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <CircleAvatar circle={circle} size={72} />
      )}
    </div>
  );
}

function CircleCard({ circle }: { circle: Circle }) {
  const facts = [circle.frequency ?? "未確認", feeText(circle), easeText(circle)];

  return (
    <Link className="circle-card" href={`/c/${circle.id}`}>
      <CardMedia circle={circle} />
      <div className="card-body">
        <div className="card-heading">
          <CircleAvatar circle={circle} />
          <div>
            <h2 className="card-name">{circle.short_name}</h2>
            <p className="card-copy">{circle.one_liner || "キャッチコピー 未確認"}</p>
          </div>
        </div>
        <div className="fact-chips" aria-label="団体の主な事実">
          {facts.map((fact, index) => (
            <span className="fact-chip" title={fact} key={`${fact}-${index}`}>
              {fact}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

export default function HomeScreen({ circles }: { circles: Circle[] }) {
  const [query, setQuery] = useState("");
  const [genres, setGenres] = useState<Genre[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([]);

  const filtered = useMemo(() => {
    const needle = normalized(query.trim());
    return circles.filter((circle) => {
      if (needle && !searchableText(circle).includes(needle)) return false;
      if (genres.length > 0 && !genres.includes(circle.genre)) return false;
      return conditions.every((condition) => matchesCondition(circle, condition));
    });
  }, [circles, conditions, genres, query]);

  const toggleGenre = (genre: Genre) => {
    setGenres((current) =>
      current.includes(genre) ? current.filter((item) => item !== genre) : [...current, genre]
    );
  };

  const toggleCondition = (condition: Condition) => {
    setConditions((current) =>
      current.includes(condition)
        ? current.filter((item) => item !== condition)
        : [...current, condition]
    );
  };

  return (
    <div className="page">
      <header className="site-header">
        <h1>京産大サークル名鑑</h1>
        <p>面談で聞いた事実を、同じ項目で比べる。</p>
      </header>

      <label>
        <span className="sr-only">団体を検索</span>
        <input
          className="search-field"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="団体名・キーワードで検索"
        />
      </label>

      <div className="chip-strip" aria-label="団体の絞り込み">
        {GENRES.map((genre) => (
          <button
            className="filter-chip"
            type="button"
            aria-pressed={genres.includes(genre)}
            onClick={() => toggleGenre(genre)}
            key={genre}
          >
            {genre}
          </button>
        ))}
        {CONDITIONS.map((condition) => (
          <button
            className="filter-chip"
            type="button"
            aria-pressed={conditions.includes(condition)}
            onClick={() => toggleCondition(condition)}
            key={condition}
          >
            {condition}
          </button>
        ))}
      </div>

      <p className="result-count" aria-live="polite">
        {filtered.length}団体
      </p>

      {filtered.length > 0 ? (
        <div className="card-list">
          {filtered.map((circle) => (
            <CircleCard circle={circle} key={circle.id} />
          ))}
        </div>
      ) : (
        <div className="empty-state">条件に合う団体がありません。</div>
      )}
    </div>
  );
}
