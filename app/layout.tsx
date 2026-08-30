import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BG } from "@/lib/design";

export const metadata: Metadata = {
  title: "京産大サークル名鑑",
  description: "京都産業大学の課外活動団体を、同じ項目で横断して比べられる名鑑。",
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
    <html lang="ja">
      <head>
        {/* design/ksu-circles-v3.dc.html の <helmet> にあった書体。同じ4ファミリを同じ太さで読む。
            no-page-custom-font は Pages Router の _document 向けの規則で、
            App Router のルートレイアウトに置く分には全ページに効くため当てはまらない。
            next/font に替えると font-family 名が変わり、移植した inline style の指定と
            合わなくなるので、移植元と同じ <link> のまま置く。 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@700&family=Zen+Kaku+Gothic+New:wght@500;700&family=Noto+Sans+JP:wght@400;500&family=Outfit:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
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
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
