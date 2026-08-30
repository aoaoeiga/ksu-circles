# design/

Claude Design の書き出しをそのまま置いてある。

- `ksu-circles-v3.dc.html` … **一覧と詳細の両方**が入った完成版
- `support.js` `image-slot.js` … Design のランタイム。移植後は使わない
- `images/` … Design に取り込んだ画像

**素のHTMLではない。**`{{ }}` `<sc-for>` `<sc-if>` `<image-slot>` という独自記法が入っていて、
そのままブラウザでは動かない。React への変換が必要（`PROMPT.md` の「前提」を見る）。

**このフォルダはビルドに含めない。**移植後も消さないこと。
「Design ではこうだった」を確認する原本になる。
