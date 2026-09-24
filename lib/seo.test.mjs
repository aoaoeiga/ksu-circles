import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCTION_ORIGIN, siteOrigin } from "./seo.ts";

test("siteOrigin: 本番は固定の URL、preview はそのデプロイ自身の URL", () => {
  assert.equal(PRODUCTION_ORIGIN, "https://ksu-circles.vercel.app");
  // 本番は VERCEL_URL（デプロイごとの URL）が来ても本番の URL を使う
  assert.equal(
    siteOrigin({ VERCEL_ENV: "production", VERCEL_URL: "ksu-circles-abc123.vercel.app" }),
    "https://ksu-circles.vercel.app"
  );
  assert.equal(
    siteOrigin({
      VERCEL_ENV: "preview",
      VERCEL_URL: "ksu-circles-abc123.vercel.app",
      VERCEL_BRANCH_URL: "ksu-circles-git-preview.vercel.app",
    }),
    "https://ksu-circles-abc123.vercel.app"
  );
  assert.equal(
    siteOrigin({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "ksu-circles-git-preview.vercel.app" }),
    "https://ksu-circles-git-preview.vercel.app"
  );
  assert.equal(siteOrigin({}), "http://localhost:3000");
  assert.equal(siteOrigin({ VERCEL_ENV: "development", VERCEL_URL: "x.vercel.app" }), "http://localhost:3000");
});
