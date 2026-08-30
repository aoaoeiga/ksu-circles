# Next.js 16 の作法メモ

作成: 2026/08/30
なぜ要るか: **このプロジェクトは Next.js 16.3.3 で動いている。**14〜15 の書き方が通らない箇所があり、
そのうちいくつかは「dev では動くが build で落ちる」「dev では動くが CLAUDE.md §8 を破っている」という形で出る。
STEP 2 の移植で踏む順に並べた。

出典は `node_modules/next/dist/docs/`（Next が同梱しているドキュメント）。
バージョンを上げたら、このファイルも読み直して直す。

---

## 0. 最初に効く3つ

| これ | どうなる |
|---|---|
| `params` は Promise | `await` しないと型が通らない |
| `searchParams` を page で読む | **ページが動的レンダリングになる。CLAUDE.md §8 違反** |
| `useSearchParams()` を Suspense なしで使う | **dev は通り、`next build` が落ちる** |

下の2つが厄介で、**どちらも `npm run dev` では気づけない。**一覧の絞り込み（要件定義 §6-1）を作るときに必ず当たる。

---

## 1. `params` は Promise

15 では同期アクセスの互換が残っていたが、**16 で完全に削除された。**
`layout.js` `page.js` `route.js` `default.js` `opengraph-image` `icon` すべてで Promise になる。
`cookies()` `headers()` `draftMode()` も同じ（このプロジェクトでは使わない）。

```tsx
// app/c/[id]/page.tsx
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ...
}
```

### 1-1. 型は自分で書かずに `PageProps` を使う

`next typegen`（`next dev` / `next build` でも走る）が `.next/types/routes.d.ts` を生成し、
**グローバルな `PageProps` / `LayoutProps` が使えるようになる。**ルート文字列から `params` の形が決まるので、
`{ id: string }` を手で書くより安全。

```tsx
export default async function Page(props: PageProps<'/c/[id]'>) {
  const { id } = await props.params;   // id: string と推論される
}
```

生成物の中身（実際に確認した形）:

```ts
interface PageProps<AppRoute extends AppRoutes> {
  params: Promise<ParamMap[AppRoute]>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}
```

**注意: `.next/` は gitignore してある。**クリーンな環境で `tsc --noEmit` だけを回すと
`PageProps` が見つからずに落ちる。型チェックの前に `next typegen` を通すこと。

```bash
npx next typegen && npx tsc --noEmit
```

### 1-2. OGP と sitemap も Promise

`opengraph-image.tsx` は deploy-spec §6 で作ることになっている。**16 では `params` も `id` も Promise。**

```tsx
// app/c/[id]/opengraph-image.tsx
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}
```

ただし `generateImageMetadata` と `generateSitemaps` が受け取る `params` は**同期のまま**。
生成関数側だけが Promise になった。ここは非対称なので間違えやすい。

---

## 2. 絞り込みをURLに反映する方法 ★ここが一番の罠

要件定義 §6-1 は「絞り込み結果はURLに反映する（共有できること）」。
一方 CLAUDE.md §8 は「静的生成のみ。SSR を作らない」。**この2つは両立するが、書き方を1つ間違えると壊れる。**

### やってはいけない: `page.tsx` の `searchParams` を読む

Next のドキュメントにこう書いてある。

> `searchParams` is a Request-time API whose values cannot be known ahead of time.
> Using it will opt the page into **dynamic rendering** at request time.

つまり `app/page.tsx` で `searchParams` を受け取った瞬間、**一覧ページが静的でなくなる。**
ビルドは成功するので気づかない。`next build` の出力で `/` が `○ (Static)` から変わっていたら、これを踏んでいる。

### 正しいやり方: クライアント側で `useSearchParams()` + Suspense

一覧の158件は全部ビルド時にHTMLへ吐いて、**絞り込みはブラウザ側でやる。**
URL の読み書きはクライアントコンポーネントに閉じ込める。

```tsx
// app/page.tsx （サーバー、静的のまま）
import { Suspense } from "react";

export default function Home() {
  return (
    <Suspense fallback={<CircleList circles={circles} />}>
      <FilterableList circles={circles} />   {/* "use client" 側 */}
    </Suspense>
  );
}
```

**Suspense で包むのは必須。**ドキュメントの原文:

> During production builds, a static page that calls `useSearchParams` from a Client Component
> must be wrapped in a `Suspense` boundary, otherwise the build fails.
>
> In development, routes are rendered on-demand, so `useSearchParams` doesn't suspend and
> things may appear to work without `Suspense`.

**`npm run dev` では通って `npm run build` で落ちる。**この順で作業すると必ず一度は踏む。

`fallback` には「絞り込み前の全件」を渡す。空にすると、JSが効く前の一瞬が空白になるうえ、
検索エンジンとOGPクローラに空のページを見せることになる。

### URL の更新

`router.push()` を絞り込みのたびに呼ぶと履歴が汚れて戻るボタンが壊れる。
`window.history.replaceState` で書き換えて、履歴は残さない。

---

## 3. Turbopack が既定

16 から `next dev` も `next build` も Turbopack で動く。`next.config.ts` に webpack の設定は書かない。
このプロジェクトは素の構成なので、いまのところ影響はない。

**`next build` の出力から `size` と `First Load JS` の欄が消えた。**バンドルサイズはビルドログで測れない。
Lighthouse 90以上（要件定義 §7）は実測で確認する。

---

## 4. `next lint` は削除された

`next lint` コマンドが無くなり、**`next build` は lint を走らせない。**
`next.config.ts` の `eslint` オプションも削除された。

`package.json` の `lint` は eslint を直接叩いている。ビルドが通っても lint は別に回すこと。

```bash
npm run lint
```

設定は `eslint.config.mjs`（フラット設定）。16 の `eslint-config-next` は
`eslint-config-next/core-web-vitals` と `eslint-config-next/typescript` をフラット設定として直接 export する。
**`FlatCompat` で包むと `Converting circular structure to JSON` で落ちる。**（実際に踏んだ）

---

## 5. 画像

deploy-spec §4 の通り `images.unoptimized: true` を設定済み。sync が変換済みなので二重処理しない。

16 で変わった点のうち、関係あるもの:

- **ローカル画像にクエリ文字列を付けると `images.localPatterns.search` の設定が要る。**
  `/photos/c001-1.webp?v=2` のようなキャッシュ避けを付けたくなったら、設定も足すこと。付けないのが早い
- `next/legacy/image` は非推奨。使わない
- `images.domains` は非推奨（`remotePatterns` へ）。外部画像を使わないので関係ない

`width` / `height` の指定漏れは 16 でも同じくレイアウトシフトになる。**3:2 固定なので `1200 / 800`。**

---

## 6. View Transitions（S-02 のズームイン）

要件定義 §6-2 の「一覧のカードを押すと、その写真が拡大して全画面になる」は、
React の `<ViewTransition>` で書ける。**16 では設定不要。**App Router は React canary を同梱していて、
`react@canary` を自分で入れる必要はない。

```tsx
import { ViewTransition } from "react";

// 一覧のタイル側
<Link href={`/c/${c.id}`}>
  <ViewTransition name={`photo-${c.id}`}>
    <img src={...} />
  </ViewTransition>
</Link>

// 詳細のヒーロー側 — 同じ name を付ける
<ViewTransition name={`photo-${c.id}`}>
  <img src={...} />
</ViewTransition>
```

`<ViewTransition>` はトランジション・`<Suspense>`・`useDeferredValue` でしか発火しない。
ただし**Next のルート遷移はトランジションなので、ナビゲーションでは自動的に効く。**
普通の `setState` では発火しない。

- 対応は Chromium 125+ と最近の Safari / Firefox。**未対応ブラウザでは単にアニメーションしないだけで、動作は壊れない**
- `prefers-reduced-motion` の対応は要件定義 §7 で必須。CSS 側で切る

```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) { animation: none !important; }
}
```

---

## 7. スクロール挙動

16 から、**Next はナビゲーション時に `scroll-behavior` を上書きしなくなった。**

`html { scroll-behavior: smooth }` を書くと、ページ遷移でもスムーススクロールが効いてしまう。
15 までの「遷移は即座、ページ内リンクだけスムース」に戻したいときは `<html>` に属性を足す。

```tsx
<html lang="ja" data-scroll-behavior="smooth">
```

S-02 は「スクロールすると写真が沈んでシートが立ち上がる」（要件定義 §6-2）ので、
移植したCSSに `scroll-behavior` が入っていたらここを確認する。

---

## 8. 存在しないIDを404にする

deploy-spec §2 の「存在しないIDは404」。`generateStaticParams` だけでは足りない。
既定の `dynamicParams` は `true` で、**列挙していないIDはリクエスト時に生成しようとする**（＝SSR）。

`page.tsx` で明示的に切る。

```tsx
export const dynamicParams = false;   // 列挙外のIDは404
```

これで CLAUDE.md §8（SSRを作らない）と deploy-spec §2 の両方を機械的に満たす。

---

## 9. このプロジェクトでは関係ないが、見かけたら

16 の変更のうち、いま触らないもの。**書いてあるのを見ても導入しないこと。**

| 変更 | 扱い |
|---|---|
| `middleware.ts` → `proxy.ts` に改名 | どちらも作らない（静的生成のみ） |
| Cache Components / PPR / `use cache` | サーバーを持たないので不要 |
| `revalidateTag` / `updateTag` / `refresh` | ISR を使わない |
| React Compiler（stable 化） | 既定オフ。速度が問題になってから考える |
| `serverRuntimeConfig` / `publicRuntimeConfig` | 削除済み。環境変数を使う（`.env.example`） |
| AMP サポート | 削除済み |

---

## 10. 設定したもの（`next.config.ts`）

| 設定 | 理由 |
|---|---|
| `images.unoptimized: true` | sync が変換済み。二重処理しない（deploy-spec §4） |
| `outputFileTracingExcludes` | `design/` `docs/` をビルドのファイルトレースに含めない |
| `agentRules: false` | **`next dev` が `CLAUDE.md` にブロックを追記するのを止める。**CLAUDE.md は手で管理する |

`agentRules` は 16 の新機能で既定 `true`。オフにした代わりが、このファイル。

`output: 'export'` は**設定していない。**`generateStaticParams` と §8 の `dynamicParams = false` で
静的生成は満たせるし、`export` にすると `opengraph-image.tsx` / `robots.ts` / `sitemap.ts`（deploy-spec §6）の
自由度が下がるため。**静的であることの担保は `next build` の出力で `○ (Static)` を確認する運用にする。**
