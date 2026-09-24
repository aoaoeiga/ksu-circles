// 一覧（S-01）。静的生成。
//
// searchParams はここ（サーバー）では読まない。読むとページが動的レンダリングになり、
// CLAUDE.md §8 に反する。読むのは HomeWithFilters（client）だけ。
// fallback には絞り込み前の全件を出す（docs/14-nextjs-notes.md §2）。
// 確認用ページの団体（listed: false）は一覧に出さない。

import { Suspense } from "react";
import { listedCircles } from "@/lib/circles";
import HomeScreen from "@/components/HomeScreen";
import HomeWithFilters from "@/components/HomeWithFilters";

export default function Home() {
  return (
    <Suspense fallback={<HomeScreen circles={listedCircles} />}>
      <HomeWithFilters circles={listedCircles} />
    </Suspense>
  );
}
