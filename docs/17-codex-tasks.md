# Codex 作業リスト — 9/2版シートへの追従

作成: 2026/09/06 ／ 東田
前提: `AGENTS.md` → `CLAUDE.md` → このファイル、の順に読む。背景は `docs/16-sheet-diff-20260902.md`。

**上から順に、1タスク1PR。**A は人（東田）がシート側でやること。B が Codex の仕事。B-1 から始めてよいが、**B-3（sync）の動作確認は A が終わるまでできない**ので、フィクスチャで進める。

---

## 0. 決定事項（これを前提に実装する）

| 論点 | 決定 |
|---|---|
| 原本 | 9/2 06:39 版のスプレッドシート `京産大サークル名鑑 データ`（ID `1rS2ijbwdYtQBCBorgk2vE1FMKx2rl0i5CBk_0DXJ21c`）。タブは `回答` / `団体マスタ` / `掲載データ` |
| sync が読むタブ | `掲載データ`（本体）＋ `団体マスタ`（`大分類` のみ） |
| 大分類 `division` | フォームでは聞かない。`団体マスタ` に列を足し、そこから引く |
| 代表からの一言 | 残す。フォームに設問を戻す（`回答` の末尾列に追加される） |
| 男女比 | `男子の割合（%）` 1問。型は `male_ratio: number \| null`（0〜100）。表示は従来どおり合計10の比率に丸める |
| 新項目 | `参加の緩さ` `先輩の呼び方` を**載せる**。掲載項目は **14 → 15** に変更（年会費以外の金を消し、2つ足す）。`CLAUDE.md` §2 と `docs/01` §5 の「14」を「15」に書き換える。「足すなら消す」の原則は維持 |
| 消す項目 | 活動時間 `active_times`／1回あたりの時間 `hours_per_session`／年会費以外の金 `extra_cost_note`／次の新歓 `next_recruit` |
| 写真 | `icon`（1枚・一覧タイルとOGP用）＋ `photos`（最大3・ヒーロー用）。`icon` が無ければ `photos[0]` を一覧に使う。両方無ければジャンル色タイル。**ファイルは手元で変換して `public/photos` に置く**（`{id}-icon.webp` / `{id}-{n}.webp` / `{id}-{n}@600.webp`）。sync はシートの写真URL列を読まない |
| 掛け持ち | 設問が「できるか」から「掛け持ちしている人がいるか」に変わった。フィールド名は `multi_club` に改名し、回答文字列をそのまま持つ。条件があれば ` / ` で連結 |
| `春以外の募集に興味があるか` | 営業データ。sync は読まない。型に入れない |
| 掲載前プレビュー | preview ブランチ。**URL を知っている人なら誰でも見られる**でよい（noindex は維持）。パスワード等はかけない |
| 公開判定 | `公開可否 = OK` のみ。`INCLUDE_UNCONFIRMED=1` のとき `確認中` も含む。**OK でも `紹介文` か `キャッチコピー` が空なら `確認中` 扱いにして警告**（原稿なしで公開しない） |
| `one_liner` | `掲載データ` の手入力 `キャッチコピー` を正とする。空なら `回答` 由来の `一言` を使い、警告を出す |
| 区分の表記 | シートは `体育会` / `委員会・独立団・その他`、型は `体育会所属クラブ` / `委員会・その他`。**sync 側で正規化**する。シートは直さない |

決まっていないことは `docs/16` §7。**実装しない。**

---

## A. 人がやること（シート側）

### A-1. 使う組を1つに決める
06:39 版を使う。06:38 版のフォームとスプレッドシートは名前の頭に `（使わない）` を付けるか、ゴミ箱へ。

### A-2. `掲載データ` の VLOOKUP を直す
11列が1つずれている（`docs/16` §1）。下の Apps Script を `拡張機能 > Apps Script` に貼って `rebuildLookups` を1回実行する。**列名で引き直す**ので、設問を足しても再実行すれば追従する。

```javascript
// 掲載データ の VLOOKUP を、回答 の見出し名から引き直す。何度実行してもよい。
function rebuildLookups() {
  const ss  = SpreadsheetApp.openById('1rS2ijbwdYtQBCBorgk2vE1FMKx2rl0i5CBk_0DXJ21c');
  const ans = ss.getSheetByName('回答');
  const pub = ss.getSheetByName('掲載データ');

  // 掲載データの列名 → 回答の設問名
  const MAP = {
    '通称': '通称（サイトに大きく出す名前）', '正式名称': '正式名称', '区分': '公式の所属区分',
    'ジャンル': 'ジャンル', '一言': '一言で言うと', '週回数': '週に何回', '活動場所': '活動場所',
    '参加の緩さ': '参加の緩さ', '先輩の呼び方': '先輩の呼び方', '年会費状況': '年会費の状況', '年会費金額': '年会費の金額（円）',
    '所属人数': '所属人数', '1年生': '1年生の人数', '男子割合': '男子の割合（%）',
    '初心者数': '初心者から始めた人数', '掛け持ち': '掛け持ちしている人', '掛け持ち条件': '掛け持ちの条件',
    'いま入れるか': 'いま入れるか', '春以外の募集': '春以外の募集に興味があるか',
    'Instagram': 'Instagram のURL', 'X': 'X のURL', '公式サイト': '公式サイトのURL',
    'アイコン写真_元': 'アイコン写真のURL', '写真1_元': '写真URL 1枚目', '写真2_元': '写真URL 2枚目',
    '写真3_元': '写真URL 3枚目', '顔出しNG': '顔出しNGの部員がいるか', '聞き取りメモ': '聞き取りメモ',
    // ここから追加列（無ければ末尾に作る）。先輩の呼び方 も現状の掲載データに列が無いので末尾に足される
    '取材日': '取材日', '役職': '面談相手の役職と学年', '代表からの一言': '代表からの一言',
  };

  const aHdr = ans.getRange(1, 1, 1, ans.getLastColumn()).getValues()[0];  // A=Timestamp, B=団体ID, …
  let   pHdr = pub.getRange(1, 1, 1, pub.getLastColumn()).getValues()[0];
  const last = pub.getLastRow();
  const idx  = q => { const i = aHdr.indexOf(q); if (i < 1) throw new Error('回答に無い設問: ' + q); return i; }; // B が 1

  for (const [col, q] of Object.entries(MAP)) {
    if (q === '代表からの一言' && aHdr.indexOf(q) < 0) continue;   // フォームに設問を足す前はスキップ
    let c = pHdr.indexOf(col) + 1;
    if (c === 0) { c = pHdr.length + 1; pub.getRange(1, c).setValue(col); pHdr.push(col); }
    const i = idx(q);
    const f = [];
    for (let r = 2; r <= last; r++) f.push([`=IFERROR(VLOOKUP($A${r},'回答'!$B:$BZ,${i},FALSE),"")`]);
    pub.getRange(2, c, last - 1, 1).setFormulas(f);
  }
}
```

### A-3. フォームに「代表からの一言」を戻す
面談シート（06:39版）に段落形式で `代表からの一言` を追加（文言はこの通り。A-2 の MAP がこの名前で引く）。追加後に `rebuildLookups` をもう一度実行。

### A-4. `団体マスタ` に `大分類` 列を足す
K列に `大分類`。値は `運動系` / `文化系` / `その他`。面談前に埋めておく。団体名が空の26件・区分が空の27件もここで埋める。

### A-5. 既存4件を新フォームで入れ直す
c054・c056・c058・c047 を**新フォームから再入力**する（移行スクリプトは書かない。4件なら手のほうが速く、フォームの検証にもなる）。入れ直すときに直すもの:

- c047: `面談相手の役職と学年` が `take` → 役職に直す（個人名を入れない）
- c056: `年会費以外の費用はないか = ない` と紹介文「合宿費がかかります」の矛盾 → 団体に確認
- c054: `掛け持ちの条件` の「少ない　一筋多め」→ 条件でないなら空欄
- 写真: Drive の**ファイル**URL を `アイコン` と `写真1〜3` に1つずつ（元ファイルを探すためのメモ。sync は読まない）。**掲載に使うのは手元で変換して `public/photos` に置いたファイル**（`docs/10` §5）。c054 はフォルダURLなので分解する
- 入力後、`掲載データ` の手入力列（紹介文／キャッチコピー／tile_size／公開可否）を旧シートから写す。c047 は原稿がないので `公開可否 = 確認中`

### A-6. `.env` を切り替える
`SHEET_ID` を新シートに、`SHEET_NAME=掲載データ`。旧シートは名前に `（旧・8月版）` を付けて残す。

---

## B. Codex がやること

### B-1. 型を新構成に合わせる
**触る:** `types/circle.ts` `docs/13-schema-mapping.md` `CLAUDE.md`（共通関数と、§2 の「14項目」→「15項目」）`docs/01-requirements.md`（§5 の一覧を15項目に）

```ts
// 消す
active_times, hours_per_session, extra_cost_note, next_recruit, gender
// 変える
frequency_per_week: number | null  →  frequency: string | null   // 「週に何回」の回答をそのまま
multi_club_ok: string | null       →  multi_club: string | null  // 「掛け持ちしている人」＋条件
photos: string[]                   →  icon: string | null; photos: string[]  // photos は最大3
// 足す
male_ratio: number | null   // 0〜100。null は未確認
ease: string | null         // 参加の緩さ
senior_call: string | null  // 先輩の呼び方
// そのまま
id short_name name division category genre one_liner active_days place
annual_fee member_count beginner_count first_year_count description
leader_comment recruiting surveyed_at sns tile_size
```

`active_days` に加えて `days_undecided: boolean` を足す（`曜日未確認` 列。`active_days` が空でも「決まっていない」と「聞けていない」を区別する足場。表示は B-4 では変えない）。

**受け入れ:** `npm run build` が通る（画面側は B-4 で直すので、この PR では型エラーを `// TODO(B-4)` で最小限に潰してよい）。`docs/13` の表が新しい型と一致している。

### B-2. `lib/gender.ts` `lib/labels.ts` を新しい型に合わせる
**触る:** `lib/gender.ts` `lib/labels.ts` `CLAUDE.md`

- `genderRatio(male_ratio)`: 0〜100 → 合計10の比率文字列。従来の丸め規則を踏襲（1%でもいれば 0 にしない、0% なら `女子のみ`、100% なら `男子のみ`）。null は null
- `feeLabel` は変えない（`¥0` と `—` の区別は維持）
- `timeText` `extraCostText` `recruitDateText` は削除。`multiText` は `multi_club` をそのまま出す（null は `未確認`）
- `easeText` `seniorCallText` を追加（null は `未確認`）

**受け入れ:** 丸めの境界（0%, 1%, 50%, 99%, 100%, null）を `lib/gender.test.ts` か同等で確認。テストランナーが無ければ `node --test` で足す。

### B-3. `scripts/sync.ts` を新シートに向ける
**触る:** `scripts/sync.ts` `docs/10-sync-spec.md` `.env.example`

読む: `掲載データ` 全列 ＋ `団体マスタ` の `団体ID` `大分類`。

変換:
- **行の採用:** `通称` が空の行は未面談としてスキップ（158行が式で常に存在するため）
- **公開判定:** `公開可否 = OK`。`INCLUDE_UNCONFIRMED=1` なら `確認中` も。OK でも `紹介文` か `キャッチコピー` が空 → `確認中` 扱い＋警告 `原稿なしで OK になっている`
- `active_days`: `月`〜`日` の TRUE を 0〜6 に。`days_undecided` = `曜日未確認`
- `annual_fee`: `年会費状況` が `無料（0円）` → 0、`未確認` または金額空 → null、それ以外 → 金額。**`年会費表示` 列は読まない**（表示は `feeLabel` が正）
- `male_ratio`: 数値。0〜100 の範囲外は null＋警告
- `frequency`: 文字列のまま
- `ease`: `参加の緩さ`。空は null
- `senior_call`: `先輩の呼び方`（A-2 で `掲載データ` に足した列）。空は null
- `multi_club`: `掛け持ち` ＋（`掛け持ち条件` があれば ` / ` で連結）。空は null
- `one_liner`: `キャッチコピー`（手入力）。空なら `一言`＋警告
- `division`: `団体マスタ` から。空は `その他`＋警告
- `category`: 正規化 `体育会`→`体育会所属クラブ`、`委員会・独立団・その他`→`委員会・その他`。それ以外の未知値は警告して `委員会・その他`
- `leader_comment`: `{ text: 代表からの一言, role: 役職 }`。`text` が空なら null。`role` は既存の検証（役職＋学年の形でなければ `代表` に置換して警告）を維持
- `surveyed_at`: `取材日` を `YYYY-MM` に
- 写真: **シートの写真URL列は読まない**（`docs/10` §5 のとおり sync は画像を変換しない。Drive の認証を増やさないため）。`public/photos` を走査して `{id}-icon.webp` → `icon`、`{id}-{n}.webp`（最大3、連番順）→ `photos`。変換は手元で済ませて置く
- `春以外の募集` `聞き取りメモ` `確認依頼日` `掲載OK日` は読まない

**動作確認:** Google 認証が無いので、`scripts/fixtures/sheet-sample.json`（`掲載データ` と `団体マスタ` の行を JSON にしたもの。**実在団体名を使わない**）を用意して、シート読み込み部分と変換部分を分離し、変換部分をフィクスチャで通す。上の警告が全部出ることを確認。

**受け入れ:** フィクスチャから `types/circle.ts` に完全一致する JSON が出る。`docs/10` の変換ルールが上と一致している。

### B-4. 画面を新しい型に合わせる
**触る:** `app/c/[id]/page.tsx` `components/HomeScreen.tsx` `components/Hero.tsx` `components/PhotoTile.tsx` `lib/design.ts` `docs/ui/07-content.md`

- **消す:** 活動時間の表示、「別途かかる金」ブロック、「次の新歓」ブロック（`recruiting` のバッジは残す）
- **消す:** 一覧の「掛け持ち可」フィルター（`Filters.multi` と URL の `multi=1`）。設問が「できるか」から「している人がいるか」に変わったので、可否の絞り込みは成立しない。詳細の見出しは「掛け持ちの状況」に。`multi` で落ちた「未確認」件数の表示も一緒に消す
- **足す:** `参加の緩さ` `先輩の呼び方` を、掛け持ちと同じ行スタイルで掛け持ちの直後に。**新しい色・アイコン・カード種別を作らない**（CLAUDE.md §5・§6、07-content §10）
- 男女比: `male_ratio` から `genderRatio()` 経由。null は `—`
- 写真: 一覧タイルと OGP は `icon`（無ければ `photos[0]`）。ヒーローのカルーセルは `photos`（最大3）。両方無ければ従来どおりジャンル色タイル。`icon` だけある団体はヒーローにも `icon` を使う
- **View Transitions の例外:** `icon` と `photos[0]` が別の画像の団体では、一覧タイルが拡大してヒーローになる途中で画像が切り替わる。**これは受け入れる**（写真の用途分けを優先）。拡大の動き自体は維持し、切り替えはクロスフェードで。ジャンル色タイル → ジャンル色ヒーローの遷移は従来どおり
- `days_undecided` は表示に使わない（表示ルールは未決）

**受け入れ:** `data/circles.sample.json` を新しい型で作り直し（B-5）、375px で横スクロールなし。未確認ケース（年会費 null／男女比 null／写真ゼロ／活動日 空）でカードが消えず `—` が出る。ヒーローのズーム・シート立ち上がり・カルーセルの挙動が変わっていない。

### B-5. サンプルデータと生成物を更新
**触る:** `data/circles.sample.json`

8件のダミーを新しい型で。実在団体名を使わない。未確認・写真ゼロ・`女子のみ`・`男子のみ`・活動日空・`days_undecided: true` を1件ずつ含める。

### B-6. ドキュメントを揃える
**触る:** `README.md` `docs/ops/09-form-questions.md` `docs/ops/11-form-builder.md` `docs/12-deploy-spec.md` `PROMPT.md`

- `09`: 設問一覧を新36問（35＋代表からの一言）に書き換え。**「団体に送るフォームではない」「取材者と役職を取り違えない」の注意は残す**
- `11`: Code.gs は旧構成なので、冒頭に「9/2版で置き換え済み。再実行しない」と明記し、A-2 の `rebuildLookups` を載せる
- `README` `12`: データの流れ図の「1行=1団体」を「`掲載データ` タブ」に
- `PROMPT.md`: STEP 5 の記述を新シート前提に

### B-7. 最終確認
`npm run lint` `npm run build`。`CLAUDE.md` の10項目を1つずつ、どこで担保しているか PR に書く。特に §3（未確認を隠さない）§4（`¥0` と未確認）§6（写真なしを欠落に見せない）§7（個人名を出さない）。

---

## C. やらないこと

- `data/circles.json` の手編集
- Google Sheets への書き込み、Apps Script の実行（A は人がやる）
- `design/` の変更
- 表紙（S-00）の新設、比較導線、絞り込み0件の表示 — **未決。②以降で決める**
- 「学期ごとに曜日が変わる」の表示 — 未決
- Supabase 等への構成変更
