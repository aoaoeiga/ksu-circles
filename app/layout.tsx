import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BG } from "@/lib/design";
import { ALLOW_INDEXING, siteOrigin } from "@/lib/seo";
import RouteMotion from "@/components/RouteMotion";
import { fontVariables } from "@/lib/fonts";

export const metadata: Metadata = {
  // OGP などの相対 URL の起点。本番は本番の URL、preview はそのデプロイ自身（lib/seo.ts）
  metadataBase: new URL(siteOrigin()),
  title: "京産大サークル名鑑",
  description: "京都産業大学の課外活動団体を、同じ項目で横断して比べられる名鑑。",

  // 公開前は全ページを noindex, nofollow。ルートレイアウトに置くので
  // 一覧・団体ページ・404 のすべてに効く。ALLOW_INDEXING=1 のときだけ外れる（lib/seo.ts）
  robots: ALLOW_INDEXING
    ? undefined
    : {
        index: false,
        follow: false,
        googleBot: { index: false, follow: false },
      },
};

export const viewport: Viewport = {
  // スマホ縦画面（375〜430px）が基準（docs/01-requirements.md §7）
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // 書体は lib/fonts.ts（next/font）。4つの CSS 変数を <html> で定義し、画面側は var(--font-…) で指定する。
    // 以前の Google Fonts の <link> は、読み終わるまで描画を止めていた（docs/ui-audit-2026-09-24.md F1）
    <html lang="ja" className={fontVariables}>
      <body>
        {/* 移植元の外側2枚のラッパ。PCでは中央1カラム（最大960px） */}
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            justifyContent: "center",
            background: BG,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 960,
              background: BG,
              minHeight: "100vh",
              position: "relative",
            }}
          >
            <RouteMotion>{children}</RouteMotion>
          </div>
        </div>
      </body>
    </html>
  );
}
