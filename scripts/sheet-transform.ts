import type {
  Category,
  Circle,
  Division,
  Genre,
  Recruiting,
} from "../types/circle.ts";

export type SheetCell = string | number | boolean | null;
export type SheetValues = SheetCell[][];
export type SheetInput = {
  掲載データ: SheetValues;
  団体マスタ: SheetValues;
};

export type SyncWarning = { id: string; message: string };
export type SyncExcluded = { id: string; reason: string };
/** public/photos の走査結果（scripts/photo-index.ts）。sync は画像を変換しない（docs/10 §7） */
export type PhotoLookup = (id: string) => { icon: string | null; photos: string[]; warnings: string[] } | undefined;

export type TransformResult = {
  circles: Circle[];
  warnings: SyncWarning[];
  excluded: SyncExcluded[];
  missingColumns: string[];
  sourceRows: number;
};

type TransformOptions = {
  includeUnconfirmed?: boolean;
  only?: string[] | null;
  now?: Date;
  /** 団体IDごとの写真ファイル名。省略時は写真なし扱い（テスト用） */
  photos?: PhotoLookup;
};

const PUBLISH_COLUMNS = {
  id: "団体ID",
  shortName: "通称",
  name: "正式名称",
  category: "区分",
  genre: "ジャンル",
  catchDraft: "一言",
  monday: "月",
  tuesday: "火",
  wednesday: "水",
  thursday: "木",
  friday: "金",
  saturday: "土",
  sunday: "日",
  daysUndecided: "曜日未確認",
  frequency: "週回数",
  place: "活動場所",
  ease: "参加の緩さ",
  seniorCall: "先輩の呼び方",
  feeStatus: "年会費状況",
  feeAmount: "年会費金額",
  members: "所属人数",
  firstYears: "1年生",
  maleRatio: "男子割合",
  beginners: "初心者数",
  multi: "掛け持ち",
  multiCondition: "掛け持ち条件",
  recruiting: "いま入れるか",
  instagram: "Instagram",
  x: "X",
  website: "公式サイト",
  surveyedAt: "取材日",
  role: "役職",
  leaderComment: "代表からの一言",
  description: "紹介文",
  catchcopy: "キャッチコピー",
  tileSize: "tile_size",
  publish: "公開可否",
} as const;

const MASTER_COLUMNS = {
  id: "団体ID",
  division: "大分類",
} as const;

const WEEKDAYS: (keyof typeof PUBLISH_COLUMNS)[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
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

function normalizeHeader(value: SheetCell | undefined): string {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, "").trim().toLowerCase();
}

function text(value: SheetCell | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized === "" ? null : normalized;
}

function numberOrNull(value: SheetCell | undefined): number | null {
  const normalized = String(value ?? "").normalize("NFKC").replace(/[,，\s円]/g, "").trim();
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function checked(value: SheetCell | undefined): boolean {
  if (value === true) return true;
  const normalized = String(value ?? "").normalize("NFKC").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "はい";
}

function toISODate(value: SheetCell | undefined): { date: string | null; ambiguous: boolean } {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (!normalized) return { date: null, ambiguous: false };

  // Google Sheets API は日付セルをシリアル値で返す場合がある。
  // Sheets / Excel と同じく 1899-12-30 を 0 とし、時刻部分は切り捨てる。
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    const serial = Number(normalized);
    if (Number.isFinite(serial) && serial >= 0) {
      const epoch = Date.UTC(1899, 11, 30);
      const date = new Date(epoch + Math.floor(serial) * 86_400_000);
      if (!Number.isNaN(date.getTime())) {
        return { date: date.toISOString().slice(0, 10), ambiguous: false };
      }
    }
  }

  const ymd = /^(\d{4})[/\-年](\d{1,2})[/\-月](\d{1,2})/.exec(normalized);
  if (ymd) {
    const [, year, month, day] = ymd;
    return {
      date: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
      ambiguous: false,
    };
  }

  const mdy = /^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/.exec(normalized);
  if (mdy) {
    const [, month, day, year] = mdy;
    return {
      date: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
      ambiguous: Number(month) <= 12 && Number(day) <= 12 && month !== day,
    };
  }

  return { date: null, ambiguous: false };
}

function cleanRole(raw: string | null, warn: (message: string) => void): string {
  const normalized = (raw ?? "").normalize("NFKC").trim();
  if (!normalized) return "代表";
  const roles = "代表|副代表|部長|副部長|主将|副主将|代表者|会長|幹事長|マネージャー";
  const exact = new RegExp(`^\\s*(${roles})\\s*[（(]?\\s*(\\d)\\s*年?\\s*[)）]?\\s*$`).exec(normalized);
  if (exact) return `${exact[1]}（${exact[2]}年）`;

  const roleOnly = new RegExp(`^(${roles})$`).exec(normalized.replace(/[\s　]/g, ""));
  if (roleOnly) return roleOnly[1];

  const role = new RegExp(`(${roles})`).exec(normalized);
  const year = /(\d)\s*年/.exec(normalized);
  const rebuilt = year
    ? `${role ? role[1] : "代表"}（${year[1]}年）`
    : role
      ? role[1]
      : "代表";
  warn(`役職に個人名が混ざっている可能性（"${raw}" → "${rebuilt}" に置換）`);
  return rebuilt;
}

function urlOrNull(raw: string | null, label: string, warn: (message: string) => void): string | null {
  if (!raw) return null;
  if (/^https?:\/\/\S+$/i.test(raw)) return raw;
  warn(`${label} がURL形式でない（"${raw}"）`);
  return null;
}

function makeReader(values: SheetValues, columns: Record<string, string>) {
  const header = values[0] ?? [];
  const index = new Map<string, number>();
  header.forEach((cell, position) => index.set(normalizeHeader(cell), position));
  const resolved = new Map<string, number>();
  const missing: string[] = [];
  for (const [key, label] of Object.entries(columns)) {
    const position = index.get(normalizeHeader(label));
    if (position === undefined) missing.push(label);
    else resolved.set(key, position);
  }
  return {
    missing,
    get(row: SheetCell[], key: string): SheetCell | undefined {
      const position = resolved.get(key);
      return position === undefined ? undefined : row[position];
    },
  };
}

function normalizeCategory(raw: string | null, warn: (message: string) => void): Category {
  if (raw === "体育会") return "体育会所属クラブ";
  if (raw === "委員会・独立団・その他") return "委員会・その他";
  if (raw && (CATEGORIES as string[]).includes(raw)) return raw as Category;
  warn(`区分が未知値（"${raw ?? ""}" → "委員会・その他"）`);
  return "委員会・その他";
}

function normalizeGenre(raw: string | null, warn: (message: string) => void): Genre {
  if (raw && (GENRES as string[]).includes(raw)) return raw as Genre;
  if (raw) warn(`ジャンルが未知値（"${raw}" → "その他"）`);
  return "その他";
}

function normalizeRecruiting(raw: string | null, warn: (message: string) => void): Recruiting | null {
  if (!raw) return null;
  if ((RECRUITINGS as string[]).includes(raw)) return raw as Recruiting;
  warn(`いま入れるかが未知値（"${raw}" → null）`);
  return null;
}

function annualFee(status: string | null, amount: SheetCell | undefined): number | null {
  if (status === "無料（0円）") return 0;
  if (status === "未確認") return null;
  return numberOrNull(amount);
}

/** Google API を使わない、掲載データ＋団体マスタから Circle への純粋変換。 */
export function transformSheets(input: SheetInput, options: TransformOptions = {}): TransformResult {
  const publish = makeReader(input.掲載データ, PUBLISH_COLUMNS);
  const master = makeReader(input.団体マスタ, MASTER_COLUMNS);
  const warnings: SyncWarning[] = [];
  const excluded: SyncExcluded[] = [];
  const circles: Circle[] = [];
  const seenIds = new Set<string>();
  const now = options.now ?? new Date();

  const divisions = new Map<string, string>();
  for (const row of input.団体マスタ.slice(1)) {
    const id = text(master.get(row, "id"));
    if (id) divisions.set(id, text(master.get(row, "division")) ?? "");
  }

  for (let offset = 1; offset < input.掲載データ.length; offset++) {
    const row = input.掲載データ[offset];
    const get = (key: keyof typeof PUBLISH_COLUMNS) => publish.get(row, key);
    const shortName = text(get("shortName"));
    if (!shortName) continue;

    const id = text(get("id")) ?? `行${offset + 1}`;
    if (options.only && !options.only.includes(id)) continue;
    const warn = (message: string) => warnings.push({ id, message });

    const description = text(get("description")) ?? "";
    const catchcopy = text(get("catchcopy"));
    const catchDraft = text(get("catchDraft"));
    const publishStatus = text(get("publish"));
    let effectiveStatus = publishStatus;
    if (publishStatus === "OK" && (!description || !catchcopy)) {
      warn("原稿なしで OK になっている");
      effectiveStatus = "確認中";
    }
    const included =
      effectiveStatus === "OK" ||
      (options.includeUnconfirmed === true && effectiveStatus === "確認中");
    if (!included) {
      excluded.push({ id, reason: `公開可否 = ${effectiveStatus ?? "(空欄)"}` });
      continue;
    }

    if (!/^c\d{3}$/.test(id)) {
      excluded.push({ id, reason: `団体IDが c### 形式でない（"${id}"）` });
      continue;
    }
    if (seenIds.has(id)) {
      excluded.push({ id, reason: "団体IDが重複している" });
      continue;
    }
    const name = text(get("name"));
    if (!name) {
      excluded.push({ id, reason: "正式名称が空" });
      continue;
    }
    seenIds.add(id);

    const rawDivision = divisions.get(id) ?? "";
    const division = (DIVISIONS as string[]).includes(rawDivision)
      ? (rawDivision as Division)
      : "その他";
    if (!rawDivision) warn("団体マスタの大分類が空（\"その他\"を使用）");
    else if (division === "その他" && rawDivision !== "その他") {
      warn(`団体マスタの大分類が未知値（"${rawDivision}" → "その他"）`);
    }

    const rawMaleRatio = numberOrNull(get("maleRatio"));
    const maleRatio =
      rawMaleRatio !== null && rawMaleRatio >= 0 && rawMaleRatio <= 100
        ? rawMaleRatio
        : null;
    if (rawMaleRatio !== null && maleRatio === null) {
      warn(`男子割合が0〜100の範囲外（"${String(get("maleRatio"))}" → null）`);
    }

    const oneLiner = catchcopy ?? catchDraft ?? "";
    if (!catchcopy) warn("キャッチコピーが空のため「一言」を使用");

    const multi = text(get("multi"));
    const multiCondition = text(get("multiCondition"));
    const multiClub = multi ? (multiCondition ? `${multi} / ${multiCondition}` : multi) : null;

    const leaderText = text(get("leaderComment"));
    const leaderComment = leaderText
      ? { text: leaderText, role: cleanRole(text(get("role")), warn) }
      : null;

    const surveyed = toISODate(get("surveyedAt"));
    const surveyedAt = surveyed.date ?? "";
    if (!surveyed.date) warn(`取材日が読めない（"${text(get("surveyedAt")) ?? ""}"）`);
    if (surveyed.ambiguous) warn(`取材日が月日どちらとも取れる形（"${String(get("surveyedAt"))}" → ${surveyed.date} と解釈）`);

    const tileRaw = (text(get("tileSize")) ?? "M").toUpperCase();
    const tileSize: Circle["tile_size"] =
      tileRaw === "S" || tileRaw === "L" || tileRaw === "M" ? tileRaw : "M";
    if (tileRaw !== tileSize) warn(`tile_size が S/M/L でない（"${tileRaw}" → "M"）`);

    // 写真はシートから読まない。public/photos に置いてあるファイルが正（docs/10 §7）
    const found = options.photos?.(id);
    const icon = found?.icon ?? null;
    const photos = found?.photos ?? [];
    found?.warnings.forEach(warn);
    if (!icon && photos.length === 0) warn(`写真0枚（public/photos に ${id}-1.webp も ${id}-icon.webp も無い）`);

    const memberCount = numberOrNull(get("members"));
    const beginnerCount = numberOrNull(get("beginners"));
    if (beginnerCount !== null && memberCount !== null && beginnerCount > memberCount) {
      warn(`初心者 ${beginnerCount} > 所属人数 ${memberCount}`);
    }

    const fee = annualFee(text(get("feeStatus")), get("feeAmount"));
    if (fee === null) warn("年会費が未確認");
    if (!description) warn("紹介文が空");
    else {
      const lines = description.split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.length < 3) warn(`紹介文が${lines.length}行（3行未満）`);
    }
    if (oneLiner.length > 20) warn(`キャッチコピーが${oneLiner.length}文字（20文字超）`);
    if (surveyedAt) {
      const [year, month] = surveyedAt.split("-").map(Number);
      const age = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
      if (age >= 10) warn(`取材日から${age}か月経過（更新対象）`);
    }

    const circle: Circle = {
      id,
      short_name: shortName,
      name,
      division,
      category: normalizeCategory(text(get("category")), warn),
      genre: normalizeGenre(text(get("genre")), warn),
      one_liner: oneLiner,
      active_days: WEEKDAYS.flatMap((key, day) => checked(get(key)) ? [day] : []),
      days_undecided: checked(get("daysUndecided")),
      frequency: text(get("frequency")),
      place: text(get("place")),
      annual_fee: fee,
      member_count: memberCount,
      beginner_count: beginnerCount,
      first_year_count: numberOrNull(get("firstYears")),
      male_ratio: maleRatio,
      ease: text(get("ease")),
      senior_call: text(get("seniorCall")),
      multi_club: multiClub,
      description,
      leader_comment: leaderComment,
      recruiting: normalizeRecruiting(text(get("recruiting")), warn),
      surveyed_at: surveyedAt,
      sns: {
        instagram: urlOrNull(text(get("instagram")), "Instagram", warn),
        x: urlOrNull(text(get("x")), "X", warn),
        website: urlOrNull(text(get("website")), "公式サイト", warn),
      },
      icon,
      photos,
      tile_size: tileSize,
    };
    circles.push(circle);
  }

  circles.sort((a, b) => a.id.localeCompare(b.id));
  return {
    circles,
    warnings,
    excluded,
    missingColumns: [
      ...publish.missing.map((column) => `掲載データ: ${column}`),
      ...master.missing.map((column) => `団体マスタ: ${column}`),
    ],
    sourceRows: Math.max(0, input.掲載データ.length - 1),
  };
}
