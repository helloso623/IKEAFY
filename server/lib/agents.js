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
const CATALOG_ASK =
  /\b(find|cheap|cheaper|catalog|shelf|sku|part|component|lack|linnmon|linmon|table|budget|under\s+\$?\d|amazon)\b/i;
const STEP_LOCK = /\b(step\s+\d+|i'?m stuck|spare|allen key|cam lock|guide|manual|assemble|this step)\b/i;
const ELECTRONICS_ASK =
  /arduino|nano|esp32|led|firmware|sketch|pin\b|board|circuit|usb|header|button|lamp|light|wire|cable/i;
const SMALL_QUESTION =
  /^(where|what|which|how many|do i|is the|can i|which tool|what tool|what part|included|in the box|this step|allen|screw|dowel|leg|top)\b/i;
const COMPLEX_QUESTION =
  /fix|broken|regenerate|redesign|calculate|rewrite|rebuild|why (is|does|did)|stuck for|explain how to|design a|optim/i;

function isCatalogAsk(text) {
  return CATALOG_ASK.test(text) || PART_HINTS.test(text);
}

function isElectronicsAsk(text) {
  return ELECTRONICS_ASK.test(String(text || ""));
}

function catalogNeedle(message) {
  const lower = String(message || "").toLowerCase();
  for (const token of ["led", "table", "tape", "lack", "linnmon", "linmon", "arduino", "nano", "esp32", "cable", "leg", "dowel", "screw"]) {
    if (lower.includes(token)) return token === "linmon" ? "linnmon" : token;
  }
  return lower
    .replace(/[?!.,]/g, " ")
    .replace(/\b(what|which|who|where|when|why|how|can|could|should|is|are|do|does|did|will|would|please|find|show|list|get|search|look|recommend|suggest|help|me|my|a|an|the|some|any|for|with|under|over|cheap|cheaper|best|good|about|add)\b/g, " ")
    .replace(/\$?\d+(?:\.\d+)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function shouldEscalate(message) {
  const text = String(message || "").trim();
  if (!text) return false;
  if (COMPLEX_QUESTION.test(text) || text.length > 180) return true;
  if (text.length < 110 && (SMALL_QUESTION.test(text) || IKEA_HINTS.test(text))) return false;
  return text.length > 140;
}

export function routeAgent(text) {
  const t = String(text || "");
  if (ROOM_HINTS.test(t) && !isCatalogAsk(t)) return ROSTER.find((a) => a.id === "stylist");
  if (isCatalogAsk(t) && !STEP_LOCK.test(t)) return ROSTER.find((a) => a.id === "scout");
  if (IKEA_HINTS.test(t)) return ROSTER.find((a) => a.id === "assembler");
  if (MOVE_HINTS.test(t)) return ROSTER.find((a) => a.id === "shop");
  if (/arduino|sketch|pin|firmware/i.test(t)) return ROSTER.find((a) => a.id === "firmware");
  if (/weather|rain|heat|flow|aero|wave/i.test(t)) return ROSTER.find((a) => a.id === "lab");
  if (/stress|break|load/i.test(t)) return ROSTER.find((a) => a.id === "stress");
  if (/board|net|isolat|circuit/i.test(t)) return ROSTER.find((a) => a.id === "circuit");
  if (HARD_HINTS.test(t)) return ROSTER.find((a) => a.id === "architect");
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
    const query = catalogNeedle(lower);
    let hits = searchParts({ query, maxCost: maxCost || Infinity });
    if (!isElectronicsAsk(lower)) {
      const furniture = hits.filter((h) => h.category !== "electronics" && h.category !== "cable");
      if (furniture.length) hits = furniture;
    }
    hits = hits.slice(0, 6);
    if (/add/.test(lower) && hits[0] && ctx.project) {
      const piece = addPiece(ctx.project, hits[0].id, { x: 0.2, y: 0.26, z: 0.12 });
      actions.push({ type: "add_part", partId: hits[0].id, piece });
      text += `Dropped ${hits[0].name} on the bench.`;
    } else if (!hits.length) {
      text += "Nothing on the shelf matches that. Try “table”, “lack”, or “tape”.";
      actions.push({ type: "catalog", hits: [] });
    } else {
      const cap = maxCost && Number.isFinite(Number(maxCost)) ? ` under $${maxCost}` : "";
      text += `On the shelf${cap}: ${hits.map((h) => `${h.name} · $${h.cost}${h.store ? ` at ${h.store}` : ""}`).join("; ")}.`;
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
        content: `You are ${agent.name} in IKEAFY, a furniture shop with an optional electronics bench. Be concrete. Never ask for secrets. Reply in under 120 words. If the user is asking about furniture, tables, or catalog parts, talk only about those — no Arduino, ports, firmware, or boards unless they asked about electronics.`,
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
  const escalate = shouldEscalate(message);
  if (escalate) {
    try {
      const hosted = await hostedReply(message, ctx, agent);
      if (hosted) return { ...hosted, escalated: true, from: "gliner-2-standin" };
    } catch {
      // fall through to local steward — never leak key errors
    }
  }
  const local = localReply(message, ctx);
  const ikeaSmall = !escalate && (agent.id === "assembler" || IKEA_HINTS.test(message));
  if (ikeaSmall) return { ...local, backend: "gliner-2-standin", escalated: false };
  return local;
}

export function hasHostedBrain() {
  return Boolean(usableOpenAiKey());
}

export function systemIssues(projectParts, options) {
  return engineeringReport(projectParts, options);
}
