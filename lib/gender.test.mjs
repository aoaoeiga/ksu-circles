import assert from "node:assert/strict";
import test from "node:test";
import { genderRatio } from "./gender.ts";

test("genderRatio は男子割合の境界を合計10の比率へ丸める", () => {
  assert.equal(genderRatio(0), "女子のみ");
  assert.equal(genderRatio(1), "1 : 9");
  assert.equal(genderRatio(50), "5 : 5");
  assert.equal(genderRatio(99), "9 : 1");
  assert.equal(genderRatio(100), "男子のみ");
  assert.equal(genderRatio(null), null);
});
