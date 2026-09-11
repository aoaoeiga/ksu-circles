import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ALLOW_INDEXING } from "@/lib/seo";

const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

export const metadata: Metadata = {
  metadataBase: new URL(deploymentHost ? `https://${deploymentHost}` : "http://localhost:3000"),
  title: "京産大サークル名鑑",
  description: "面談で聞いた事実から、京都産業大学の課外活動団体を比べられる名鑑。",
  robots: ALLOW_INDEXING
    ? undefined
    : {
        index: false,
        follow: false,
        googleBot: { index: false, follow: false },
      },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <main className="site-shell">{children}</main>
      </body>
    </html>
  );
}
