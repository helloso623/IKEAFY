import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { apiRoot } from "../client/src/api.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("apiRoot points Electron file pages at their requested local server port", () => {
  assert.equal(
    apiRoot({ protocol: "file:", search: "?apiPort=9123" }),
    "http://127.0.0.1:9123",
  );
  assert.equal(apiRoot({ protocol: "https:", search: "" }), "");
});

test("chat client and server support the canonical and compatibility routes", () => {
  const client = readFileSync(path.join(root, "client/src/api.js"), "utf8");
  const server = readFileSync(path.join(root, "server/index.js"), "utf8");
  assert.match(client, /post\("\/api\/chat"/);
  assert.match(client, /post\("\/api\/agents\/chat"/);
  assert.match(server, /\["\/api\/chat", "\/api\/agents\/chat"\]/);
});
