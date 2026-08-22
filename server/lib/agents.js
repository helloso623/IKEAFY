import { cheaperAlternatives, getPart, searchParts } from "./catalog.js";
import { engineeringReport, runSuite } from "./physics.js";
import { parseGuide, expandStep, defaultGuide } from "./ikeafy.js";
import { planRoom } from "./adaptation.js";
import { sketchFromFunctions } from "./firmware.js";
import { addPiece } from "./project.js";
import { usableOpenAiKey } from "./secrets.js";

export const ROSTER = [
  {
    id: "foreman",
    name: "Foreman",
    model: "fable",
    role: "orchestration",
    blurb: "Breaks a request into jobs and hands them off.",
  },
  {
    id: "architect",
    name: "Architect",
    model: "opus",
    role: "orchestration",
    blurb: "Keeps the build IKEA-simple: modules, labels, explode views.",
  },
  {
    id: "stress",
    name: "Stress analyst",
    model: "gpt-5.6",
    role: "hard",
    blurb: "Breaking points, safety factors, tape hold.",
  },
  {
    id: "circuit",
    name: "Circuit lead",
    model: "gpt-5.6",
    role: "hard",
    blurb: "Nets, ports, isolation boards, firmware pins.",
  },
  {
    id: "lab",
    name: "Physics lab",
    model: "gpt-5.6",
    role: "hard",
    blurb: "Rain, heat, flow, aero, wave, speed.",
  },
  {
    id: "shop",
    name: "Shop grok",
    model: "grok",
    role: "easy",
    blurb: "Move, rotate, camera, rescale, retexture.",
  },
  {
    id: "scout",
    name: "Parts scout",
    model: "grok",
    role: "easy",
    blurb: "Catalog list, cost barrier, IKEA/Amazon stand-ins.",
  },
  {
    id: "assembler",
    name: "Assembler",
    model: "grok",
    role: "easy",
    blurb: "IKEAFY steps, expand, wait, spare parts.",
  },
  {
    id: "firmware",
    name: "Firmware tech",
    model: "gpt-5.6",
    role: "hard",
    blurb: "Arduino sketches as a code abstraction.",
  },
  {
    id: "stylist",
    name: "AR stylist",
    model: "grok",
    role: "easy",
    blurb: "Room photo overlay and adaptation plan.",
  },
];

const HARD_HINTS = /stress|break|aero|flow|weather|rain|heat|cold|firmware|arduino|circuit|architect|optim/i;
const IKEA_HINTS = /ikea|step|guide|spare|review|stuck|video|assemble/i;
const ROOM_HINTS = /room|photo|ar\b|adapt|measure|house|place/i;
const MOVE_HINTS = /move|rotate|camera|scale|texture|color|zoom/i;
const PART_HINTS = /add |find |cheap|cost|part|component|ikea|amazon/i;

export function routeAgent(text) {
  if (ROOM_HINTS.test(text)) return ROSTER.find((a) => a.id === "stylist");
  if (IKEA_HINTS.test(text)) return ROSTER.find((a) => a.id === "assembler");
  if (MOVE_HINTS.test(text)) return ROSTER.find((a) => a.id === "shop");
  if (PART_HINTS.test(text)) return ROSTER.find((a) => a.id === "scout");
  if (/arduino|sketch|pin|firmware/i.test(text)) return ROSTER.find((a) => a.id === "firmware");
  if (/weather|rain|heat|flow|aero|wave/i.test(text)) return ROSTER.find((a) => a.id === "lab");
  if (/stress|break|load/i.test(text)) return ROSTER.find((a) => a.id === "stress");
  if (/board|net|isolat|circuit/i.test(text)) return ROSTER.find((a) => a.id === "circuit");
  if (HARD_HINTS.test(text)) return ROSTER.find((a) => a.id === "architect");
  return ROSTER.find((a) => a.id === "foreman");
}

function localReply(message, ctx) {
  const agent = routeAgent(message);
  const actions = [];
  const lower = message.toLowerCase();
  let text = `${agent.name} (${agent.model}, local steward): `;

  const costMatch = lower.match(/\$?\s*(\d+(?:\.\d+)?)\s*(usd|dollar|budget|max)?/);
  const maxCost = costMatch ? Number(costMatch[1]) : ctx.costBarrier;

  if (agent.id === "scout" || /add |find |cheap/.test(lower)) {
    const query = lower.includes("led")
      ? "led"
      : lower.includes("table")
        ? "table"
        : lower.includes("tape")
          ? "tape"
          : "";
    const hits = searchParts({ query, maxCost: maxCost || Infinity }).slice(0, 6);
    if (/add/.test(lower) && hits[0] && ctx.project) {
      const piece = addPiece(ctx.project, hits[0].id, { x: 0.2, y: 0.26, z: 0.12 });
      actions.push({ type: "add_part", partId: hits[0].id, piece });
      text += `Dropped ${hits[0].name} (${hits[0].dimsMm.x}×${hits[0].dimsMm.y}×${hits[0].dimsMm.z} mm) on the bench.`;
    } else {
      text += `Catalog hits under ${maxCost || "any"}: ${hits.map((h) => `${h.name} $${h.cost} @ ${h.store}`).join("; ")}.`;
      actions.push({ type: "catalog", hits });
    }
  } else if (agent.id === "assembler") {
    const guide = ctx.guide || defaultGuide();
    if (/stuck|expand|help|can't|cannot/.test(lower)) {
      const step = Number((lower.match(/step\s+(\d+)/) || [])[1] || ctx.step || 1);
      const expanded = expandStep(guide, step, { stuckNote: message });
      text += expanded.step?.detail || "No step.";
      actions.push({ type: "expand_step", ...expanded });
    } else {
      const parsed = parseGuide(message);
      text += `Parsed ${parsed.steps.length} steps for ${parsed.title}. Play the film when you are ready.`;
      actions.push({ type: "ikeafy", guide: parsed });
    }
  } else if (agent.id === "stylist") {
    const plan = planRoom({
      widthM: ctx.room?.widthM || 3.2,
      depthM: ctx.room?.depthM || 3.8,
      budget: maxCost || 40,
      want: /table/.test(lower) ? "table" : "table",
    });
    text += `Adaptation plan: put ${plan.pick.name} at ${plan.ordered[0].x.toFixed(2)} m, ${plan.ordered[0].z.toFixed(2)} m. Cheaper: ${plan.cheaper.map((c) => c.name).join(", ") || "none"}.`;
    actions.push({ type: "adaptation", plan });
  } else if (agent.id === "shop") {
    actions.push({
      type: "camera",
      az: /left/.test(lower) ? 120 : /right/.test(lower) ? -20 : 42,
      el: /top|down/.test(lower) ? 70 : 28,
    });
    text += "Nudged the camera. Drag a piece to move or rotate it on the bench.";
  } else if (agent.id === "firmware") {
    const source = sketchFromFunctions(["light", "sense"]);
    text += "Wrote a Nano sketch: button on D2, LED on D13.";
    actions.push({ type: "firmware", source });
  } else if (agent.id === "stress" || agent.id === "lab") {
    const part = getPart(ctx.partId || "lack-top");
    const tape = getPart("tape-gaffer");
    const report = runSuite(part, tape, {
      forceN: 180,
      rain: /rain/.test(lower),
      tempC: /heat|hot/.test(lower) ? 60 : /cold/.test(lower) ? -5 : 22,
    });
    text += report.ok
      ? `${part.name} survives the suite.`
      : `${part.name} fails ${report.failed.join(", ")}.`;
    actions.push({ type: "sim", report });
  } else if (agent.id === "circuit") {
    text += "Treat the Nano + LED + button as one lamp board. Isolate it, then drop it on any table.";
    actions.push({ type: "isolate", label: "lamp-board" });
  } else {
    text +=
      "Foreman split this: scout the BOM, architect the explode, lab the weather, assembler the film. Say what to add or which step is stuck.";
    actions.push({ type: "route", agent: agent.id });
  }

  if (/cheap|cheaper/.test(lower) && ctx.partId) {
    actions.push({ type: "cheaper", hits: cheaperAlternatives(ctx.partId) });
  }

  return {
    agent,
    backend: "local-steward",
    text,
    actions,
  };
}

async function hostedReply(message, ctx, agent) {
  const key = usableOpenAiKey();
  if (!key) return null;
  const model =
    agent.role === "hard"
      ? process.env.OPENAI_MODEL_HARD || "gpt-4.1-mini"
      : process.env.OPENAI_MODEL_EASY || "gpt-4.1-mini";
  const body = {
    model,
    messages: [
      {
        role: "system",
        content: `You are ${agent.name} in IKEAFY, a furniture/electronics workshop. Be concrete. Never ask for secrets. Reply in under 120 words.`,
      },
      { role: "user", content: message },
    ],
  };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) return null;
  return { agent, backend: `hosted:${model}`, text, actions: [] };
}

export async function chat(message, ctx = {}) {
  const agent = routeAgent(message);
  try {
    const hosted = await hostedReply(message, ctx, agent);
    if (hosted) return hosted;
  } catch {
    // fall through to local steward — never leak key errors
  }
  return localReply(message, ctx);
}

export function hasHostedBrain() {
  return Boolean(usableOpenAiKey());
}

export function systemIssues(projectParts, options) {
  return engineeringReport(projectParts, options);
}
