"use client";

// prefers-reduced-motion の購読（要件定義 §7 の必須要件）。
//
// メディアクエリはReactの外の状態なので useSyncExternalStore で読む。
// サーバー側は false（動きあり）を返す。この値はJSXに出さず、
// アニメーションを起こすかどうかの判定にだけ使うので、ハイドレーションはずれない。

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot() {
  return !!window.matchMedia && window.matchMedia(QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
