# フォームを自動生成する（Apps Script・旧版記録）

作成: 2026/08/30 ／ 東田
用途: 8/30版の40問フォームを生成した旧 `Code.gs` の記録。

> [!CAUTION]
> **9/2版のフォームとスプレッドシートへ置き換え済み。下の `buildForm()` は再実行しない。**
> 再実行すると旧40問のフォームと別のスプレッドシートがもう1組作られる。現行の設問は `09-form-questions.md` の36問。

---

## 9/2版で使う `rebuildLookups`

> [!IMPORTANT]
> **現行版は `docs/ops/apps-script.gs`。**下のコードは写真列の組み替え（`写真_元`）より前の版で、回答に無い `アイコン写真のURL` を探して止まる。記録として残している。

9/2版ではフォームを作り直さない。`掲載データ` のVLOOKUPを回答の列番号ではなく、見出し名から引き直すため、次の `rebuildLookups` だけを使う。

1. 使用中のスプレッドシートを開く
2. `拡張機能` → `Apps Script` を開く
3. 次の関数を貼り、`rebuildLookups` を1回実行する
4. フォーム末尾へ `代表からの一言` を追加したあとは、もう一度実行する

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

---

## 旧40問フォームの生成手順（実行しない）

1. [script.google.com](https://script.google.com) を開いて「新しいプロジェクト」
2. 出てきたコードを全部消して、下の `Code.gs` を丸ごと貼る
3. 上の関数選択が `buildForm` になっているのを確認して「実行」
4. 初回だけ認可を求められる → 自分のアカウントで許可（「安全ではないページ」と出たら「詳細」→「移動」）
5. 実行ログに**フォームのURLとスプレッドシートのURL**が出る。これで完成

フォームと回答先スプレッドシートが同時に作られて、リンクまで済んだ状態になる。`団体ID一覧` シートに `c001`〜`c158` の空行も入る。

**あとから設問を直したくなったら、フォームの画面で直接編集していい。**スクリプトを再実行すると別のフォームがもう1つできてしまうので、実行は1回だけ。

---

## Code.gs

```javascript
// 京産大サークル名鑑 掲載データ入力フォーム 生成スクリプト
// 実行するのは buildForm() ひとつだけ。1回だけ実行する。

const SPEC = [
  ['SEC', '管理'],
  ['TEXT',  '団体ID', 'c001 の形式。面談前にID表で確認してから入力する', true],
  ['DATE',  '取材日', '', true],
  ['TEXT',  '取材者', '', true],
  ['TEXT',  '面談相手の役職と学年', '例: 代表（3年）。個人名は入れない', true],

  ['SEC', '基本情報'],
  ['TEXT',  '通称（サイトに大きく出す名前）', '', true],
  ['TEXT',  '正式名称', '', true],
  ['RADIO', '大分類', '', true, ['運動系', '文化系', 'その他']],
  ['RADIO', '公式の所属区分', '', true,
    ['体育会所属クラブ', '文化団体連盟', '届出団体', '学生プロジェクトチーム', '委員会・その他']],
  ['RADIO', 'ジャンル', '', true,
    ['球技', '武道', '音楽', '文化・創作', 'ボランティア', 'その他']],

  ['SEC', '活動', '聞けなかった項目は空欄のまま次へ。空欄＝未確認として扱う'],
  ['CHECK', '活動曜日', '', false, ['月','火','水','木','金','土','日','決まっていない']],
  ['TEXT',  '活動時間', '例: 18:00-20:00 ／ 曜日で違えば 月 18:00-20:00 / 木 19:00-21:00', false],
  ['TEXT',  '活動場所', '', false],
  ['TEXT',  '頻度', '例: 週2回 / 1回2時間', false],

  ['SEC', '人数', '「男女比は?」ではなく「男子と女子は何人ずつですか」と聞く'],
  ['NUM',   '所属人数', '', false],
  ['NUM',   '男子の人数', '', false],
  ['NUM',   '女子の人数', '', false],
  ['NUM',   '初心者から始めた人数', '', false],

  ['SEC', 'お金'],
  ['NUM',   '年会費（円）', '0円の団体は 0 と入力する。空欄は未確認の意味になる', false],
  ['TEXT',  '年会費以外にかかる費用', '例: 合宿費 年1回 8000 / 道着 初回のみ 9000', false],
  ['RADIO', '年会費以外の費用はないか', '', false, ['ない', 'ある（上に記入）', '聞けなかった']],

  ['SEC', '入部条件'],
  ['RADIO', '掛け持ち', '', false, ['できる', 'できない', '条件つき（下に記入）']],
  ['TEXT',  '掛け持ちの条件', '', false],
  ['RADIO', 'いま入れるか', '', false, ['いつでも入れる', '4月のみ', '募集していない']],
  ['DATE',  '次の新歓の日付', '', false],
  ['TEXT',  '次の新歓の内容', '持ち物・服装まで', false],

  ['SEC', '文章', '整った文章にしようとしない。メモは箇条書きでいい'],
  ['PARA',  '代表からの一言（そのまま載せる）', '相手の言葉のまま書き取る。こちらで整えない', false],
  ['PARA',  '聞き取りメモ', 'ここが一番大事。紹介文はこのメモから作る', true],
  ['TEXT',  'キャッチコピー案', '20文字まで。団体の制約か、他と違う点を書く', false],
  ['TEXT',  '新入生から一番よく聞かれる質問', '掲載には使わないが、10団体分集めるとサイトの項目を組み直せる', false],

  ['SEC', 'SNS'],
  ['TEXT',  'Instagram のURL', '', false],
  ['TEXT',  'X のURL', '', false],
  ['TEXT',  '公式サイトのURL', '', false],

  ['SEC', '写真', '写真そのものはDMで受け取って、自分でDriveに入れる'],
  ['RADIO', '写真の提供元', '', true, ['団体から受領', 'こちらで撮影', '未入手']],
  ['RADIO', '写真の掲載可否', '', true, ['可', '要確認', '不可']],
  ['RADIO', '顔出しNGの部員がいるか', '', true, ['いない', 'いる（下に記入）', '未確認']],
  ['TEXT',  '顔出しNGへの対応メモ', '', false],
  ['PARA',  '写真URL', 'Driveにアップロードしてから貼る。改行区切りで最大8', false],

  ['SEC', '掲載確認フロー', '面談時点では埋まらない。あとからスプレッドシートで直接更新する'],
  ['DATE',  '確認依頼を送った日', '', false],
  ['DATE',  '掲載OKが出た日', '', false],
  ['RADIO', '公開してよいか', 'OK の団体だけがサイトに出る', true, ['OK', '確認中', '不可']],
];

function buildForm() {
  const form = FormApp.create('京産大サークル名鑑 掲載データ入力');
  form.setDescription(
    '面談中に自分で埋めるフォーム。団体には送らない。\n' +
    '聞けなかった項目は空欄のまま送信する。「わからない」と書かない。\n' +
    '年会費が0円の団体だけは 0 と入力する（空欄＝未確認と区別するため）。'
  );
  form.setProgressBar(true);
  form.setCollectEmail(false);

  const numValidation = FormApp.createTextValidation()
    .requireNumber()
    .setHelpText('数字で入力する。分からなければ空欄のまま')
    .build();

  SPEC.forEach(function (q) {
    const type = q[0];
    if (type === 'SEC') {
      const page = form.addPageBreakItem().setTitle(q[1]);
      if (q[2]) page.setHelpText(q[2]);
      return;
    }
    const title = q[1], help = q[2], required = !!q[3], choices = q[4];
    let item;
    switch (type) {
      case 'TEXT':  item = form.addTextItem(); break;
      case 'PARA':  item = form.addParagraphTextItem(); break;
      case 'DATE':  item = form.addDateItem(); break;
      case 'RADIO': item = form.addMultipleChoiceItem().setChoiceValues(choices); break;
      case 'CHECK': item = form.addCheckboxItem().setChoiceValues(choices); break;
      case 'NUM':   item = form.addTextItem().setValidation(numValidation); break;
    }
    item.setTitle(title).setRequired(required);
    if (help) item.setHelpText(help);
  });

  // 回答先スプレッドシートを作ってリンクする
  const ss = SpreadsheetApp.create('京産大サークル名鑑 掲載データ');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // 団体IDの採番シートを作る（c001〜c158）
  const idSheet = ss.insertSheet('団体ID一覧');
  const rows = [['団体ID', '団体名', '区分', '面談状況']];
  for (let i = 1; i <= 158; i++) {
    rows.push(['c' + ('00' + i).slice(-3), '', '', '']);
  }
  idSheet.getRange(1, 1, rows.length, 4).setValues(rows);
  idSheet.setFrozenRows(1);

  Logger.log('フォーム（編集）: ' + form.getEditUrl());
  Logger.log('フォーム（回答）: ' + form.getPublishedUrl());
  Logger.log('スプレッドシート: ' + ss.getUrl());
}
```

---

## 実行したあとにやること

### 1. 団体ID一覧を埋める

`団体ID一覧` シートに `c001`〜`c158` の空行ができている。大学公式のクラブ・サークル一覧を上から順に、**団体名と区分をコピペで埋める。**面談前にここでIDを確認してからフォームを開く。

`面談状況` 列は `未接触` `DM送付` `面談済` `掲載OK` を手で入れていく。営業の進捗管理はこの1列で足りる。

### 2. 手で管理する列を5つ足す

**最初の1件を送信したあと**にやる。回答シートに列が生えてから、その右に足す。

| 列名 | 用途 |
|---|---|
| `紹介文` | 聞き取りメモから作った本文。3〜5行 |
| `キャッチコピー` | 案を推敲したもの |
| `除外理由` | ビルドから外している場合の理由 |
| `最終更新日` | 手で直したときに更新 |

（`写真URL` はフォーム側の設問に入れてあるので、ここには足さない）

**フォームの回答列は触らない。**フォーム側が上書きするので、書いても消える。

---

## うまくいかないとき

**「このアプリは Google で確認されていません」と出る**
自分で書いたスクリプトなので正常。「詳細」→「（プロジェクト名）に移動」で進む。

**実行ボタンの横の関数名が違う**
プルダウンで `buildForm` を選んでから実行する。

**もう1回実行してしまった**
フォームとスプレッドシートがもう1組できているだけ。使わないほうをゴミ箱に入れる。

**設問を直したい**
スクリプトを直して再実行するのではなく、**できたフォームの画面で直接編集する。**再実行すると別のフォームがもう1つできる。

---

## 手で作りたい場合

スクリプトを使わずに作るなら、`09-form-questions.md` §2 の表を上から入力する。

コツが1つ。**選択肢は改行区切りのテキストをまとめて貼れる。**1つ目の選択肢欄に

```
体育会所属クラブ
文化団体連盟
届出団体
学生プロジェクトチーム
委員会・その他
```

をそのまま貼ると、自動で5つの選択肢に分かれる。1つずつ打たなくていい。
