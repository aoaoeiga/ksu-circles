// 検索エンジンに載せてよいかの判定。
//
// **既定は「載せない」。**環境変数 ALLOW_INDEXING=1 を明示的に置いたときだけ載せる。
// 設定を忘れたときに公開前の内容が検索に出るより、設定を忘れて出ないほうが取り返しがつく。
//
// 公開可否が空欄・確認中の団体の確認用ページは、この値に関わらず常に noindex
// （app/c/[id]/page.tsx の generateMetadata）。ここで決めるのは一覧と公開済みの団体ページ。
//
// 完全な静的生成なので、この値はビルド時に固定される。
// 変えたら Vercel で再デプロイが要る（環境変数を変えただけでは反映されない）。

export const ALLOW_INDEXING = process.env.ALLOW_INDEXING === "1";

/** 本番の URL。OGP などの絶対 URL は、本番ではここを起点にする */
export const PRODUCTION_ORIGIN = "https://ksu-circles.vercel.app";

/**
 * このビルドが置かれる場所の起点 URL（metadataBase に渡す）。
 *
 * - 本番（VERCEL_ENV=production）: PRODUCTION_ORIGIN
 * - preview: そのデプロイ自身の URL（VERCEL_URL。無ければ VERCEL_BRANCH_URL）。
 *   本番の URL を指すと、まだ本番に無い画像が OGP に出て、シェアしたときに画像が欠ける
 * - それ以外（手元）: http://localhost:3000
 *
 * Vercel のシステム環境変数はビルド時に読める。静的生成なので、値はビルド時に固定される
 */
export function siteOrigin(env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL_ENV === "production") return PRODUCTION_ORIGIN;
  if (env.VERCEL_ENV === "preview") {
    const host = env.VERCEL_URL || env.VERCEL_BRANCH_URL;
    if (host) return `https://${host}`;
  }
  return "http://localhost:3000";
}
