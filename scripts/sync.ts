// スプレッドシート → data/circles.json
//
// docs/10-sync-spec.md の実装。シートを読んで変換し、public/photos を走査する。
// 写真は手元で 3:2・WebP・幅1200/600 に変換して置く方式（仕様書 §7）。
// このスクリプトは Drive を見ないし、画像を書き出しもしない。**あるファイルを数えるだけ。**
//
// 守っていること（仕様書 §0）
// - 原本はシート。circles.json は中間生成物。**手で直さない**
// - AIを使わない。同じシートからは常に同じJSONが出る
// - 冪等。変化がなければ書き込まない
//
// 使い方
//   npm run sync                    取得 → 検証 → 変換 → 差分を見せて書き出し
//   npm run sync -- --dry-run       書き込まない。レポートだけ
//   npm run sync -- --print         変換結果のJSONを標準出力に出す（確認用）
//   npm run sync -- --list-sheets   シートのタブ名を並べる（SHEET_NAME の確認用）
//   npm run sync -- --only=c001,c004
//   npm run sync -- --yes           差分の確認を飛ばす

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { GoogleAuth, Impersonated, JWT, type AuthClient } from "google-auth-library";
import type {
  Circle,
  CircleFile,
  Category,
  Division,
  Genre,
  Recruiting,
} from "../types/circle.ts";

// ---------------------------------------------------------------- 設定

const OUT_JSON = "data/circles.json";
const OUT_REPORT = "data/report.md";
const PHOTO_DIR = "public/photos";
const MAX_PHOTOS = 8;

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

/**
 * シートの列見出し。docs/ops/11-form-builder.md の SPEC と同じ文字列。
 * フォームの設問名を後から変えても動くよう、候補を複数受ける。
 */
const COLS = {
  id: ["団体ID"],
  surveyedAt: ["取材日"],
  role: ["面談相手の役職と学年"],
  shortName: ["通称（サイトに大きく出す名前）", "通称"],
  name: ["正式名称"],
  division: ["大分類"],
  category: ["公式の所属区分"],
  genre: ["ジャンル"],
  days: ["活動曜日"],
  times: ["活動時間"],
  place: ["活動場所"],
  frequency: ["頻度"],
  members: ["所属人数"],
  male: ["男子の人数"],
  female: ["女子の人数"],
  beginners: ["初心者から始めた人数"],
  fee: ["年会費（円）", "年会費"],
  extraCost: ["年会費以外にかかる費用"],
  extraCostNone: ["年会費以外の費用はないか"],
  multi: ["掛け持ち"],
  multiCond: ["掛け持ちの条件"],
  recruiting: ["いま入れるか"],
  welcomeDate: ["次の新歓の日付"],
  welcomeWhat: ["次の新歓の内容"],
  leaderComment: ["代表からの一言（そのまま載せる）", "代表からの一言"],
  catchDraft: ["キャッチコピー案"],
  instagram: ["Instagram のURL", "InstagramのURL"],
  x: ["X のURL", "XのURL"],
  website: ["公式サイトのURL"],
  photoOk: ["写真の掲載可否"],
  publish: ["公開してよいか"],
  // シートに手で足す列（docs/ops/09-form-questions.md §4）
  description: ["紹介文"],
  catchcopy: ["キャッチコピー"],
  // "title size" はシート側の綴り違い（tile の t-i-l-e）。直すまで読めるよう候補に入れてある
  tileSize: ["tile_size", "tile size", "title size", "タイルの大きさ"],
} as const;

const DIVISIONS: Division[] = ["運動系", "文化系", "その他"];
const CATEGORIES: Category[] = [
  "体育会所属クラブ",
  "文化団体連盟",
  "届出団体",
  "学生プロジェクトチーム",
  "委員会・その他",
];
const GENRES: Genre[] = ["球技", "武道", "音楽", "文化・創作", "ボランティア", "その他"];
const RECRUITINGS: Recruiting[] = ["いつでも入れる", "4月のみ", "募集していない"];

/** 0=月 … 6=日（types/circle.ts に合わせる） */
const DAY_INDEX: Record<string, number> = {
  月: 0, 火: 1, 水: 2, 木: 3, 金: 4, 土: 5, 日: 6,
};

// ---------------------------------------------------------------- 小道具

const args = process.argv.slice(2);
const hasFlag = (n: string) => args.includes("--" + n);
const flagValue = (n: string) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : null;
};

const DRY_RUN = hasFlag("dry-run");
const LIST_SHEETS = hasFlag("list-sheets");
const ASSUME_YES = hasFlag("yes");
const PRINT = hasFlag("print");
const ONLY = flagValue("only")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;

/** 全角・空白ゆれを吸収して見出しを突き合わせる */
function normalizeHeader(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, "").trim().toLowerCase();
}

function trimOrNull(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

/** 数値。空欄は null。**0 は 0 のまま返す**（未確認と無料を混同しない） */
function numOrNull(v: string | undefined): number | null {
  const s = (v ?? "").trim().replace(/[,，\s円]/g, "");
  if (s === "") return null;
  const n = Number(s.normalize("NFKC"));
  return Number.isFinite(n) ? n : null;
}

/**
 * 日付を "YYYY-MM-DD" にする。
 *
 * このシートはロケールが US なので **"8/30/2026"（M/D/YYYY）**で入ってくる。
 * 年が先頭の形も受ける。判別は「4桁の年がどちらにあるか」で行う。
 *
 * ambiguous に true が返るのは "3/4/2026" のように月と日のどちらとも取れる場合。
 * 取材日は YYYY-MM に丸めて使うので、取り違えると月がずれる。呼び出し側で警告する。
 */
function toISODate(v: string | undefined): { date: string | null; ambiguous: boolean } {
  const s = (v ?? "").trim().normalize("NFKC");
  if (!s) return { date: null, ambiguous: false };

  // YYYY-MM-DD / YYYY年M月D日
  const ymd = /^(\d{4})[/\-年](\d{1,2})[/\-月](\d{1,2})/.exec(s);
  if (ymd) {
    const [, y, mo, d] = ymd;
    return { date: `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`, ambiguous: false };
  }

  // M/D/YYYY（Googleフォームの既定ロケール）
  const mdy = /^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/.exec(s);
  if (mdy) {
    const [, mo, d, y] = mdy;
    return {
      date: `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`,
      ambiguous: Number(mo) <= 12 && Number(d) <= 12 && mo !== d,
    };
  }

  return { date: null, ambiguous: false };
}

const HHMM = "([0-2]?\\d:[0-5]\\d)";

// ---------------------------------------------------------------- 変換

type Row = Record<string, string>;

type Excluded = { id: string; reason: string };
type Warning = { id: string; message: string };

/**
 * 活動時間。
 *   "18:00-20:00"                       → 全活動日に同じ値
 *   "月 18:00-20:00 / 木 19:00-21:00"   → 曜日ごと
 * パースできなければ空の Record を返して警告（仕様書 §6）
 */
function parseTimes(
  raw: string | null,
  days: number[],
  id: string,
  warn: (m: string) => void
): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  if (!raw) return out;
  const s = raw.normalize("NFKC").replace(/[〜~–—]/g, "-");

  // 曜日つきの指定を先に拾う
  const perDay = [...s.matchAll(new RegExp(`([月火水木金土日])\\s*${HHMM}\\s*-\\s*${HHMM}`, "g"))];
  if (perDay.length > 0) {
    for (const m of perDay) {
      const d = DAY_INDEX[m[1]];
      if (d === undefined) continue;
      out[String(d)] = [m[2], m[3]];
    }
    const missing = days.filter((d) => !(String(d) in out));
    if (missing.length > 0) warn(`活動時間に曜日 ${missing.map((d) => "月火水木金土日"[d]).join("・")} の指定がない`);
    return out;
  }

  // 曜日なし = 全活動日に同じ時間
  const one = new RegExp(`^${HHMM}\\s*-\\s*${HHMM}$`).exec(s.trim());
  if (one) {
    for (const d of days) out[String(d)] = [one[1], one[2]];
    if (days.length === 0) warn("活動時間が入っているが活動曜日が空");
    return out;
  }

  warn(`活動時間の形式が HH:MM-HH:MM でない（"${raw}"）`);
  return out;
}

/** "週2回 / 1回2時間" → {perWeek: 2, hours: 2} */
function parseFrequency(raw: string | null): {
  perWeek: number | null;
  hours: number | null;
} {
  if (!raw) return { perWeek: null, hours: null };
  const s = raw.normalize("NFKC");
  const w = /週\s*(\d+(?:\.\d+)?)\s*回/.exec(s);
  const h = /(\d+(?:\.\d+)?)\s*時間\s*(半|30分)?/.exec(s);
  let hours = h ? Number(h[1]) : null;
  if (h && h[2]) hours = (hours ?? 0) + 0.5;
  return { perWeek: w ? Number(w[1]) : null, hours };
}

/** URL でなければ null にして警告（仕様書 §6） */
function urlOrNull(raw: string | null, label: string, warn: (m: string) => void): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^https?:\/\/\S+$/i.test(s)) return s;
  warn(`${label} がURL形式でない（"${s}"）`);
  return null;
}

/** 個人名が入っていたら落とす。署名は「代表（3年）」の形（CLAUDE.md §7） */
function cleanRole(raw: string | null, warn: (m: string) => void): string {
  const s = (raw ?? "").trim();
  if (!s) return "代表";
  const m = /^\s*(代表|副代表|部長|副部長|主将|副主将|代表者|会長|幹事長|マネージャー)\s*[（(]?\s*(\d)\s*年?\s*[)）]?\s*$/.exec(
    s.normalize("NFKC")
  );
  if (m) return `${m[1]}（${m[2]}年）`;

  // 「代表」のように役職だけ書かれている（学年を聞けていない）。個人名ではないので警告しない
  const roleOnly = /^(代表|副代表|部長|副部長|主将|副主将|代表者|会長|幹事長|マネージャー)$/.exec(
    s.normalize("NFKC").replace(/[\s　]/g, "")
  );
  if (roleOnly) return roleOnly[1];
  // 役職＋学年の形に当てはまらない = 個人名が混ざっている可能性
  const role = /(代表|副代表|部長|副部長|主将|副主将|会長|幹事長|マネージャー)/.exec(s);
  const year = /(\d)\s*年/.exec(s.normalize("NFKC"));
  const rebuilt = year ? `${role ? role[1] : "代表"}（${year[1]}年）` : role ? role[1] : "代表";
  warn(`面談相手の役職と学年に個人名が混ざっている可能性（"${s}" → "${rebuilt}" に置換）`);
  return rebuilt;
}

/**
 * public/photos を1度だけ読んで、団体IDごとの写真を連番順に並べる。
 *
 * 期待するファイル名は `{id}-{連番}.webp`。`@600` は一覧用の別サイズで、
 * **photos 配列には入れない。**参照側が lib/design.ts の photoSrc() で組み立てる。
 *
 * 連番は 1 から詰まっている前提で、抜けがあればそこで止めずに拾えるものを拾い、
 * 呼び出し側で警告する。
 */
function scanPhotos(): { byId: Map<string, string[]>; extra: Map<string, number>; total: number } {
  const byId = new Map<string, { n: number; file: string }[]>();
  if (!existsSync(PHOTO_DIR)) return { byId: new Map(), extra: new Map(), total: 0 };

  for (const file of readdirSync(PHOTO_DIR)) {
    // @600 は数えない。1200 のほうだけを正とする
    const m = /^(c\d{3})-(\d+)\.webp$/.exec(file);
    if (!m) continue;
    const [, id, num] = m;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id)!.push({ n: Number(num), file });
  }

  const out = new Map<string, string[]>();
  const extra = new Map<string, number>();
  let total = 0;
  for (const [id, list] of byId) {
    list.sort((a, b) => a.n - b.n);
    const kept = list.slice(0, MAX_PHOTOS).map((x) => x.file);
    if (list.length > MAX_PHOTOS) extra.set(id, list.length - MAX_PHOTOS);
    out.set(id, kept);
    total += kept.length;
  }
  return { byId: out, extra, total };
}

// ---------------------------------------------------------------- 本体

/**
 * 認証クライアント。3通りを、この優先順で使う。
 *
 * 1. GOOGLE_SERVICE_ACCOUNT_JSON があればサービスアカウントキー
 * 2. IMPERSONATE_SERVICE_ACCOUNT があれば**サービスアカウントの偽装**（既定の運用）
 * 3. どちらも無ければ素の ADC
 *
 * なぜ 2 が既定か。
 * - 組織ポリシー iam.disableServiceAccountKeyCreation でキーが作れない
 * - `gcloud auth application-default login --scopes=...spreadsheets.readonly` は、
 *   gcloud の既定クライアントIDに対して組織がアプリをブロックしていて通らない
 *
 * 偽装は OAuth の同意画面を通らない。自分の ADC で IAM Credentials API を呼び、
 * サービスアカウントのアクセストークンを Sheets スコープ付きで発行してもらう形なので、
 * アプリのブロックにも、キー禁止ポリシーにも当たらない。
 * シートの閲覧権限は、そのサービスアカウントに共有済みのものを使う。
 */
async function makeAuthClient(): Promise<AuthClient> {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (saJson) {
    let creds: { client_email: string; private_key: string };
    try {
      creds = JSON.parse(saJson);
    } catch {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON が JSON として読めません。1行にして ' ' で囲んでいるか確認してください"
      );
    }
    return new JWT({ email: creds.client_email, key: creds.private_key, scopes: SCOPES });
  }

  const impersonate = process.env.IMPERSONATE_SERVICE_ACCOUNT?.trim();

  let source: AuthClient;
  try {
    // 偽装するときは、まず自分の ADC で IAM Credentials API を叩ける必要がある
    source = (await new GoogleAuth({
      scopes: impersonate
        ? ["https://www.googleapis.com/auth/cloud-platform"]
        : SCOPES,
    }).getClient()) as AuthClient;
  } catch {
    throw new Error(
      [
        "Google の認証情報が見つかりません。次を1回だけ実行してください:",
        "",
        "  gcloud auth application-default login",
        "",
        "（--scopes は付けないでください。付けると組織のアプリ制御でブロックされます）",
      ].join("\n")
    );
  }

  if (!impersonate) return source;

  return new Impersonated({
    sourceClient: source,
    targetPrincipal: impersonate,
    targetScopes: SCOPES,
    lifetime: 3600,
  });
}

/**
 * A1記法のシート名。**空白や記号を含む名前は引用符で囲まないと範囲として解釈されない。**
 * 例: Form Responses 1 → 'Form Responses 1'
 */
function a1SheetRange(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

async function fetchSheet(auth: AuthClient, sheetId: string, sheetName: string): Promise<string[][]> {
  const range = encodeURIComponent(a1SheetRange(sheetName));
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?majorDimension=ROWS`;
  const res = await auth.request<{ values?: string[][] }>({ url });
  return res.data.values ?? [];
}

async function fetchSheetNames(auth: AuthClient, sheetId: string): Promise<string[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`;
  const res = await auth.request<{ sheets?: { properties?: { title?: string } }[] }>({ url });
  return (res.data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
}

function buildCircle(
  row: Row,
  pick: (key: keyof typeof COLS) => string | null,
  warn: (m: string) => void,
  photos: string[]
): Circle {
  const id = (pick("id") ?? "").trim();
  const days = (() => {
    const raw = pick("days");
    if (!raw) return [];
    const out: number[] = [];
    for (const part of raw.split(/[,、，]/)) {
      const t = part.trim();
      if (t === "決まっていない" || t === "") continue;
      const d = DAY_INDEX[t];
      if (d !== undefined && !out.includes(d)) out.push(d);
    }
    return out.sort((a, b) => a - b);
  })();

  const times = parseTimes(pick("times"), days, id, warn);
  const freq = parseFrequency(pick("frequency"));

  const male = numOrNull(row[COLS.male[0]] ?? undefined);
  const female = numOrNull(row[COLS.female[0]] ?? undefined);
  // **片方でも空欄なら null。**片方だけでは比率が出せない（仕様書 §6）
  const gender = male !== null && female !== null ? { male, female } : null;

  // 年会費以外の費用: ない→"なし" / ある→記述 / 聞けなかった・空→null（未確認）
  const extraChoice = pick("extraCostNone");
  const extraText = pick("extraCost");
  let extraCostNote: string | null = null;
  if (extraChoice?.startsWith("ない")) extraCostNote = "なし";
  else if (extraChoice?.startsWith("ある")) {
    extraCostNote = extraText;
    if (!extraText) warn("年会費以外の費用が「ある」なのに記述が空");
  } else extraCostNote = null;

  // 掛け持ち: "できる" / "できない" / 条件つきは条件文をそのまま（仕様書 §6）
  const multiRaw = pick("multi");
  let multi: string | null = null;
  if (multiRaw?.startsWith("できる")) multi = "できる";
  else if (multiRaw?.startsWith("できない")) multi = "できない";
  else if (multiRaw?.startsWith("条件つき")) {
    const cond = pick("multiCond");
    if (cond) multi = cond;
    else {
      multi = "条件つき";
      warn("掛け持ちが「条件つき」なのに条件の記述が空");
    }
  }

  const welcome = toISODate(pick("welcomeDate") ?? undefined);
  const welcomeDate = welcome.date;
  if (welcome.ambiguous) warn(`次の新歓の日付が月日どちらとも取れる形（"${pick("welcomeDate")}" → ${welcomeDate} と解釈）`);
  const welcomeWhat = pick("welcomeWhat");
  const nextRecruit =
    welcomeDate || welcomeWhat ? { date: welcomeDate, what: welcomeWhat ?? "" } : null;

  const leaderText = pick("leaderComment");
  const leaderComment = leaderText
    ? { text: leaderText, role: cleanRole(pick("role"), warn) }
    : null;

  const recruitingRaw = pick("recruiting");
  const recruiting =
    recruitingRaw && (RECRUITINGS as string[]).includes(recruitingRaw)
      ? (recruitingRaw as Recruiting)
      : null;

  const surveyed = toISODate(pick("surveyedAt") ?? undefined);
  const surveyedAt = surveyed.date ? surveyed.date.slice(0, 7) : "";
  if (!surveyed.date) warn(`取材日が読めない（"${pick("surveyedAt") ?? ""}" → YYYY-MM に丸められない）`);
  if (surveyed.ambiguous) warn(`取材日が月日どちらとも取れる形（"${pick("surveyedAt")}" → ${surveyed.date} と解釈）`);

  const tileRaw = (pick("tileSize") ?? "").trim().toUpperCase();
  const tileSize: Circle["tile_size"] =
    tileRaw === "S" || tileRaw === "L" ? tileRaw : "M";
  if (tileRaw && !["S", "M", "L"].includes(tileRaw)) {
    warn(`tile_size が S/M/L でない（"${tileRaw}" → "M" にした）`);
  }

  return {
    id,
    short_name: pick("shortName") ?? "",
    name: pick("name") ?? "",
    division: (pick("division") ?? "その他") as Division,
    category: (pick("category") ?? "委員会・その他") as Category,
    genre: (pick("genre") ?? "その他") as Genre,
    one_liner: pick("catchcopy") ?? pick("catchDraft") ?? "",
    active_days: days,
    active_times: times,
    frequency_per_week: freq.perWeek,
    hours_per_session: freq.hours,
    place: pick("place"),
    annual_fee: numOrNull(row[COLS.fee[0]] ?? undefined),
    extra_cost_note: extraCostNote,
    member_count: numOrNull(row[COLS.members[0]] ?? undefined),
    beginner_count: numOrNull(row[COLS.beginners[0]] ?? undefined),
    first_year_count: null, // フォームに設問がない
    gender,
    multi_club_ok: multi,
    description: pick("description") ?? "",
    leader_comment: leaderComment,
    recruiting,
    next_recruit: nextRecruit,
    surveyed_at: surveyedAt,
    sns: {
      instagram: urlOrNull(pick("instagram"), "Instagram", warn),
      x: urlOrNull(pick("x"), "X", warn),
      website: urlOrNull(pick("website"), "公式サイト", warn),
    },
    // public/photos にあるファイルを連番順に。@600 は入れない（仕様書 §7）
    photos,
    tile_size: tileSize,
  };
}

/** 仕様書 §5 の検証。除外はしない */
function validate(c: Circle, row: Row, warn: (m: string) => void) {
  if (c.gender && c.member_count !== null) {
    const sum = c.gender.male + c.gender.female;
    if (sum !== c.member_count) {
      warn(`所属人数 ${c.member_count} ≠ 男${c.gender.male} + 女${c.gender.female}`);
    }
  }
  if (c.beginner_count !== null && c.member_count !== null && c.beginner_count > c.member_count) {
    warn(`初心者 ${c.beginner_count} > 所属人数 ${c.member_count}`);
  }
  if (c.active_days.length > 0 && Object.keys(c.active_times).length === 0) {
    warn("活動曜日にチェックがあるが活動時間が空");
  }
  if (c.annual_fee === null) {
    warn("年会費が空欄（未確認か0円か要確認）");
  }
  if (c.next_recruit?.date) {
    const d = new Date(c.next_recruit.date + "T00:00:00");
    if (d.getTime() < Date.now()) warn(`次の新歓の日付が過去（${c.next_recruit.date}）`);
  }
  if (c.photos.length === 0) {
    warn(`写真0枚（public/photos に ${c.id}-1.webp が無い）`);
  } else {
    // 連番の抜け。1 から詰まっていないと、UIの並びと README の説明がずれる
    const nums = c.photos.map((f) => Number(/-(\d+)\.webp$/.exec(f)?.[1] ?? 0));
    const missing = [];
    for (let i = 1; i <= Math.max(...nums); i++) if (!nums.includes(i)) missing.push(i);
    if (missing.length) warn(`写真の連番が飛んでいる（${missing.map((n) => `${c.id}-${n}.webp`).join(", ")} が無い）`);
    // @600 が無いと一覧のサムネが404になる
    for (const f of c.photos) {
      const small = f.replace(/\.webp$/, "@600.webp");
      if (!existsSync(`${PHOTO_DIR}/${small}`)) warn(`${small} が無い（一覧のサムネが読めない）`);
    }
  }
  const lines = c.description.split("\n").map((s) => s.trim()).filter(Boolean);
  if (lines.length === 0) warn("紹介文が空");
  else if (lines.length < 3) warn(`紹介文が${lines.length}行（3行未満）`);
  if (c.one_liner.length > 20) warn(`キャッチコピーが${c.one_liner.length}文字（20文字超）`);
  if (c.surveyed_at) {
    const [y, m] = c.surveyed_at.split("-").map(Number);
    const months = (new Date().getFullYear() - y) * 12 + (new Date().getMonth() + 1 - m);
    if (months >= 10) warn(`取材日から${months}か月経過（更新対象）`);
  }
}

async function main() {
  const sheetId = process.env.SHEET_ID?.trim();
  const sheetName = process.env.SHEET_NAME?.trim();

  if (!sheetId) throw new Error("SHEET_ID が .env にありません");

  const auth = await makeAuthClient();

  if (LIST_SHEETS) {
    const names = await fetchSheetNames(auth, sheetId);
    console.log("このスプレッドシートのタブ名:");
    names.forEach((n) => console.log(`  ${JSON.stringify(n)}`));
    console.log(`\n.env の SHEET_NAME に、フォームの回答が入っているタブ名をそのまま入れてください。`);
    console.log(`いまの SHEET_NAME: ${JSON.stringify(sheetName ?? "(未設定)")}`);
    return;
  }

  if (!sheetName) throw new Error("SHEET_NAME が .env にありません（--list-sheets で確認できます）");

  const values = await fetchSheet(auth, sheetId, sheetName);
  if (values.length === 0) throw new Error(`シート "${sheetName}" が空です`);

  const header = values[0];
  const headerIndex = new Map<string, number>();
  header.forEach((h, i) => headerIndex.set(normalizeHeader(h), i));

  // 見出しの対応づけ。見つからない列は報告する
  const resolved = new Map<keyof typeof COLS, number>();
  const missingCols: string[] = [];
  for (const [key, candidates] of Object.entries(COLS) as [keyof typeof COLS, readonly string[]][]) {
    const hit = candidates
      .map((c) => headerIndex.get(normalizeHeader(c)))
      .find((i) => i !== undefined);
    if (hit === undefined) missingCols.push(`${key} (${candidates[0]})`);
    else resolved.set(key, hit);
  }

  const photoIndex = scanPhotos();

  const excluded: Excluded[] = [];
  const warnings: Warning[] = [];
  const circles: Circle[] = [];
  const seenIds = new Set<string>();

  for (let r = 1; r < values.length; r++) {
    const raw = values[r];
    if (!raw || raw.every((c) => (c ?? "").trim() === "")) continue;

    const cell = (key: keyof typeof COLS): string | null => {
      const i = resolved.get(key);
      if (i === undefined) return null;
      return trimOrNull(raw[i]);
    };
    const row: Row = {};
    header.forEach((h, i) => (row[h] = raw[i] ?? ""));
    // 数値列は見出し名で引けるようにしておく
    for (const key of ["fee", "members", "beginners", "male", "female", "photoOk"] as const) {
      const i = resolved.get(key);
      if (i !== undefined) row[COLS[key][0]] = raw[i] ?? "";
    }

    const id = (cell("id") ?? "").trim();
    const label = id || `行${r + 1}`;

    if (ONLY && !ONLY.includes(id)) continue;

    // --- 公開判定（仕様書 §4）。1つでも欠けたら除外して理由を出す
    const publish = cell("publish");
    if (publish !== "OK") {
      excluded.push({ id: label, reason: `公開してよいか = ${publish ?? "(空欄)"}` });
      continue;
    }
    if (!/^c\d{3}$/.test(id)) {
      excluded.push({ id: label, reason: `団体IDが c### 形式でない（"${id}"）` });
      continue;
    }
    if (seenIds.has(id)) {
      excluded.push({ id: label, reason: "団体IDが重複している" });
      continue;
    }
    if (!cell("shortName") || !cell("name")) {
      excluded.push({ id: label, reason: "通称または正式名称が空" });
      continue;
    }
    const division = cell("division");
    const category = cell("category");
    if (!division || !(DIVISIONS as string[]).includes(division)) {
      excluded.push({ id: label, reason: `大分類が未選択または不正（"${division ?? ""}"）` });
      continue;
    }
    if (!category || !(CATEGORIES as string[]).includes(category)) {
      excluded.push({ id: label, reason: `公式の所属区分が未選択または不正（"${category ?? ""}"）` });
      continue;
    }

    seenIds.add(id);
    const warn = (m: string) => warnings.push({ id, message: m });

    const genre = cell("genre");
    if (genre && !(GENRES as string[]).includes(genre)) warn(`ジャンルが不正（"${genre}"）→ その他`);

    const circle = buildCircle(row, cell, warn, photoIndex.byId.get(id) ?? []);
    if (genre && !(GENRES as string[]).includes(genre)) circle.genre = "その他";

    // 写真の掲載可否 = 不可 は除外しない。写真なしとして通す（仕様書 §4-5）
    if (cell("photoOk") === "不可") warn("写真の掲載可否 = 不可（写真なしとして掲載）");

    const over = photoIndex.extra.get(id);
    if (over) warn(`写真が${MAX_PHOTOS + over}枚。${MAX_PHOTOS + 1}枚目以降の${over}枚は無視した`);

    validate(circle, row, warn);
    circles.push(circle);
  }

  circles.sort((a, b) => a.id.localeCompare(b.id));

  // --- レポート（仕様書 §9）
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const lines: string[] = [];
  lines.push(`=== sync ${stamp} ===`);
  lines.push(`シート ${values.length - 1}行 / 公開 ${circles.length}件 / 除外 ${excluded.length}件`);
  lines.push("");
  if (missingCols.length) {
    lines.push("見つからなかった列（見出しがずれている可能性）");
    missingCols.forEach((m) => lines.push(`  ${m}`));
    lines.push("");
  }
  lines.push("除外");
  if (excluded.length === 0) lines.push("  なし");
  else excluded.forEach((e) => lines.push(`  ${e.id.padEnd(6)}${e.reason}`));
  lines.push("");
  lines.push("警告");
  if (warnings.length === 0) lines.push("  なし");
  else warnings.forEach((w) => lines.push(`  ${w.id.padEnd(6)}${w.message}`));
  lines.push("");
  lines.push("画像");
  {
    const used = circles.reduce((a, c) => a + c.photos.length, 0);
    const withPhoto = circles.filter((c) => c.photos.length > 0).length;
    const orphans = [...photoIndex.byId.keys()].filter((id) => !circles.some((c) => c.id === id));
    lines.push(`  public/photos を走査 / 掲載 ${used}枚（${withPhoto}団体） / 写真なし ${circles.length - withPhoto}団体`);
    if (photoIndex.extra.size > 0) {
      for (const [id, n] of photoIndex.extra) lines.push(`  ${id.padEnd(6)}${MAX_PHOTOS + 1}枚目以降 ${n}枚を無視`);
    }
    if (orphans.length > 0) {
      lines.push(`  公開対象にないIDの写真: ${orphans.join(", ")}（未使用）`);
    }
  }
  const report = lines.join("\n") + "\n";

  writeFileSync(OUT_REPORT, report, "utf8");
  console.log(report);
  console.log(`レポート: ${OUT_REPORT}`);

  // --- 出力
  const payload: CircleFile = {
    _note:
      "npm run sync が生成した中間生成物。原本はスプレッドシート。手で編集しない（CLAUDE.md §1）。photos は public/photos の実ファイルを走査した結果。",
    circles,
  };
  const next = JSON.stringify(payload, null, 2) + "\n";

  if (PRINT) {
    console.log("\n=== 変換結果（書き込みません）===");
    console.log(next);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run のため書き込みませんでした。");
    return;
  }

  const prev = existsSync(OUT_JSON) ? readFileSync(OUT_JSON, "utf8") : null;

  // 冪等: 変化がなければ書き込まない（gitの差分を汚さない）
  if (prev === next) {
    console.log(`\n${OUT_JSON} に変化はありません。書き込みませんでした。`);
    return;
  }

  printDiff(prev, payload);

  if (!ASSUME_YES && prev !== null) {
    if (!process.stdin.isTTY) {
      console.log(
        `\n${OUT_JSON} を上書きしません（対話できない環境）。内容を確認して --yes を付けて実行してください。`
      );
      return;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ans = (await rl.question(`\n${OUT_JSON} を上書きしますか [y/N]: `)).trim().toLowerCase();
    rl.close();
    if (ans !== "y" && ans !== "yes") {
      console.log("中止しました。書き込んでいません。");
      return;
    }
  }

  writeFileSync(OUT_JSON, next, "utf8");
  console.log(`\n書き込みました: ${OUT_JSON}（${circles.length}件）`);
}

/** 上書き前に必ず出す差分 */
function printDiff(prev: string | null, next: CircleFile) {
  console.log("\n=== data/circles.json の差分 ===");
  if (prev === null) {
    console.log(`  新規作成。${next.circles.length}件`);
    return;
  }
  let before: CircleFile;
  try {
    before = JSON.parse(prev) as CircleFile;
  } catch {
    console.log("  既存ファイルが JSON として読めません。全体を置き換えます");
    return;
  }
  const beforeMap = new Map(before.circles.map((c) => [c.id, c]));
  const afterMap = new Map(next.circles.map((c) => [c.id, c]));

  const added = [...afterMap.keys()].filter((k) => !beforeMap.has(k));
  const removed = [...beforeMap.keys()].filter((k) => !afterMap.has(k));
  const common = [...afterMap.keys()].filter((k) => beforeMap.has(k));

  console.log(`  既存 ${before.circles.length}件 → 新 ${next.circles.length}件`);
  if (added.length) console.log(`  追加   ${added.join(", ")}`);
  if (removed.length) {
    console.log(`  消える ${removed.join(", ")}`);
    console.log("         ↑ この団体はサイトから消えます。意図した通りか確認してください");
  }
  for (const id of common) {
    const a = beforeMap.get(id)!;
    const b = afterMap.get(id)!;
    const changed: string[] = [];
    for (const k of Object.keys(b) as (keyof Circle)[]) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
        changed.push(`${k}: ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`);
      }
    }
    if (changed.length) {
      console.log(`  変更   ${id}`);
      changed.forEach((c) => console.log(`           ${c}`));
    }
  }
}

main().catch((e) => {
  console.error("\nsync に失敗しました:", e instanceof Error ? e.message : e);
  process.exit(1);
});
