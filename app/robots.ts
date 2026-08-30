// /robots.txt を生成する。
//
// **常に allow。**公開前でもクロールは止めない。
// クロールを止めると、クローラがページを取得できず、中の
// <meta name="robots" content="noindex, nofollow"> を読めない。
// その結果、外部リンクから URL を知った検索エンジンが、内容なしの URL だけを
// 検索結果に載せることがある。プレビューURLは団体へDMで送るので、この経路が実在する。
//
// 索引の可否は app/layout.tsx の meta と ALLOW_INDEXING で制御する（lib/seo.ts）。
// ここは「読ませてから、載せるなと伝える」ための入口を開けておくだけ。

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" } };
}
