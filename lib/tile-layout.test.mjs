import assert from "node:assert/strict";
import test from "node:test";
import { shuffledIds, tileShapeForId } from "./tile-layout.ts";

test("団体IDからタイルサイズを決定論的に決める", () => {
  assert.equal(tileShapeForId("c054"), "large");
  assert.equal(tileShapeForId("c056"), "wide");
  assert.equal(tileShapeForId("c058"), "square");
  assert.equal(tileShapeForId("c054"), tileShapeForId("c054"));
});

test("shuffledIds は同じ団体を1回ずつ含み、元の配列を変えない", () => {
  const ids = ["c001", "c002", "c003", "c004", "c005"];
  const out = shuffledIds(ids, () => 0);
  assert.deepEqual(ids, ["c001", "c002", "c003", "c004", "c005"]);
  assert.deepEqual([...out].sort(), ids);
  assert.notDeepEqual(out, ids);
});
