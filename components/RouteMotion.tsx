"use client";

import { MotionConfig, useReducedMotion } from "framer-motion";

export default function RouteMotion({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();

  // 一覧と詳細をつなぐ拡大・縮小は lib/flip.ts が自前で行う（LayoutGroup は使わない）。
  // ここは詳細の中身のフェードなど、ページ内の motion に効かせる設定だけを持つ。
  return <MotionConfig reducedMotion={reduced ? "always" : "never"}>{children}</MotionConfig>;
}
