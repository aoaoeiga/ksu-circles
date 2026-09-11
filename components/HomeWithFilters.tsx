"use client";

// URLから絞り込みの初期値を読んで HomeScreen に渡すだけの薄い層。
//
// useSearchParams はこの1か所だけに閉じ込める。呼び出し側（app/page.tsx）が
// Suspense に包んでいて、fallback には絞り込み前の全件を出す HomeScreen が入る。
// この形にしないと本番ビルドが落ちる（docs/14-nextjs-notes.md §2）。

import { useSearchParams } from "next/navigation";
import type { Circle } from "@/types/circle";
import HomeScreen, { EMPTY_FILTERS, type Filters } from "@/components/HomeScreen";
import { FEES, FEE_ANY, type FeeChoice } from "@/lib/design";

function list(v: string | null): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

export default function HomeWithFilters({ circles }: { circles: Circle[] }) {
  const sp = useSearchParams();

  const feeRaw = sp.get("fee");
  const fee: FeeChoice =
    feeRaw && (FEES as readonly string[]).includes(feeRaw) ? (feeRaw as FeeChoice) : FEE_ANY;

  const initial: Filters = {
    ...EMPTY_FILTERS,
    days: list(sp.get("days"))
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
    cats: list(sp.get("cats")),
    genres: list(sp.get("genres")),
    fee,
    beginner: sp.get("beginner") === "1",
  };

  return <HomeScreen circles={circles} initial={initial} />;
}
