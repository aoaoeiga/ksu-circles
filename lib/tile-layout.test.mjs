import assert from "node:assert/strict";
import test from "node:test";
import { tileShapeForId } from "./tile-layout.ts";

test("団体IDからタイルサイズを決定論的に決める", () => {
  assert.equal(tileShapeForId("c054"), "large");
  assert.equal(tileShapeForId("c056"), "wide");
  assert.equal(tileShapeForId("c058"), "square");
  assert.equal(tileShapeForId("c054"), tileShapeForId("c054"));
});
