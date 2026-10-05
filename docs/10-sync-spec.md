# データ同期スクリプト仕様 — 9/2版

作成: 2026/08/30 ／ 更新: 2026/09/06 ／ 東田
やること: `掲載データ`＋`団体マスタ` → `data/circles.json`＋`public/photos`

---

## 0. 設計方針

- 原本は Google スプレッドシート。`data/circles.json` と `public/photos` は中間生成物で、手で編集しない
- 同じ入力から同じ JSON を作る決定的な変換にする。AIは使わない
- Google API の読み込みと行から `Circle` への変換を分ける。変換だけを匿名フィクスチャでテストできるようにする
- JSONに変化がなければ書き込まない。自動コミット・自動デプロイは行わない

---

## 1. 入力と認証

### 1-1. 読むタブ

| タブ | 読む範囲 |
|---|---|
| `掲載データ` | 全列。タブ名は `SHEET_NAME=掲載データ` |
| `団体マスタ` | `団体ID` と K列 `大分類` |

`掲載データ` の列名は `docs/17-codex-tasks.md` A-2 の MAP を正とする。A-2で末尾に追加する `取材日`、`役職`、`代表からの一言`、`先輩の呼び方` も読む。

`春以外の募集`、`聞き取りメモ`、`確認依頼日`、`掲載OK日` は掲載用データではないため読まない。`年会費表示` は表示ロジックと二重になるため読まない。**写真の列（`アイコン写真`、`写真1`〜`写真3`、および `_元`）は読まない。**写真は `public/photos` に置いたファイルが正（§5）。

### 1-2. 認証

Google Sheets API v4を読み取り専用で使う。認証は次の優先順。

1. `GOOGLE_SERVICE_ACCOUNT_JSON`
2. `IMPERSONATE_SERVICE_ACCOUNT` を使ったサービスアカウント偽装
3. Application Default Credentials

偽装を使う場合は事前に次を1回実行する。

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project ksu-circles
```

`--scopes` は付けない。シートの閲覧権限は偽装先サービスアカウントに共有しておく。

---

## 2. コマンド

| コマンド | 動作 |
|---|---|
| `npm run sync` | 2タブ取得 → 変換 → `public/photos` 走査 → 差分確認 → JSON出力 |
| `npm run sync -- --dry-run` | JSONを書かず、レポートだけ出す |
| `npm run sync -- --print` | 変換結果を標準出力に出し、JSONは書かない |
| `npm run sync -- --only=c001,c004` | 指定IDだけを処理する |
| `npm run sync -- --list-sheets` | タブ名を一覧する |
| `npm run sync -- --yes` | JSON上書き前の確認を飛ばす |

公開可否の扱いは §3 のとおり。環境変数で含める団体を変えることはしない（旧 `INCLUDE_UNCONFIRMED` は 2026-09-24 に廃止）。

---

## 3. 行の採用と公開判定

`掲載データ` は158行が式で存在するため、行の有無では判定しない。

1. `通称` が空の行は未面談としてスキップする
2. `公開可否 = OK` の行は `listed: true`（一覧に出す）
3. `公開可否` が空欄・`確認中` の行は `listed: false`（掲載前の確認用ページ。一覧に出さず、`/c/{id}` を直接開いたときだけ見られる。noindex）
4. それ以外（`NG`・`非公開` など）はビルドに含めない
5. `OK` でも `紹介文` または `キャッチコピー` が空なら、警告 `原稿なしで OK になっている` を出して `確認中` 扱い（確認用ページ）にする
6. `団体ID` は `c###` 形式かつ重複なし、`正式名称` は空でないこと。満たさなければ除外する

どの扱いにするかは sync 側だけで決め、`circles.json` の `listed` に書く。画面側は `listed` を読むだけで、公開可否の値そのものは見ない。

---

## 4. 変換ルール

| シート | 列 | `Circle` | 変換 |
|---|---|---|---|
| 掲載データ | `団体ID` | `id` | そのまま |
| 掲載データ | `通称` / `正式名称` | `short_name` / `name` | 前後の空白を除く |
| 団体マスタ | `大分類` | `division` | `運動系` / `文化系` / `その他`。空・未知値は `その他`＋警告 |
| 掲載データ | `区分` | `category` | `体育会`→`体育会所属クラブ`、`委員会・独立団・その他`→`委員会・その他`。未知値は警告して `委員会・その他` |
| 掲載データ | `ジャンル` | `genre` | 既知値はそのまま。未知値は警告して `その他` |
| 掲載データ | `キャッチコピー` / `一言` | `one_liner` | `キャッチコピー`を優先。空なら`一言`を使って警告 |
| 掲載データ | `月`〜`日` | `active_days` | `TRUE`の曜日を月=0〜日=6へ |
| 掲載データ | `曜日未確認` | `days_undecided` | 真偽値へ |
| 掲載データ | `週回数` | `frequency` | 回答文字列のまま。空は `null` |
| 掲載データ | `活動場所` | `place` | 空は `null` |
| 掲載データ | `年会費状況` / `年会費金額` | `annual_fee` | `無料（0円）`→`0`、`未確認`または金額空→`null`、それ以外は金額 |
| 掲載データ | `所属人数` / `初心者数` / `1年生` | 各人数 | 数値。空は `null` |
| 掲載データ | `男子割合` | `male_ratio` | 0〜100の数値。範囲外は `null`＋警告 |
| 掲載データ | `参加の緩さ` | `ease` | 空は `null` |
| 掲載データ | `先輩の呼び方` | `senior_call` | 空は `null` |
| 掲載データ | `掛け持ち` / `掛け持ち条件` | `multi_club` | 状況をそのまま。条件があれば ` / ` で連結。状況が空なら `null` |
| 掲載データ | `紹介文` | `description` | 改行を保持 |
| 掲載データ | `代表からの一言` / `役職` | `leader_comment` | 本文が空なら `null`。役職は `代表（3年）` の形にし、個人名の可能性があれば置換して警告 |
| 掲載データ | `いま入れるか` | `recruiting` | 既知値はそのまま。空は `null` |
| 掲載データ | `取材日` | `surveyed_at` | `YYYY-MM-DD`へ。数値は1899-12-30起点のシリアル値として解釈 |
| 掲載データ | `Instagram` / `X` / `公式サイト` | `sns` | URL形式でなければ `null`＋警告 |
| 掲載データ | `tile_size` | `tile_size` | `S` / `M` / `L`。空・未知値は `M` |

`annual_fee: 0` は無料、`null` は未確認であり、絶対に混同しない。`male_ratio` は割合の数値のまま持ち、10段階への丸めは画面側の `genderRatio()` で行う。

---

## 5. 写真 — 変換済みファイルを置く

**sync は画像を変換しない。`public/photos` を走査して、あるファイルを数えるだけ。**変換は手元で先に済ませて、ファイルを置く。

**なぜ Drive から取らないか。**組織ポリシーでサービスアカウントキーが作れず、Sheets の認証だけでも偽装を挟む構成になっている。ここに Drive のスコープと権限をもう1つ増やすより、手元で変換して置くほうが工程が短い。シートの写真URL列（`アイコン写真`、`写真1`〜`写真3`、`_元`）は**運営が元ファイルを探すためのメモ**であって、sync の入力ではない。

### 5-1. 置くもの

```
/public/photos/c054-icon.webp     アイコン。1:1、幅400。一覧タイルと OGP 用
/public/photos/c054-1.webp        ヒーロー。3:2、幅1200
/public/photos/c054-1@600.webp    同じ写真の幅600（一覧の先読み用）
/public/photos/c054-2.webp
...
```

- 3:2 にクロップ（中央基準）／ WebP 品質82 ／ **幅1200 と 幅600 の2枚**／ EXIF を落とす（撮影場所の位置情報が入っていることがある）
- アイコンは 1:1 にクロップ（中央基準）／ 幅400 の1枚だけ。`@600` は作らない
- ファイル名は `{団体ID}-icon.webp`、`{団体ID}-{連番}.webp`、`{団体ID}-{連番}@600.webp`。**連番は 1 から詰める。最大3枚**
- HEIC は先に変換しておく

### 5-2. sync がやること（`scripts/photo-index.ts`）

1. `public/photos` を1度だけ読み、`{id}-icon.webp` を `icon` に、`{id}-{連番}.webp` を連番順に `photos` に入れる。**`@600` は入れない。**参照側が `lib/design.ts` の `photoSrc()` で組み立てる
2. **最大3枚。4枚目以降は無視して警告**
3. 1枚も無い団体は `icon: null` / `photos: []` のまま。**警告は出すが除外はしない**（写真がない団体はジャンル色のタイルで出る。CLAUDE.md §6）

次の場合も警告を出す。どれも公開してから気づくと直しにくい。

- 連番が飛んでいる（`c054-2.webp` が無いのに `c054-3.webp` がある）
- `@600` が無い（**一覧のサムネが404になる**）
- 公開対象にないIDの写真が置いてある（消し忘れ）

**キャッシュは要らない。**変換しないので、走査するだけ。

### 5-3. 写真を入れ替えるとき

ファイルを置き換えて `npm run sync` を回す。枚数が変われば `photos` の配列が変わり、差分に出る。

**`circles.json` の `photos` / `icon` を手で書かない。**次の sync で上書きされる。

---

## 6. 警告

除外とは別に、次を `data/report.md` に出す。

- 原稿なしで `OK`
- キャッチコピーが空で `一言`へフォールバック
- 団体マスタの大分類が空または未知値
- 区分・ジャンル・募集状態が未知値
- 男子割合が0〜100の範囲外
- 役職に個人名が混ざっている可能性
- 取材日が読めない、または月日が曖昧
- SNSがURL形式でない
- 年会費が未確認
- 初心者数が所属人数を超える
- 写真が0枚（`public/photos` に `{id}-1.webp` も `{id}-icon.webp` も無い）、連番の飛び、`@600` の欠け、消し忘れ
- 紹介文が空または3行未満
- キャッチコピーが20文字超
- 取材日から10か月以上経過
- `tile_size` が未知値

---

## 7. フィクスチャテスト

Google認証なしで次を実行する。

```bash
node --test scripts/sheet-transform.test.mjs
```

`scripts/fixtures/sheet-sample.json` は匿名の架空団体だけを使い、`掲載データ` と `団体マスタ` の行を保持する。テストでは公開判定、未面談スキップ、新 `Circle` の全フィールド、列名、警告経路を確認する。

---

## 8. 出力と安全策

- `data/circles.json`: 公開対象の `Circle[]`
- `data/report.md`: 除外・警告・写真の走査結果。gitignore対象
- `public/photos`: 変換済みWebP
- JSON上書き前に追加・削除・変更フィールドを表示して確認する
- `--yes` なしの非対話環境では既存JSONを上書きしない
- 自動コミット・自動デプロイは実装しない

---

## 9. 自動で回す（GitHub Actions）

`.github/workflows/sync-sheet.yml` が sync を回し、差分があれば PR「シートの更新」を開く。**マージは人がする。**マージすると Vercel が公開する。

```
フォーム送信 → 回答 → 掲載データ（式） ─┐
                                    ├→ Actions: sync → PR「シートの更新」→ 人がマージ → Vercel
毎朝7:00 / 手動 / Apps Script ───────┘
```

### 9-1. 準備（1回だけ）

1. **Google Cloud**: サービスアカウントのキーは作れないので、Workload Identity 連携を使う。GitHub 用のプールとプロバイダを作り（発行元 `https://token.actions.githubusercontent.com`、条件 `assertion.repository == 'aoaoeiga/ksu-circles'`）、sync 用サービスアカウントに `roles/iam.workloadIdentityUser` を付ける。サービスアカウントにはスプレッドシートと写真の Drive フォルダを閲覧者で共有しておく（ローカルの偽装方式と同じ相手）
2. **GitHub → Settings → Secrets and variables → Actions → Variables** に3つ入れる
   - `SHEET_ID` — スプレッドシートのID
   - `GCP_WORKLOAD_IDENTITY_PROVIDER` — `projects/<番号>/locations/global/workloadIdentityPools/<プール>/providers/<プロバイダ>`
   - `GCP_SERVICE_ACCOUNT` — sync 用サービスアカウントのメール
3. **GitHub → Settings → Actions → General** の「Allow GitHub Actions to create and approve pull requests」をオンにする
4. ワークフローは **main に入ってから**定期実行される

### 9-2. フォーム送信ですぐ回す（任意）

`docs/ops/apps-script.gs` の `requestSiteUpdate()` が `repository_dispatch` を送る。スクリプト プロパティに `GITHUB_REPO` と `GITHUB_TOKEN`（fine-grained、このリポジトリだけ、Actions: Read and write）を入れて `installTriggers()` を1回実行する。入れなくても毎朝の定期実行で拾う。

### 9-3. 新しい団体を載せる手順

1. フォームで回答する（`団体ID` は `団体マスタ` と同じ `c###`）
2. `掲載データ` の手入力列（`紹介文` / `キャッチコピー` / `tile_size` / `公開可否`）を埋める。`公開可否 = OK` で一覧に出る（§3）
3. 写真は `回答` の `アイコン写真` / `写真` に Drive のファイルURLを入れる。`掲載データ` の `写真_元` に式でつながる
4. PR「シートの更新」をマージする
