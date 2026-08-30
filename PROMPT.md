# Claude Code に貼るプロンプト

上から順に。**1つ終わってから次へ。**まとめて渡さない。

---

## 前提: design/ の中身について

`design/ksu-circles-v3.dc.html` は Claude Design の書き出しで、**素のHTMLではない**。独自のテンプレート記法が入っている。

| 記法 | 意味 |
|---|---|
| `<x-dc>` `<helmet>` | Design のラッパー。Next.js では不要 |
| `{{ expr }}` | 式の埋め込み → JSX の `{expr}` |
| `<sc-for list="{{ xs }}" as="x">` | 繰り返し → `xs.map(x => ...)` |
| `<sc-if value="{{ cond }}">` | 条件 → `{cond && ...}` |
| `<image-slot id shape fit>` | 画像枠 → `<img>` に置き換える |
| `ref="{{ someRef }}"` `onClick="{{ fn }}"` | そのまま React の ref / onClick |
| `support.js` `image-slot.js` | Design のランタイム。**移植後は不要** |

**そのままブラウザでは動かない。**変換が必要。ここを理解せずに「HTMLをコピーして」と指示すると壊れる。

このファイル1つに**一覧と詳細の両方**が入っている（`detail.*` が詳細側）。

---

## STEP 1 — プロジェクトを初期化する

```
CLAUDE.md と docs/01-requirements.md と docs/12-deploy-spec.md を読んで。

このリポジトリに Next.js（App Router / TypeScript）を初期化して。
既にある CLAUDE.md, PROMPT.md, docs/, data/, types/, lib/, design/ と
.env.example, .gitignore は消さずに残す。

やること:
- Next.js のセットアップ（App Router, TypeScript, ESLint。src ディレクトリは使わない）
- data/circles.sample.json を data/circles.json にコピーして、ビルド時に import する
- types/circle.ts の型を使う
- パスエイリアス @/ をルートに設定
- design/ はビルドに含めない（tsconfig と next config から除外）
- npm run dev が起動するところまで

画面はまだ作らないで。次のステップで移植する。
```

---

## STEP 2 — Design のUIを移植する

```
design/ksu-circles-v3.dc.html を読んで。これは Claude Design の書き出しで、
一覧と詳細の両方が1ファイルに入っている。素のHTMLではなく独自のテンプレート記法なので、
PROMPT.md の「前提」の対応表を見ながら React に移植して。

移植先:
- 一覧 → app/page.tsx
- 詳細 → app/c/[id]/page.tsx（generateStaticParams で全団体ぶん静的生成）

守ること:
- 見た目・余白・色・書体・アニメーションを1pxも変えない。移植であって作り直しではない
- HTMLに直書きされているダミーの団体データは削除して、data/circles.json から読む
- 表示の丸めは lib/gender.ts の関数を必ず通す（genderRatio / feeLabel / numLabel /
  daysLabel / timesLabel）。同じ処理を各所で書き直さない
- support.js と image-slot.js は移植後に使わない。image-slot は <img> に置き換える
- 写真は /public/photos/{filename} を参照する。読み込みに失敗したら
  ジャンル色のベタ塗りタイルにフォールバックする

データの形が Design のダミーと違う。docs/13-schema-mapping.md の通りに直して。特に:
- gender_ratio（"6:4" の文字列）→ gender: {male, female} の実数に変え、表示は genderRatio() を通す
- next_recruit（自由文）→ recruiting（バッジ）と next_recruit: {date, what} に分ける
- 代表からの一言と署名が直書きになっているので、leader_comment から読む形にする
- real フラグは削除する

最後に CLAUDE.md の「守ること」10項目を自分で確認して。
```

---

## STEP 3 — ダミーで動かす

```
npm run dev で確認して、次を直して:

- c003（こだま）… 年会費・初心者・男女比が未確認。数字カードが「—」になっているか、
  カードごと消えていないか
- c006（とりで）… 男女比が「女子のみ」と出るか
- c007（ソラリス）… active_days が空。「活動日 未確認」が30pxのまま大きく出るか
- 全団体… 写真ファイルが存在しないので、ジャンル色タイルにフォールバックするか
- 一覧… tile_size の S / M / L で大きさが変わっているか
- 一覧で曜日を絞ってから詳細を開くと、一致した曜日だけ山吹になるか
- 375px幅で横スクロールが出ないか
- ヒーローのズームイン、スクロールでシートが立ち上がる動き、写真の自動スライドが
  Design と同じか
```

ここまで通ったら `git init` してコミット。

---

## STEP 4 — Vercel に載せる

GitHub にリポジトリを作って push。Vercel でインポートするだけ。

**公開前に必ず:**
- 中身がダミー8件のうちは `noindex` を入れておく
- `preview` ブランチを作って、環境変数 `INCLUDE_UNCONFIRMED=1` を preview にだけ設定する

---

## STEP 5 — sync を作る（面談が5件たまってから）

```
docs/10-sync-spec.md と docs/13-schema-mapping.md を読んで、scripts/sync.ts を実装して。
出力する JSON は types/circle.ts の形に完全に一致させる。特に:
- 公開してよいか = OK 以外はビルドから除外する
- annual_fee の 0（無料）と null（未確認）を混同しない
- gender は実数のまま出す。比率に丸めない
- tile_size はシートの列から読む。空なら "M"
- 画像は 3:2 クロップ、WebP、幅1200と600、EXIF削除
- 冪等にする。変化がなければ書き込まない
```

**空のシートで作らせない。**実データが5〜10件入ってから渡す。
