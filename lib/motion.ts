/** 拡大・縮小が終わるころに、詳細の中身が静かに出る。
 *  遅らせる時間は lib/flip.ts の拡大・縮小（380ms）に合わせてある。 */
export const DETAIL_REVEAL_TRANSITION = {
  delay: 0.3,
  duration: 0.16,
  ease: "easeOut",
} as const;
