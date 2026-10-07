/**
 * 京産大サークル名鑑 データ — Apps Script（現行版）
 *
 * スプレッドシートの「拡張機能 → Apps Script」に、既存のコードを全部消してからこのファイルを貼る。
 * 旧 rebuildLookups / migrateOldRows / migratePhotoColumns は役目を終えたので貼らない
 * （migratePhotoColumns は実行済み。もう一度実行すると「列の並びが想定と違います」で止まり、バックアップだけ増える）。
 *
 * 関数
 *   rebuildLookups()      掲載データ の式を 回答 の見出し名から引き直す。何度実行してもよい
 *   requestSiteUpdate()   GitHub の「シートからサイトを更新」ワークフローをすぐ動かす（任意）
 *   installTriggers()     フォーム送信のたびに requestSiteUpdate を呼ぶトリガーを入れる（任意・1回だけ）
 *
 * サイト側の流れは docs/10-sync-spec.md §9。
 */

const SHEET_ID = '1rS2ijbwdYtQBCBorgk2vE1FMKx2rl0i5CBk_0DXJ21c';

// 掲載データの列名 → 回答の見出し候補（左から順に探して、最初に見つかったものを使う）
const LOOKUP_MAP = {
  '通称': ['通称（サイトに大きく出す名前）'],
  '正式名称': ['正式名称'],
  '区分': ['公式の所属区分'],
  'ジャンル': ['ジャンル'],
  '一言': ['一言で言うと'],
  '週回数': ['週に何回'],
  '活動場所': ['活動場所'],
  '参加の緩さ': ['参加の緩さ'],
  '先輩の呼び方': ['先輩の呼び方'],
  '年会費状況': ['年会費の状況'],
  '年会費金額': ['年会費の金額（円）'],
  '所属人数': ['所属人数'],
  '1年生': ['1年生の人数'],
  '男子割合': ['男子の割合（%）', '男子の割合（％）'],
  '初心者数': ['初心者から始めた人数'],
  '掛け持ち': ['掛け持ちしている人'],
  '掛け持ち条件': ['掛け持ちの条件'],
  'いま入れるか': ['いま入れるか'],
  '春以外の募集': ['春以外の募集に興味があるか'],
  'Instagram': ['Instagram のURL'],
  'X': ['X のURL'],
  '公式サイト': ['公式サイトのURL'],
  'アイコン写真_元': ['アイコン写真', 'アイコン写真のURL'],
  '顔出しNG': ['顔出しNGの部員がいるか'],
  '聞き取りメモ': ['聞き取りメモ'],
  '取材日': ['取材日'],
  '役職': ['面談相手の役職と学年'],
  '代表からの一言': ['代表からの一言'],
};

// 「写真_元」は回答の写真列をカンマ区切りでつなぐ（sync はこの1列だけを読む）
const PHOTO_COLUMN = '写真_元';
const PHOTO_COUNT_COLUMN = '写真枚数';
const PHOTO_SOURCES = ['写真', '写真URL 1枚目', '写真URL 2枚目', '写真URL 3枚目'];

// 消えた列。掲載データに残っていても式は入れない
const RETIRED_COLUMNS = ['写真1_元', '写真2_元', '写真3_元', 'アイコン写真', '写真1', '写真2', '写真3'];


function rebuildLookups() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const ans = ss.getSheetByName('回答');
  const pub = ss.getSheetByName('掲載データ');
  if (!ans || !pub) throw new Error('「回答」か「掲載データ」タブが見つかりません');

  const aHdr = ans.getRange(1, 1, 1, ans.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const pHdr = pub.getRange(1, 1, 1, pub.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const last = pub.getLastRow();
  if (last < 2) throw new Error('掲載データに団体IDの行がありません');

  const idCol = colLetter_(aHdr.indexOf('団体ID'));
  if (aHdr.indexOf('団体ID') < 0) throw new Error('回答に「団体ID」列がありません');

  const log = [];
  const answerCol = names => {
    for (const n of names) { const i = aHdr.indexOf(n); if (i >= 0) return colLetter_(i); }
    return null;
  };
  const pubCol = name => {
    let c = pHdr.indexOf(name) + 1;
    if (c === 0) {
      c = pHdr.length + 1;
      pub.getRange(1, c).setValue(name);
      pHdr.push(name);
      log.push(`掲載データに列「${name}」を足した`);
    }
    return c;
  };
  // 同じ団体IDの回答が複数あるときは、いちばん下（最新）の回答を使う
  const latest = (r, col) => `XLOOKUP($A${r},'回答'!$${idCol}:$${idCol},'回答'!$${col}:$${col},"",0,-1)`;
  const fill = (c, make) => {
    const f = [];
    for (let r = 2; r <= last; r++) f.push([make(r)]);
    pub.getRange(2, c, last - 1, 1).setFormulas(f);
  };

  for (const [name, candidates] of Object.entries(LOOKUP_MAP)) {
    const col = answerCol(candidates);
    if (!col) { log.push(`スキップ: 回答に「${candidates.join('」「')}」が無い → 掲載データ「${name}」`); continue; }
    fill(pubCol(name), r => `=IFERROR(${latest(r, col)},"")`);
  }

  const photoCols = PHOTO_SOURCES.map(n => answerCol([n])).filter(Boolean);
  if (photoCols.length) {
    const pc = pubCol(PHOTO_COLUMN);
    fill(pc, r => `=IFERROR(TEXTJOIN(", ",TRUE,${photoCols.map(col => latest(r, col)).join(',')}),"")`);
    if (pHdr.indexOf(PHOTO_COUNT_COLUMN) >= 0) {
      const cell = colLetter_(pc - 1);
      fill(pubCol(PHOTO_COUNT_COLUMN), r => `=IF(${cell}${r}="",0,COUNTA(SPLIT(${cell}${r},",")))`);
    }
  } else {
    log.push('スキップ: 回答に写真の列が無い → 掲載データ「写真_元」');
  }

  const leftovers = RETIRED_COLUMNS.filter(n => pHdr.indexOf(n) >= 0);
  if (leftovers.length) log.push(`使っていない列が残っています（消してよい）: ${leftovers.join('、')}`);

  Logger.log(log.join('\n') || '全部の列を引き直した');
  ss.toast('掲載データの式を引き直しました。詳細は実行ログ');
}


/**
 * GitHub の「シートからサイトを更新」ワークフローをすぐ動かす。
 * 事前に「プロジェクトの設定 → スクリプト プロパティ」に次の2つを入れる。
 *   GITHUB_REPO   aoaoeiga/ksu-circles
 *   GITHUB_TOKEN  fine-grained トークン（このリポジトリだけ、Actions: Read and write）
 * 動かなくても、ワークフローは毎朝自動で回るので反映は遅れるだけ。
 */
function requestSiteUpdate() {
  const props = PropertiesService.getScriptProperties();
  const repo = props.getProperty('GITHUB_REPO');
  const token = props.getProperty('GITHUB_TOKEN');
  if (!repo || !token) throw new Error('スクリプト プロパティに GITHUB_REPO と GITHUB_TOKEN を入れてください');

  const res = UrlFetchApp.fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ event_type: 'sheet-updated' }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 204) throw new Error('GitHub に届きませんでした: ' + res.getResponseCode() + ' ' + res.getContentText());
  Logger.log('サイト更新を依頼しました');
}

/** フォーム送信のたびに requestSiteUpdate を呼ぶ。1回だけ実行する */
function installTriggers() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'requestSiteUpdate')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('requestSiteUpdate').forSpreadsheet(ss).onFormSubmit().create();
}

/** シートを開いたとき、メニューに「サイトを更新」を出す */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('サークル名鑑')
    .addItem('掲載データの式を引き直す', 'rebuildLookups')
    .addItem('サイトを更新（GitHub）', 'requestSiteUpdate')
    .addToUi();
}

function colLetter_(index0) {
  let n = index0 + 1, s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
