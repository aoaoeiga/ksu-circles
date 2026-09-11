"use client";

import { AnimatePresence, LayoutGroup, motion, MotionConfig, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";

export default function RouteMotion({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const transition = reduced ? { duration: 0 } : { duration: 0.24, ease: "easeOut" as const };

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <LayoutGroup id="circle-pages">
        <AnimatePresence initial={false} mode="sync">
          <motion.div
            key={pathname}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={transition}
            style={{ minHeight: "100vh" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </LayoutGroup>
    </MotionConfig>
  );
}
