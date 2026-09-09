import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transformSheets } from "./sheet-transform.ts";
import { scanPhotos } from "./photo-index.ts";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/sheet-sample.json", import.meta.url), "utf8")
);
const now = new Date("2026-09-06T00:00:00+09:00");

// public/photos の代わり。c901 にはアイコンと写真2枚、c902 には何も無い
const photos = (id) =>
  id === "c901"
    ? { icon: "c901-icon.webp", photos: ["c901-1.webp", "c901-2.webp"], warnings: [] }
    : undefined;

test("公開用では原稿のないOK行を確認中として除外し、未面談行をスキップする", () => {
  const result = transformSheets(fixture, { now });
  assert.deepEqual(result.circles.map((circle) => circle.id), ["c901"]);
  assert.deepEqual(result.excluded, [{ id: "c902", reason: "公開可否 = 確認中" }]);
  assert.equal(result.sourceRows, 3);
});

test("preview用では確認中を含め、新しいCircle型へ完全変換する", () => {
  const result = transformSheets(fixture, { includeUnconfirmed: true, now, photos });
  assert.deepEqual(result.missingColumns, []);
  assert.deepEqual(result.circles[0], {
    id: "c901",
    short_name: "架空スポーツ",
    name: "架空スポーツ同好会",
    division: "運動系",
    category: "体育会所属クラブ",
    genre: "球技",
    one_liner: "週2日から楽しめる",
    active_days: [0, 2],
    days_undecided: false,
    frequency: "週2〜3回",
    place: "第1体育館",
    annual_fee: 0,
    member_count: 24,
    beginner_count: 18,
    first_year_count: 8,
    male_ratio: 50,
    ease: "自由参加",
    senior_call: "名字＋さん",
    multi_club: "いる / 大会前は要相談",
    description: "架空の紹介文1行目\n架空の紹介文2行目\n架空の紹介文3行目",
    leader_comment: { text: "一緒に楽しみましょう。", role: "代表（3年）" },
    recruiting: "いつでも入れる",
    surveyed_at: "2026-09",
    sns: {
      instagram: "https://example.test/instagram",
      x: "https://example.test/x",
      website: "https://example.test/site"
    },
    icon: "c901-icon.webp",
    photos: ["c901-1.webp", "c901-2.webp"],
    tile_size: "L"
  });
  assert.deepEqual(
    Object.keys(result.circles[0]),
    [
      "id", "short_name", "name", "division", "category", "genre", "one_liner",
      "active_days", "days_undecided", "frequency", "place", "annual_fee",
      "member_count", "beginner_count", "first_year_count", "male_ratio", "ease",
      "senior_call", "multi_club", "description", "leader_comment", "recruiting",
      "surveyed_at", "sns", "icon", "photos", "tile_size"
    ]
  );
});

test("写真はシートの列を読まず、public/photos の走査結果だけを使う", () => {
  const result = transformSheets(fixture, { includeUnconfirmed: true, now });
  // photos を渡さなければ、シートにURLがあっても写真なし
  assert.equal(result.circles[0].icon, null);
  assert.deepEqual(result.circles[0].photos, []);
  assert.ok(
    result.warnings.some((w) => w.id === "c901" && w.message.startsWith("写真0枚")),
    "写真0枚の警告がない"
  );
});

test("scanPhotos: 連番・アイコン・@600・上限を判定する", () => {
  const dir = mkdtempSync(join(tmpdir(), "ksu-photos-"));
  try {
    for (const f of [
      "c901-icon.webp",
      "c901-1.webp", "c901-1@600.webp",
      "c901-2.webp", "c901-2@600.webp",
      "c902-1.webp",                       // @600 が無い
      "c902-3.webp", "c902-3@600.webp",    // 2 が無いのに 3 がある
      "c903-1.webp", "c903-1@600.webp",
      "c903-2.webp", "c903-2@600.webp",
      "c903-3.webp", "c903-3@600.webp",
      "c903-4.webp", "c903-4@600.webp",    // 4枚目は上限超え
      "memo.txt",
    ]) writeFileSync(join(dir, f), "");
    const index = scanPhotos(dir);
    assert.deepEqual(index.byId.get("c901"), {
      icon: "c901-icon.webp",
      photos: ["c901-1.webp", "c901-2.webp"],
      warnings: [],
    });
    const c902 = index.byId.get("c902");
    assert.equal(c902.icon, null);
    assert.deepEqual(c902.photos, ["c902-1.webp", "c902-3.webp"]);
    assert.ok(c902.warnings.some((w) => w.includes("連番が飛んでいる")));
    assert.ok(c902.warnings.some((w) => w.includes("c902-1@600.webp が無い")));
    const c903 = index.byId.get("c903");
    assert.deepEqual(c903.photos, ["c903-1.webp", "c903-2.webp", "c903-3.webp"]);
    assert.ok(c903.warnings.some((w) => w.includes("4枚目以降の1枚は無視")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("フィクスチャでB-3の警告経路を通す", () => {
  const result = transformSheets(fixture, { includeUnconfirmed: true, now });
  const messages = result.warnings
    .filter((warning) => warning.id === "c902")
    .map((warning) => warning.message);
  for (const expected of [
    "原稿なしで OK になっている",
    "団体マスタの大分類が空（\"その他\"を使用）",
    "男子割合が0〜100の範囲外（\"101\" → null）",
    "キャッチコピーが空のため「一言」を使用",
    "役職に個人名が混ざっている可能性（\"架空太郎\" → \"代表\" に置換）",
    "取材日が月日どちらとも取れる形（\"9/2/2026\" → 2026-09-02 と解釈）",
    "写真0枚（public/photos に c902-1.webp も c902-icon.webp も無い）",
    "初心者 6 > 所属人数 5",
    "年会費が未確認",
    "紹介文が空",
    "区分が未知値（\"未知区分\" → \"委員会・その他\"）",
    "ジャンルが未知値（\"未知ジャンル\" → \"その他\"）",
    "いま入れるかが未知値（\"時期による\" → null）",
    "Instagram がURL形式でない（\"URLではない\"）",
    "tile_size が S/M/L でない（\"XL\" → \"M\"）"
  ]) {
    assert.ok(messages.includes(expected), `警告がない: ${expected}`);
  }
});
