import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { apiRoot } from "../client/src/api.js";
import { chat } from "../server/lib/agents.js";
import { emptyProject } from "../server/lib/project.js";

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
  assert.match(server, /app\.post\("\/api\/chat", handleChat\)/);
  assert.match(server, /app\.post\("\/api\/agents\/chat", handleChat\)/);
  assert.match(server, /fallbackChat\(/);
});

test("scan video proxy is a local same-origin fetch, not a paid model", () => {
  const server = readFileSync(path.join(root, "server/index.js"), "utf8");
  const api = readFileSync(path.join(root, "client/src/api.js"), "utf8");
  assert.match(server, /\/api\/scan\/video/);
  assert.match(server, /\/api\/phone\/room-video/);
  assert.match(server, /SCAN_VIDEO_MAX_BYTES/);
  assert.match(server, /app\.post\("\/api\/scan\/video"/);
  assert.match(server, /app\.post\("\/api\/phone\/room-video"/);
  assert.match(api, /scanVideoUrl/);
  assert.match(api, /scanVideoPost/);
  assert.match(api, /roomVideoMeta/);
  assert.match(api, /roomVideoFile/);
});

async function waitForHealth(url, timeoutMs = 20_000) {
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = String(error?.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`server did not start: ${lastError}`);
}

async function finishModel(base, model = []) {
  const response = await fetch(`${base}/api/project/finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
  assert.equal(response.status, 202);
  const started = await response.json();
  assert.equal(started.job.status, "queued");
  assert.match(started.job.text, /Reading the model/i);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const update = await (await fetch(`${base}/api/project/finish/${started.job.id}`)).json();
    if (update.job.status === "complete") return { started, update, packet: update.result };
    if (update.job.status === "failed") assert.fail(update.reason || update.job.text);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("finish job did not complete");
}

test("finish starts a progress job, scores the current model, and preserves prior plans", async (t) => {
  const port = 20500 + (process.pid % 400);
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), OPENAI_API_KEY: "", TAVILY_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  const base = `http://127.0.0.1:${port}`;
  await waitForHealth(`${base}/api/health`);

  const added = await fetch(`${base}/api/project/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partId: "generic-side-table" }),
  });
  assert.equal(added.status, 200);
  const addedPiece = await added.json();

  const first = await finishModel(base);
  const packet = first.packet;
  assert.equal(packet.ok, true);
  assert.equal(packet.pdf.method, "client-print");
  assert.match(packet.bom.scope, /geometry-derived.*pieces/);
  assert.equal(packet.bom.ikeaMatch.article, "304.499.08");
  assert.ok(packet.bom.ways.length >= 2);
  assert.deepEqual(packet.bom.cutList.map((line) => line.role), ["top", "leg"]);
  assert.ok(packet.bom.hardwareLines.some((line) => /mounting plate/i.test(line.name)));
  assert.ok(packet.bom.hardwareLines.some((line) => /screw/i.test(line.name)));
  assert.ok(packet.bom.similarityScore >= 90);
  assert.ok(packet.bom.ways.every((way) => Number.isFinite(way.similarity.score)));
  const progressText = first.update.job.events.map((event) => event.text);
  assert.ok(progressText.includes("Reading the model…"));
  assert.ok(progressText.includes("Matching boards, hardware, and construction…"));
  assert.ok(progressText.includes("Scoring look-alikes…"));
  assert.ok(progressText.includes("Writing the IKEAlive plan…"));
  assert.match(progressText.at(-1), /Ready.*closest physical match/);
  assert.deepEqual(
    first.update.job.events.map((event) => event.percent),
    [...first.update.job.events.map((event) => event.percent)].sort((a, b) => a - b),
  );
  assert.equal(packet.assembly.ok, true);
  assert.ok(packet.assembly.run.id);
  assert.ok(packet.assembly.outline.length >= 5);

  const liveModel = {
    id: "mesh-only",
    name: "Edited mesh table",
    shape: "generated-mesh",
    dimsMm: { x: 1200, y: 600, z: 740 },
    poseM: { x: 0, y: 0.37, z: 0 },
    geometryAnalysis: { geometryFingerprint: "mesh-live-a", silhouette: "rectilinear" },
  };
  const diy = await fetch(`${base}/api/project/diy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: [liveModel] }),
  });
  assert.equal(diy.status, 200);
  const live = await diy.json();
  assert.ok(live.bom.hardwareLines.length);
  assert.ok(live.bom.components.some((component) => component.pieceId === "mesh-only"));

  const moved = await fetch(`${base}/api/project/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: addedPiece.id, sx: 1.2 }),
  });
  assert.equal(moved.status, 200);
  const changed = (await finishModel(base)).packet;
  assert.notEqual(changed.bom.modelSignature, packet.bom.modelSignature);
  assert.equal(changed.bom.ikeaMatch, null);
  assert.ok(changed.bom.ways.some((way) => way.additionalPieces?.some((line) => line.role === "apron")));
  const project = await (await fetch(`${base}/api/project`)).json();
  assert.equal(project.diyHistory.length, 2);
});

test("POST /api/chat generates a room scene through one editable mesh action", async (t) => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  t.after(() => {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  });

  const port = 21000 + (process.pid % 1000);
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), OPENAI_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    child.kill("SIGTERM");
  });
  await waitForHealth(`http://127.0.0.1:${port}/api/health`);

  for (const route of ["/api/chat", "/api/agents/chat"]) {
    const res = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "generate a 4.8 x 3.6 m warm living room corner with a table",
      }),
    });
    assert.equal(res.status, 200, `${route} should accept POST`);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.backend, "local-steward");
    assert.equal(body.actions.length, 1);
    assert.equal(body.actions[0].type, "mesh");
    assert.equal(body.actions[0].mesh.kind, "scene");
    assert.ok(body.actions[0].mesh.components.some((component) => component.name === "Floor"));
    assert.ok(body.actions[0].mesh.components.some((component) => /Tabletop/.test(component.name)));
    assert.equal(body.actions[0].partId, undefined);
  }
});

test("chat() itself generates room prompts as editable scene geometry", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const reply = await chat("generate a 4.8 x 3.6 m warm living room corner with a table", {
      project: emptyProject(),
    });
    assert.equal(reply.backend, "local-steward");
    assert.equal(reply.actions.length, 1);
    assert.equal(reply.actions[0].type, "mesh");
    assert.equal(reply.actions[0].mesh.kind, "scene");
    assert.equal(reply.actions[0].partId, undefined);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test("HTTP chat emits table, stool, and shelf meshes for the bench", async (t) => {
  const port = 22000 + (process.pid % 1000);
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), OPENAI_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  const base = `http://127.0.0.1:${port}`;
  await waitForHealth(`${base}/api/health`);

  const catalog = await (await fetch(`${base}/api/catalog`)).json();
  assert.ok(catalog.some((part) => part.id === "generic-side-table"));
  assert.ok(catalog.some((part) => part.id === "generic-stool"));
  assert.ok(catalog.some((part) => part.id === "generic-shelf-board"));

  const cases = [
    ["make a side table", "table", 5],
    ["make a stool", "stool", 5],
    ["make a shelf", "shelf", 3],
  ];
  for (const [message, kind, bodyCount] of cases) {
    const seeded = await fetch(`${base}/api/project/seed`, { method: "POST" });
    assert.equal(seeded.status, 200);
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    assert.equal(response.status, 200);
    const reply = await response.json();
    assert.equal(reply.ok, true);
    const mesh = reply.actions.find((action) => action.type === "mesh");
    assert.equal(mesh.mesh.kind, kind);
    assert.equal(mesh.mesh.components.length, bodyCount);
    assert.equal(reply.actions.some((action) => action.type === "add"), false);
    const project = await (await fetch(`${base}/api/project`)).json();
    assert.deepEqual(project.pieces, []);
  }

  await fetch(`${base}/api/project/seed`, { method: "POST" });
  const added = await fetch(`${base}/api/project/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partId: "generic-stool", pose: { x: 0.2 } }),
  });
  assert.equal(added.status, 200);
  assert.equal((await added.json()).partId, "generic-stool");

  const workshop = readFileSync(path.join(root, "client/src/workshop.js"), "utf8");
  assert.match(workshop, /shape === "bracket"/);
});

test("POST /api/scan/video stores frames and GET returns the inbox", async (t) => {
  const port = 23000 + (process.pid % 1000);
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), OPENAI_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  const base = `http://127.0.0.1:${port}`;
  await waitForHealth(`${base}/api/health`);

  const empty = await fetch(`${base}/api/scan/video`);
  assert.equal(empty.status, 404);

  const pixel =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const posted = await fetch(`${base}/api/scan/video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      frames: [
        { name: "front.png", mime: "image/png", data: pixel },
        { name: "side.png", mime: "image/png", data: pixel },
        { name: "top.png", mime: "image/png", data: pixel },
      ],
    }),
  });
  assert.equal(posted.status, 200);
  const stored = await posted.json();
  assert.equal(stored.ok, true);
  assert.equal(stored.kind, "frames");
  assert.equal(stored.count, 3);

  const inbox = await fetch(`${base}/api/scan/video`);
  assert.equal(inbox.status, 200);
  const body = await inbox.json();
  assert.equal(body.kind, "frames");
  assert.equal(body.frames.length, 3);

  const raw = await fetch(`${base}/api/scan/video`, {
    method: "POST",
    headers: { "Content-Type": "video/mp4" },
    body: Buffer.from("ftypisom"),
  });
  assert.equal(raw.status, 200);
  assert.equal((await raw.json()).kind, "video");
});
