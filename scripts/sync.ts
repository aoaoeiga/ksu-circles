// 掲載データ＋団体マスタ → data/circles.json
// 変換規則は scripts/sheet-transform.ts、写真の走査は scripts/photo-index.ts に分離し、
// このファイルは Google API とファイルI/Oだけを担う。
//
// sync は画像を変換しない（docs/10-sync-spec.md §7）。public/photos を走査して数えるだけ。

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { GoogleAuth, Impersonated, JWT, type AuthClient } from "google-auth-library";
import type { Circle, CircleFile } from "../types/circle.ts";
import {
  transformSheets,
  type SheetInput,
  type SheetValues,
  type SyncWarning,
} from "./sheet-transform.ts";
import { scanPhotos, type PhotoIndex } from "./photo-index.ts";

const OUT_JSON = "data/circles.json";
const OUT_REPORT = "data/report.md";
const PHOTO_DIR = "public/photos";
const MASTER_SHEET_NAME = "団体マスタ";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

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

function makeReport(
  sourceRows: number,
  circles: Circle[],
  excluded: { id: string; reason: string }[],
  warnings: SyncWarning[],
  missingColumns: string[],
  photoIndex: PhotoIndex
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
    `  ${PHOTO_DIR} を走査（${photoIndex.fileCount}ファイル） / 掲載 ${used}枚（${withPhoto}団体） / アイコン ${withIcon}団体 / 写真なし ${circles.length - withPhoto}団体`
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
  const result = transformSheets(input, {
    includeUnconfirmed: process.env.INCLUDE_UNCONFIRMED === "1",
    only: ONLY,
    photos: (id) => photoIndex.byId.get(id),
  });
  const report = makeReport(
    result.sourceRows,
    result.circles,
    result.excluded,
    result.warnings,
    result.missingColumns,
    photoIndex
  );
  writeFileSync(OUT_REPORT, report, "utf8");
  console.log(report);
  console.log(`レポート: ${OUT_REPORT}`);

  const payload: CircleFile = {
    _note:
      "npm run sync が生成した中間生成物。原本は掲載データ＋団体マスタ。手で編集しない（CLAUDE.md §1）。photos / icon は public/photos の実ファイルを走査した結果。",
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
