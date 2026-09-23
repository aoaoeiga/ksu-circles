import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { readPhotoSources, transformSheets } from "./sheet-transform.ts";
import { mergePhotoSources, scanPhotos } from "./photo-index.ts";
import { centerCrop, isHevcHeif, parseDriveCell, syncCirclePhotos } from "./photos.ts";

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
    surveyed_at: "2026-09-02",
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

test("取材日のGoogle Sheetsシリアル値を1899-12-30起点で解釈する", () => {
  const input = structuredClone(fixture);
  const surveyedAt = input.掲載データ[0].indexOf("取材日");
  input.掲載データ[1][surveyedAt] = 46264;

  const result = transformSheets(input, { includeUnconfirmed: true, now, photos });
  assert.equal(result.circles[0].surveyed_at, "2026-08-30");
  assert.equal(
    result.warnings.some(
      (warning) => warning.id === "c901" && warning.message.startsWith("取材日が読めない")
    ),
    false
  );
});

test("transformSheets は写真の列を自分で読まず、渡された走査結果だけを使う", () => {
  const result = transformSheets(fixture, { includeUnconfirmed: true, now });
  // photos を渡さなければ、シートにURLがあっても写真なし
  assert.equal(result.circles[0].icon, null);
  assert.deepEqual(result.circles[0].photos, []);
  assert.ok(
    result.warnings.some((w) => w.id === "c901" && w.message.startsWith("写真0枚")),
    "写真0枚の警告がない"
  );
});

test("ジャンルは掲載データを優先し、空なら団体マスタから引く", () => {
  const genreAt = fixture.掲載データ[0].indexOf("ジャンル");
  const clone = () => JSON.parse(JSON.stringify(fixture));

  // 掲載データが空 → 団体マスタの「球技」を使う
  const fallback = clone();
  fallback.掲載データ[1][genreAt] = "";
  const byMaster = transformSheets(fallback, { now, photos });
  assert.equal(byMaster.circles[0].genre, "球技");

  // 掲載データに値がある → 団体マスタ（球技）より掲載データが勝つ
  const override = clone();
  override.掲載データ[1][genreAt] = "音楽";
  const byPublish = transformSheets(override, { now, photos });
  assert.equal(byPublish.circles[0].genre, "音楽");

  // どちらも空 → その他に落として、そのことを警告する
  const empty = clone();
  empty.掲載データ[1][genreAt] = "";
  empty.団体マスタ[1][empty.団体マスタ[0].indexOf("ジャンル")] = "";
  const none = transformSheets(empty, { now, photos });
  assert.equal(none.circles[0].genre, "その他");
  assert.ok(
    none.warnings.some((w) => w.id === "c901" && w.message.startsWith("ジャンルが空")),
    "ジャンルが空の警告がない"
  );
});

test("parseDriveCell: カンマ区切りのDrive URLからファイルIDを取り出す", () => {
  const id1 = "1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB01";
  const id2 = "1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC02";
  const base = "https://drive.google.com/open?id=";
  assert.deepEqual(parseDriveCell(`${base}${id1}, ${base}${id2}`), [id1, id2]);
  // 空セル・未入力・URLでない文字列は黙って捨てる
  assert.deepEqual(parseDriveCell(""), []);
  assert.deepEqual(parseDriveCell(undefined), []);
  assert.deepEqual(parseDriveCell("あとで入れます"), []);
  // 末尾のカンマや余分な空白が混ざっても件数が増えない
  assert.deepEqual(parseDriveCell(`  ${base}${id1} ,  `), [id1]);
});

test("readPhotoSources: 団体IDごとに写真の元セルと聞き取りメモを引ける", () => {
  const sources = readPhotoSources(fixture.掲載データ);
  const c901 = sources.get("c901");
  assert.equal(parseDriveCell(c901.icon).length, 1);
  assert.equal(parseDriveCell(c901.photos).length, 2);
  // 聞き取りメモに紛れた写真のURLは、写真_元 へ移す必要があるので拾えること
  assert.ok(c901.memo.includes("drive.google.com"));
  // 写真の元が空の団体は null（「写真枚数」は参考用なので読まない）
  assert.deepEqual(sources.get("c902"), {
    icon: null,
    photos: null,
    memo: "読まないメモ",
  });
});

test("手で public/circles/<団体ID>/ に置いた写真を、シートが空でも拾う", async () => {
  // c047 / c014 の運用。最終形の webp を置くだけで出したい
  const root = mkdtempSync(join(tmpdir(), "ksu-manual-"));
  try {
    const dir = join(root, "circles", "c047");
    mkdirSync(dir, { recursive: true });
    for (const f of ["icon.webp", "01.webp", "02.webp", "03.webp", "メモ.txt", "0.webp"]) {
      writeFileSync(join(dir, f), "");
    }
    // シートの写真_元・アイコン写真_元がどちらも空でも拾えること
    const got = await syncCirclePhotos(null, "c047", undefined, undefined, root);
    assert.equal(got.icon, "/circles/c047/icon.webp");
    assert.deepEqual(got.photos, [
      "/circles/c047/01.webp",
      "/circles/c047/02.webp",
      "/circles/c047/03.webp",
    ]);
    // 手置きなので明るさの記録は無い（manifest が無い）
    assert.deepEqual(got.stats, []);
    // ディレクトリが無い団体は空。ここで例外を投げない
    const none = await syncCirclePhotos(null, "c999", undefined, undefined, root);
    assert.deepEqual(none, { icon: null, photos: [], stats: [], failures: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("写真が1枚読めなくても、残りの写真は取り込む", async () => {
  // HEIC など sharp が読めない形式が1枚混ざるケース。
  // その1枚だけ落として、他の写真とアイコンは出したい
  const root = mkdtempSync(join(tmpdir(), "ksu-partial-"));
  try {
    const png = await sharp({
      create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 10, b: 10 } },
    }).png().toBuffer();
    const bad = "1BADBADBADBADBADBADBADBADBADBAD04";
    const cell = ["1AAA", "1BBB", "1CCC", bad]
      .map((x) => `https://drive.google.com/open?id=${x.padEnd(33, "x")}`)
      .join(", ");

    const got = await syncCirclePhotos(null, "c056", undefined, cell, root, {
      download: async (_auth, fileId) => {
        if (fileId.startsWith("1BADBAD")) throw new Error("Input buffer contains unsupported image format");
        return png;
      },
    });

    // 落ちた1枚を除いて出す。番号は詰めない
    assert.deepEqual(got.photos, [
      "/circles/c056/01.webp",
      "/circles/c056/02.webp",
      "/circles/c056/03.webp",
    ]);
    assert.equal(got.failures.length, 1);
    assert.equal(got.failures[0].name, "04.webp");
    assert.match(got.failures[0].message, /unsupported image format/);
    // 取り込めた3枚の明るさは記録されている（1枚落ちても manifest を書く）
    assert.equal(got.stats.length, 3);
    assert.ok(got.stats.every((s) => s.brightness > 1), "暗い画像なので持ち上がるはず");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mergePhotoSources: public/circles を優先し、無ければ public/photos に落とす", () => {
  const legacy = { icon: "c056-icon.webp", photos: ["c056-1.webp", "c056-2.webp"] };

  // 新しいほうがあれば、それだけを使う（混ぜない）
  const fresh = { icon: "/circles/c056/icon.webp", photos: ["/circles/c056/01.webp"] };
  const a = mergePhotoSources(fresh, legacy);
  assert.deepEqual(a.photos, ["/circles/c056/01.webp"]);
  assert.equal(a.icon, "/circles/c056/icon.webp");
  assert.equal(a.usesLegacyPhotos, false);

  // 新しいほうが空なら、古いほうを出し続ける（c054 の経路）
  const b = mergePhotoSources({ icon: null, photos: [] }, legacy);
  assert.deepEqual(b.photos, legacy.photos);
  assert.equal(b.icon, "c056-icon.webp");
  assert.equal(b.usesLegacyPhotos, true);
  assert.equal(b.usesLegacyIcon, true);

  // アイコンと写真は別々に判定する（手置きの写真＋旧アイコン）
  const c = mergePhotoSources({ icon: null, photos: ["/circles/c047/01.webp"] }, legacy);
  assert.deepEqual(c.photos, ["/circles/c047/01.webp"]);
  assert.equal(c.icon, "c056-icon.webp");
  assert.equal(c.usesLegacyPhotos, false);
  assert.equal(c.usesLegacyIcon, true);

  // 両方空なら空。上限は5枚
  assert.deepEqual(mergePhotoSources({ icon: null, photos: [] }, undefined), {
    icon: null, photos: [], usesLegacyPhotos: false, usesLegacyIcon: false,
  });
  const many = ["1","2","3","4","5","6"].map((n) => `/circles/c001/0${n}.webp`);
  assert.equal(mergePhotoSources({ icon: null, photos: many }, undefined).photos.length, 5);
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
      "c903-4.webp", "c903-4@600.webp",
      "c903-5.webp", "c903-5@600.webp",
      "c903-6.webp", "c903-6@600.webp",    // 6枚目は上限超え
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
    assert.deepEqual(c903.photos, [
      "c903-1.webp", "c903-2.webp", "c903-3.webp", "c903-4.webp", "c903-5.webp",
    ]);
    assert.ok(c903.warnings.some((w) => w.includes("6枚目以降の1枚は無視")));
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
    "写真0枚（アイコンは頭文字タイルで出る）",
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

test("isHevcHeif: 拡張子ではなく ftyp のブランドで HEIC を見分ける", async () => {
  // ftyp ボックス: [サイズ4][ftyp][主ブランド4][マイナー4][互換ブランド…]
  const ftyp = (major, ...compatible) => {
    const size = 16 + compatible.length * 4;
    const buf = Buffer.alloc(size);
    buf.writeUInt32BE(size, 0);
    buf.write("ftyp", 4, "ascii");
    buf.write(major, 8, "ascii");
    compatible.forEach((brand, i) => buf.write(brand, 16 + i * 4, "ascii"));
    return buf;
  };
  // iPhone の .HEIC（c056 の4枚目と同じ並び）
  assert.equal(isHevcHeif(ftyp("heic", "mif1", "MiHB", "MiHA", "heix")), true);
  // 主ブランドが mif1 でも、互換に heic があれば HEIC
  assert.equal(isHevcHeif(ftyp("mif1", "heic")), true);
  // AVIF は sharp が読めるので変換しない
  assert.equal(isHevcHeif(ftyp("avif", "mif1", "miaf")), false);
  // JPEG / PNG / 短すぎるもの
  const jpeg = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#888" } }).jpeg().toBuffer();
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#888" } }).png().toBuffer();
  assert.equal(isHevcHeif(jpeg), false);
  assert.equal(isHevcHeif(png), false);
  assert.equal(isHevcHeif(Buffer.from("ftyp")), false);
});

test("centerCrop: 中央で最大の領域を取り、はみ出さない", () => {
  assert.deepEqual(centerCrop(1600, 1600, 1.5), { left: 0, top: 267, width: 1600, height: 1066 });
  assert.deepEqual(centerCrop(3000, 1000, 1.5), { left: 750, top: 0, width: 1500, height: 1000 });
  assert.deepEqual(centerCrop(640, 640, 1), { left: 0, top: 0, width: 640, height: 640 });
});

test("写真は元の大きさに関わらず 3:2、アイコンは 1:1 で出す（小さい元は拡大しない）", async () => {
  const root = mkdtempSync(join(tmpdir(), "ksu-ratio-"));
  // [元の幅, 高さ, EXIF の向き]。向き6は縦位置のスマホ写真（保存は横、表示は縦）
  const sources = [
    [1477, 1108], // c056/01 の元と同じ。以前は 1477×1067 に崩れていた
    [1108, 1477], // 縦長で幅が 1600 未満
    [800, 300], // 横に長い小さな画像
    [4000, 3000], // 大きい画像は 1600×1067 まで縮める
    [1200, 900, 6], // 表示は 900×1200。横倒しのまま切り抜くと 3:2 の枠がはみ出す
  ];
  const images = await Promise.all(
    sources.map(([width, height, orientation]) => {
      const img = sharp({ create: { width, height, channels: 3, background: "#777" } }).jpeg();
      return (orientation ? img.withMetadata({ orientation }) : img).toBuffer();
    })
  );
  const ids = sources.map((_, i) => `1RATIO${i}`.padEnd(33, "x"));
  const cell = ids.map((id) => `https://drive.google.com/open?id=${id}`).join(", ");
  const iconId = "1ICON".padEnd(33, "x");
  try {
    await syncCirclePhotos(null, "c900", `https://drive.google.com/open?id=${iconId}`, cell, root, {
      download: async (_auth, fileId) => (fileId === iconId ? images[2] : images[ids.indexOf(fileId)]),
    });
    const dir = join(root, "circles", "c900");
    const size = async (name) => {
      const { width, height } = await sharp(join(dir, name)).metadata();
      return { width, height, ratio: width / height };
    };
    for (const [i, [w, h, orientation]] of sources.entries()) {
      const got = await size(`0${i + 1}.webp`);
      const label = `${w}×${h}${orientation ? `（向き${orientation}）` : ""} → ${got.width}×${got.height}`;
      assert.ok(Math.abs(got.ratio - 1.5) < 0.01, `3:2 になっていない: ${label}`);
      assert.ok(got.width <= 1600, `1600 を超えている: ${label}`);
      const shownWidth = orientation >= 5 ? h : w;
      assert.ok(got.width <= shownWidth, `拡大している: ${label}`);
    }
    // 大きい元は上限まで縮める
    assert.deepEqual(await size("04.webp"), { width: 1600, height: 1067, ratio: 1600 / 1067 });
    // 向き6（縦位置）は表示の向きで切り抜く: 900×1200 → 900×600
    assert.deepEqual(await size("05.webp"), { width: 900, height: 600, ratio: 1.5 });
    const icon = await size("icon.webp");
    assert.equal(icon.width, icon.height, "アイコンが正方形でない");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
