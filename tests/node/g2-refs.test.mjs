import assert from "node:assert/strict";
import { test } from "node:test";
import { g2InitialRef } from "../../lib/project-agent/runtime/browser-agent/g2-refs.mjs";
test("old snapshot references cannot collide with next browser epoch", () => {
  assert.equal(g2InitialRef(undefined), 1);
  assert.equal(g2InitialRef(1), 1_000_001);
  assert.equal(g2InitialRef(2), 2_000_001);
  const old = `e${g2InitialRef(1)}`, fresh = `e${g2InitialRef(2)}`;
  assert.notEqual(old, fresh);
  assert.match(old, /^e\d+$/);
  assert.match(fresh, /^e\d+$/);
});
test("invalid lease epochs fail closed", () => {
  for (const value of [0, -1, 1.5, NaN, 1_000_000])
    assert.throws(() => g2InitialRef(value), /Invalid G2/);
});
