# スキーマ対応表 — Design ↔ 本番

作成: 2026/08/30
更新: 2026/09/06
なぜ要るか: **Claude Design のコードに直書きされているダミーデータと、フォームから集めるデータの形が違う。**移植のときにここを揃える。

---

## 1. そのまま使うフィールド

Design のコードが使っている名前を、可能な限り本番の型でも使う。**UI側の書き換えを最小にするため。**

`id` `short_name` `name` `division` `category` `genre` `one_liner` `active_days` `place` `annual_fee` `member_count` `beginner_count` `first_year_count` `description` `leader_comment` `recruiting` `surveyed_at` `sns` `photos` `tile_size`

---

## 2. 変えるフィールド

| 旧本番 / Design | 新本番 | 理由 |
|---|---|---|
| `frequency_per_week: number \| null` | `frequency: string \| null` | 「週に何回」の回答をそのまま保持する。数値への変換で回答の意味を落とさない。 |
| `gender: { male, female } \| null` | `male_ratio: number \| null` | フォームは男子の割合（%）だけを聞く。表示時に `lib/gender.ts` の `genderRatio()` で合計10の比率へ丸める。 |
| `multi_club_ok: string \| null` | `multi_club: string \| null` | 設問が可否から「掛け持ちしている人がいるか」へ変わった。条件があれば ` / ` で連結して回答を保持する。 |
| `photos: string[]`（最大8、先頭を一覧とOGPに利用） | `icon: string \| null` ＋ `photos: string[]`（最大3） | 一覧タイル・OGP用の1枚と、ヒーロー用の写真を用途ごとに分ける。`icon` が無い場合、画面は `photos[0]` を一覧に使う。 |
| `active_times` | 削除 | 新フォームに活動時間は無い。 |
| `hours_per_session` | 削除 | 新フォームに1回あたりの時間は無い。 |
| `extra_cost_note` | 削除 | 年会費以外の金は掲載しない。 |
| `next_recruit` | 削除 | 次の新歓の日付・内容は掲載しない。`recruiting` の状態は残す。 |

---

## 3. 足すフィールド

| 本番 | 中身 | フォーム / シートの列 |
|---|---|---|
| `division` | `運動系` / `文化系` / `その他` | `団体マスタ` の「大分類」 |
| `days_undecided` | 曜日が未決定と確認できたか | 「曜日未確認」。`active_days` が空でも未確認と区別する。表示は未決。 |
| `ease` | 参加の緩さ | 「参加の緩さ」 |
| `senior_call` | 先輩の呼び方 | 「先輩の呼び方」 |
| `leader_comment` | `{ text, role }` | 「代表からの一言」「面談相手の役職と学年」 |
| `surveyed_at` | `"2026-09"` | 「取材日」を月に丸める |
| `recruiting` | `いつでも入れる` / `4月のみ` / `募集していない` | 「いま入れるか」 |

**Design 側では代表からの一言が `detail.voice` で、署名が `代表（3年）` の直書きになっている。**ここをデータから読む形に直す。

---

## 4. スプレッドシートに手入力で持つ列

| 列名 | 値 | 既定 |
|---|---|---|
| `tile_size` | `S` / `M` / `L` | `M` |

`tile_size` は一覧タイルの大きさ。Design の一覧は大きさの違うタイルを混ぜて並べる作りになっていて、この値で決まる。

- `L` — 写真が良い、目立たせたい団体。**全体の1〜2割まで**
- `M` — 既定
- `S` — 写真がない団体、情報が少ない団体

写真の枚数から自動で決めてもいいが、**全部Lになると一覧が単調になる**ので、手で決める余地を残しておく。

---

## 5. 未確認の扱い（再掲・ここが崩れやすい）

- `annual_fee` … `0` は無料、`null` は未確認。**混同すると未確認が無料に見える**
- `male_ratio` … `null` は未確認。`0` は女子のみ、`100` は男子のみであり、未確認ではない
- `active_days` … 空配列だけでは未確認と未決定を区別できない。`days_undecided: true` なら未決定、`false` なら未確認として扱う足場にする（表示ルールは未決）
- `icon` … `null` は未確認。`photos[0]` も無いときはジャンル色タイルを出す
- 数字カードの中は `—`、カードの外は文字で `未確認`
