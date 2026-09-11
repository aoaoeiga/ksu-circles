"use client";

import { LayoutGroup, MotionConfig, useReducedMotion } from "framer-motion";

export default function RouteMotion({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <LayoutGroup id="circle-pages">{children}</LayoutGroup>
    </MotionConfig>
  );
}
