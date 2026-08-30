import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sync が 3:2・WebP・幅1200/600 に変換済みなので、next/image で二重に処理しない。
  // 参照側では width / height を必ず指定する（docs/12-deploy-spec.md §4）。
  images: {
    unoptimized: true,
  },

  // design/ は Claude Design の書き出し（移植元の原本）。ビルドには含めない。
  // 独自記法の .dc.html なので import されることはないが、
  // ファイルトレースにも巻き込まれないよう明示しておく。
  outputFileTracingExcludes: {
    "*": ["./design/**", "./docs/**"],
  },

  // CLAUDE.md は手で管理する。next dev が nextjs-agent-rules ブロックを
  // 追記してくるのを止める（Next 16 の既定は true）。
  // Next 16 固有の作法は docs/14-nextjs-notes.md に自分でまとめてある。
  agentRules: false,

  // サーバーもデータベースも持たない。SSR / ISR / API ルートは作らない（CLAUDE.md §8）。
  // ページは generateStaticParams で全件を静的生成する。
};

export default nextConfig;
