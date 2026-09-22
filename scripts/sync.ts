// 掲載データ＋団体マスタ → data/circles.json
// 変換規則は scripts/sheet-transform.ts に分離し、このファイルは Google API と
// ファイルI/Oだけを担う。
//
// 写真の置き場所は2系統ある。**どちらも消さずに、新しいほうを優先して使う。**
//
//   public/circles/<団体ID>/   シートの「写真_元」（Drive URL）から scripts/photos.ts が作る。いま正
//   public/photos/             以前に手で置いたもの。シートに Drive URL が無い団体はこちらを使い続ける
//
// 後者を切ると、まだシートに写真を入れていない団体（c054 など）が
// サイトから消える。**古いほうは残して保険にする。**

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { GoogleAuth, Impersonated, JWT, type AuthClient } from "google-auth-library";
import type { Circle, CircleFile } from "../types/circle.ts";
import {
  readPhotoSources,
  transformSheets,
  type SheetInput,
  type SheetValues,
  type SyncWarning,
} from "./sheet-transform.ts";
import { scanPhotos, type PhotoIndex } from "./photo-index.ts";
import { parseDriveCell, syncCirclePhotos, type CirclePhotos } from "./photos.ts";

const OUT_JSON = "data/circles.json";
const OUT_REPORT = "data/report.md";
const PUBLIC_DIR = "public";
/** 以前に手で置いた写真。シートに Drive URL が無い団体はここを使う */
const PHOTO_DIR = "public/photos";
/** scripts/photos.ts が Drive から作る写真 */
const CIRCLE_DIR = "public/circles";
/** ヒーローに出す枚数の上限。フォームが5枚まで受けるので5枚（docs/ui/08-carousel.md の推奨3〜5枚） */
const MAX_PHOTOS = 5;
const MASTER_SHEET_NAME = "団体マスタ";
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  // 「写真_元」の Drive ファイルを落とすため。シート読み取りと同じ認証を使い回す
  "https://www.googleapis.com/auth/drive.readonly",
];

const args = process.argv.slice(2);
const hasFlag = (name: string) => args.includes(`--${name}`);
const flagValue = (name: string) => {
  const hit = args.find((argument) => argument.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const DRY_RUN = hasFlag("dry-run");
const LIST_SHEETS = hasFlag("list-sheets");
const ASSUME_YES = hasFlag("yes");
const PRINT = hasFlag("print");
const ONLY = flagValue("only")?.split(",").map((id) => id.trim()).filter(Boolean) ?? null;

async function makeAuthClient(): Promise<AuthClient> {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (serviceAccountJson) {
    let credentials: { client_email: string; private_key: string };
    try {
      credentials = JSON.parse(serviceAccountJson);
    } catch {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON が JSON として読めません。1行にして ' ' で囲んでいるか確認してください"
      );
    }
    return new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: SCOPES,
    });
  }

  const impersonate = process.env.IMPERSONATE_SERVICE_ACCOUNT?.trim();
  let source: AuthClient;
  try {
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

function a1SheetRange(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

async function fetchSheet(
  auth: AuthClient,
  sheetId: string,
  sheetName: string
): Promise<SheetValues> {
  const range = encodeURIComponent(a1SheetRange(sheetName));
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?majorDimension=ROWS`;
  const response = await auth.request<{ values?: SheetValues }>({ url });
  return response.data.values ?? [];
}

/** Google API から2タブを読む。行→Circleの変換は行わない。 */
async function fetchSheetInput(
  auth: AuthClient,
  sheetId: string,
  publishSheetName: string
): Promise<SheetInput> {
  const [publishValues, masterValues] = await Promise.all([
    fetchSheet(auth, sheetId, publishSheetName),
    fetchSheet(auth, sheetId, MASTER_SHEET_NAME),
  ]);
  return { 掲載データ: publishValues, 団体マスタ: masterValues };
}

async function fetchSheetNames(auth: AuthClient, sheetId: string): Promise<string[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`;
  const response = await auth.request<{ sheets?: { properties?: { title?: string } }[] }>({ url });
  return (response.data.sheets ?? [])
    .map((sheet) => sheet.properties?.title ?? "")
    .filter(Boolean);
}

type Resolved = { icon: string | null; photos: string[]; warnings: string[] };

/** 写真の取得結果のまとめ。レポートに出す */
type PhotoSummary = {
  /** 「写真_元」に Drive URL が入っていた団体数と、その合計件数 */
  sheetCircles: number;
  sheetFiles: number;
  /** アイコン写真_元 が入っていた団体数 */
  sheetIcons: number;
  /** 実際に Drive から取得できた団体数 */
  fetched: number;
  /** 取得に失敗した団体と理由 */
  failures: { id: string; message: string }[];
  /** ディスクにある古いほうの写真を使った団体 */
  fromLegacy: string[];
};

/** public/circles/<団体ID>/ に置いてあるものを読む（Drive を叩かない） */
function scanCircleDir(slug: string): CirclePhotos {
  const dir = path.join(CIRCLE_DIR, slug);
  if (!existsSync(dir)) return { icon: null, photos: [] };
  const names = readdirSync(dir);
  return {
    icon: names.includes("icon.webp") ? `/circles/${slug}/icon.webp` : null,
    photos: names
      .filter((n) => /^\d{2}\.webp$/.test(n))
      .sort()
      .map((n) => `/circles/${slug}/${n}`),
  };
}

/**
 * 団体IDごとの写真を決める。
 *
 * **新しいほう（public/circles）を優先し、無ければ古いほう（public/photos）に落とす。**
 * どちらのファイルも消さない。Drive の取得に失敗しても、ディスクにあるものは出し続ける。
 */
async function resolvePhotos(
  auth: AuthClient,
  sources: Map<string, { icon: string | null; photos: string | null }>,
  photoIndex: PhotoIndex,
  summary: PhotoSummary
): Promise<Map<string, Resolved>> {
  const resolved = new Map<string, Resolved>();

  for (const [id, cell] of sources) {
    const iconIds = parseDriveCell(cell.icon);
    const photoIds = parseDriveCell(cell.photos);
    if (photoIds.length > 0) {
      summary.sheetCircles += 1;
      summary.sheetFiles += photoIds.length;
    }
    if (iconIds.length > 0) summary.sheetIcons += 1;

    const warnings: string[] = [];
    let fresh: CirclePhotos;

    if (DRY_RUN) {
      // --dry-run では Drive を叩かない。ディスクにあるものだけを見る
      fresh = scanCircleDir(id);
    } else {
      try {
        fresh = await syncCirclePhotos(
          // photos.ts の型は GoogleAuth | JWT だが、この sync は Impersonated も使う。
          // 中で googleapis に渡すだけなので、ここで型を合わせる
          auth as unknown as JWT,
          id,
          cell.icon ?? undefined,
          cell.photos ?? undefined,
          PUBLIC_DIR
        );
        if (photoIds.length > 0 || iconIds.length > 0) summary.fetched += 1;
      } catch (error) {
        // 落とせなくても、すでにディスクにあるものは出し続ける。
        // ここで止めると写真がサイトから消える
        const message = error instanceof Error ? error.message : String(error);
        summary.failures.push({ id, message });
        warnings.push(`Drive から写真を取れなかった（${message.split("\n")[0]}）`);
        fresh = scanCircleDir(id);
      }
    }

    if (photoIds.length > MAX_PHOTOS) {
      warnings.push(
        `「写真_元」が${photoIds.length}件。いまのヒーローは${MAX_PHOTOS}枚までなので${photoIds.length - MAX_PHOTOS}件は出さない`
      );
    }

    // 新しいほうに何も無ければ、以前 public/photos に置いたものを使う
    const legacy = photoIndex.byId.get(id);
    const usesLegacyPhotos = fresh.photos.length === 0 && (legacy?.photos.length ?? 0) > 0;
    const usesLegacyIcon = fresh.icon === null && Boolean(legacy?.icon);
    if (usesLegacyPhotos || usesLegacyIcon) {
      summary.fromLegacy.push(id);
      legacy?.warnings.forEach((w) => warnings.push(w));
    }

    resolved.set(id, {
      icon: fresh.icon ?? legacy?.icon ?? null,
      photos: (fresh.photos.length > 0 ? fresh.photos : (legacy?.photos ?? [])).slice(0, MAX_PHOTOS),
      warnings,
    });
  }

  return resolved;
}

function makeReport(
  sourceRows: number,
  circles: Circle[],
  excluded: { id: string; reason: string }[],
  warnings: SyncWarning[],
  missingColumns: string[],
  photoIndex: PhotoIndex,
  summary: PhotoSummary
): string {
  const now = new Date();
  const stamp = [
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
  ].join(" ");
  const lines = [
    `=== sync ${stamp} ===`,
    `掲載データ ${sourceRows}行 / 公開 ${circles.length}件 / 除外 ${excluded.length}件`,
    "",
  ];
  if (missingColumns.length > 0) {
    lines.push("見つからなかった列（見出しがずれている可能性）");
    missingColumns.forEach((column) => lines.push(`  ${column}`));
    lines.push("");
  }
  lines.push("除外");
  if (excluded.length === 0) lines.push("  なし");
  else excluded.forEach((item) => lines.push(`  ${item.id.padEnd(6)}${item.reason}`));
  lines.push("", "警告");
  if (warnings.length === 0) lines.push("  なし");
  else warnings.forEach((warning) => lines.push(`  ${warning.id.padEnd(6)}${warning.message}`));
  lines.push("", "画像");
  const used = circles.reduce((a, c) => a + c.photos.length, 0);
  const withPhoto = circles.filter((c) => c.photos.length > 0).length;
  const withIcon = circles.filter((c) => c.icon !== null).length;
  lines.push(
    `  シートの「写真_元」 ${summary.sheetCircles}団体 / ${summary.sheetFiles}件` +
      `　「アイコン写真_元」 ${summary.sheetIcons}団体`
  );
  lines.push(
    DRY_RUN
      ? "  --dry-run のため Drive からは取得していません（件数だけ数えました）"
      : `  ${CIRCLE_DIR} に取り込み ${summary.fetched}団体 / 失敗 ${summary.failures.length}団体`
  );
  summary.failures.forEach((f) =>
    lines.push(`  ${f.id.padEnd(6)}Drive 取得に失敗: ${f.message.split("\n")[0]}`)
  );
  lines.push(
    `  ${PHOTO_DIR}（以前に手で置いたもの）を走査（${photoIndex.fileCount}ファイル）` +
      (summary.fromLegacy.length > 0 ? ` / そこから出す団体 ${summary.fromLegacy.join(", ")}` : "")
  );
  lines.push(
    `  掲載 ${used}枚（${withPhoto}団体） / アイコン ${withIcon}団体 / 写真なし ${circles.length - withPhoto}団体（頭文字タイル）`
  );
  // 公開対象にないIDの写真が置いてある（消し忘れ）
  const published = new Set(circles.map((c) => c.id));
  for (const id of [...photoIndex.byId.keys()].sort()) {
    if (!published.has(id)) lines.push(`  ${id.padEnd(6)}公開対象にないが写真が置いてある（消し忘れ？）`);
  }
  return lines.join("\n") + "\n";
}

async function main(): Promise<void> {
  const sheetId = process.env.SHEET_ID?.trim();
  const publishSheetName = process.env.SHEET_NAME?.trim() || "掲載データ";
  if (!sheetId) throw new Error("SHEET_ID が .env にありません");

  const auth = await makeAuthClient();
  if (LIST_SHEETS) {
    const names = await fetchSheetNames(auth, sheetId);
    console.log("このスプレッドシートのタブ名:");
    names.forEach((name) => console.log(`  ${JSON.stringify(name)}`));
    console.log(`\n掲載本体: ${JSON.stringify(publishSheetName)}`);
    console.log(`団体マスタ: ${JSON.stringify(MASTER_SHEET_NAME)}`);
    return;
  }

  const input = await fetchSheetInput(auth, sheetId, publishSheetName);
  if (input.掲載データ.length === 0) throw new Error(`シート "${publishSheetName}" が空です`);
  if (input.団体マスタ.length === 0) throw new Error(`シート "${MASTER_SHEET_NAME}" が空です`);

  const photoIndex = scanPhotos(PHOTO_DIR);
  const summary: PhotoSummary = {
    sheetCircles: 0,
    sheetFiles: 0,
    sheetIcons: 0,
    fetched: 0,
    failures: [],
    fromLegacy: [],
  };
  const sources = readPhotoSources(input.掲載データ);
  const photos = await resolvePhotos(auth, sources, photoIndex, summary);

  const result = transformSheets(input, {
    includeUnconfirmed: process.env.INCLUDE_UNCONFIRMED === "1",
    only: ONLY,
    photos: (id) => photos.get(id),
  });
  const report = makeReport(
    result.sourceRows,
    result.circles,
    result.excluded,
    result.warnings,
    result.missingColumns,
    photoIndex,
    summary
  );
  writeFileSync(OUT_REPORT, report, "utf8");
  console.log(report);
  console.log(`レポート: ${OUT_REPORT}`);

  const payload: CircleFile = {
    _note:
      "npm run sync が生成した中間生成物。原本は掲載データ＋団体マスタ。手で編集しない（CLAUDE.md §1）。photos / icon は public/circles（シートの写真_元から取得）と public/photos（以前に手で置いたもの）の実ファイル。",
    circles: result.circles,
  };
  const next = JSON.stringify(payload, null, 2) + "\n";
  if (PRINT) {
    console.log("\n=== 変換結果（書き込みません）===");
    console.log(next);
    return;
  }
  if (DRY_RUN) {
    console.log("\n--dry-run のため circles.json を書き込みませんでした。");
    return;
  }

  const previous = existsSync(OUT_JSON) ? readFileSync(OUT_JSON, "utf8") : null;
  if (previous === next) {
    console.log(`\n${OUT_JSON} に変化はありません。書き込みませんでした。`);
    return;
  }
  printDiff(previous, payload);
  if (!ASSUME_YES && previous !== null) {
    if (!process.stdin.isTTY) {
      console.log(
        `\n${OUT_JSON} を上書きしません（対話できない環境）。内容を確認して --yes を付けて実行してください。`
      );
      return;
    }
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await prompt.question(`\n${OUT_JSON} を上書きしますか [y/N]: `))
      .trim()
      .toLowerCase();
    prompt.close();
    if (answer !== "y" && answer !== "yes") {
      console.log("中止しました。書き込んでいません。");
      return;
    }
  }
  writeFileSync(OUT_JSON, next, "utf8");
  console.log(`\n書き込みました: ${OUT_JSON}（${result.circles.length}件）`);
}

function printDiff(previous: string | null, next: CircleFile): void {
  console.log("\n=== data/circles.json の差分 ===");
  if (previous === null) {
    console.log(`  新規作成。${next.circles.length}件`);
    return;
  }
  let before: CircleFile;
  try {
    before = JSON.parse(previous) as CircleFile;
  } catch {
    console.log("  既存ファイルが JSON として読めません。全体を置き換えます");
    return;
  }
  const beforeMap = new Map(before.circles.map((circle) => [circle.id, circle]));
  const afterMap = new Map(next.circles.map((circle) => [circle.id, circle]));
  const added = [...afterMap.keys()].filter((id) => !beforeMap.has(id));
  const removed = [...beforeMap.keys()].filter((id) => !afterMap.has(id));
  console.log(`  既存 ${before.circles.length}件 → 新 ${next.circles.length}件`);
  if (added.length > 0) console.log(`  追加   ${added.join(", ")}`);
  if (removed.length > 0) {
    console.log(`  消える ${removed.join(", ")}`);
    console.log("         ↑ この団体はサイトから消えます。意図した通りか確認してください");
  }
  for (const [id, after] of afterMap) {
    const original = beforeMap.get(id);
    if (!original) continue;
    const changed: string[] = [];
    for (const key of Object.keys(after) as (keyof Circle)[]) {
      if (JSON.stringify(original[key]) !== JSON.stringify(after[key])) {
        changed.push(`${key}: ${JSON.stringify(original[key])} → ${JSON.stringify(after[key])}`);
      }
    }
    if (changed.length > 0) {
      console.log(`  変更   ${id}`);
      changed.forEach((line) => console.log(`           ${line}`));
    }
  }
}

main().catch((error) => {
  console.error("\nsync に失敗しました:", error instanceof Error ? error.message : error);
  process.exit(1);
});
