# 京産大サークル名鑑

京都産業大学の課外活動団体 約158件を、同じ項目で横断して比べられるサイト。

## 使い方

1. `PROMPT.md` を開く
2. STEP 1 のプロンプトを Claude Code に貼る
3. 以降 STEP 5 まで順番に

## この箱に入っているもの

| 場所 | 中身 |
|---|---|
| `CLAUDE.md` | Claude Code が毎回読む規約。守ること10項目 |
| `PROMPT.md` | STEP 1〜5 の貼り付け用プロンプト |
| `docs/01-requirements.md` | 要件定義。判断に迷ったらここに戻る |
| `docs/12-deploy-spec.md` | 公開までの構成 |
| `docs/10-sync-spec.md` | シート→JSONの同期と、配置済み写真の走査仕様 |
| `docs/ui/` | UIの仕様書（Claude Design 用。**実装済みの根拠**） |
| `docs/ops/` | Googleフォームの設問と生成スクリプト |
| `data/circles.sample.json` | ダミー8団体。実在団体名は使っていない |
| `types/circle.ts` | 掲載データの型 |
| `lib/gender.ts` | 男女比の丸め・年会費・未確認表示の共通関数 |
| `design/` | Claude Design の書き出し（**取り込み済み**）。素のHTMLではないので STEP 2 で変換する |
| `docs/13-schema-mapping.md` | Design のダミーと本番データの形の違い。移植時に必読 |

## 運用

```
Googleフォーム（面談中に自分で入力）
   ↓ 回答
スプレッドシート
   ├─ 掲載データ タブ（掲載本文・公開可否など）
   └─ 団体マスタ（K列「大分類」）
   ↓ npm run sync（2タブを読む＋public/photosを走査）
data/circles.json
   ＋ public/photos（手元で変換して配置）
   ↓ git push
Vercel が自動で公開
```

`circles.json` を手で直さない。掲載内容を直すのはシート側。写真は変換済みファイルを `public/photos` に置く。
