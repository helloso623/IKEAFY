import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildsMatch, runtimeBuild } from "../runtime-build.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("runtime build identifies this checkout", () => {
  const build = runtimeBuild(root);
  assert.equal(build.version, "0.1.0");
  assert.match(build.revision, /^[0-9a-f]{40}$/);
  assert.equal(build.id, `${build.version}@${build.revision.slice(0, 12)}`);
});

test("runtime matching rejects missing and stale server metadata", () => {
  const current = { version: "0.1.0", revision: "a".repeat(40), id: `0.1.0@${"a".repeat(12)}` };
  assert.equal(buildsMatch(current, { ...current }), true);
  assert.equal(buildsMatch(current, null), false);
  assert.equal(buildsMatch(current, { ...current, revision: "b".repeat(40) }), false);
  assert.equal(buildsMatch(current, { ...current, version: "0.2.0" }), false);
});
