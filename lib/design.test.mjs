import assert from "node:assert/strict";
import test from "node:test";
import { photoBgSrc, photoSrc, photoSrcSet } from "./design.ts";

test("photoSrc: public/circles の写真は縮小版を、アイコンと元は元のパスを返す", () => {
  assert.equal(photoSrc("/circles/c056/01.webp"), "/circles/c056/01.webp");
  assert.equal(photoSrc("/circles/c056/01.webp", "thumb"), "/circles/c056/01@600.webp");
  assert.equal(photoSrc("/circles/c056/01.webp", "large"), "/circles/c056/01@1200.webp");
  // アイコンには縮小版を作っていない
  assert.equal(photoSrc("/circles/c053/icon.webp", "thumb"), "/circles/c053/icon.webp");
  // 旧来の public/photos（ファイル名だけ）
  assert.equal(photoSrc("c901-1.webp", "thumb"), "/photos/c901-1@600.webp");
  assert.equal(photoSrc("c901-icon.webp", "thumb"), "/photos/c901-icon.webp");
});

test("photoSrcSet / photoBgSrc: 縮小版がある写真だけ", () => {
  assert.equal(
    photoSrcSet("/circles/c054/03.webp"),
    "/circles/c054/03@600.webp 600w, /circles/c054/03@1200.webp 1200w, /circles/c054/03.webp 1600w"
  );
  assert.equal(photoSrcSet("/circles/c053/icon.webp"), undefined);
  assert.equal(photoSrcSet("c901-1.webp"), undefined);
  assert.equal(photoBgSrc("/circles/c054/03.webp"), "/circles/c054/03@bg.webp");
  assert.equal(photoBgSrc("/circles/c053/icon.webp"), null);
});
