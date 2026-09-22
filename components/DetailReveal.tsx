"use client";

import { motion, useReducedMotion } from "framer-motion";
import { DETAIL_REVEAL_TRANSITION } from "@/lib/motion";

export default function DetailReveal({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduced ? { duration: 0 } : DETAIL_REVEAL_TRANSITION}
    >
      {children}
    </motion.div>
  );
}
