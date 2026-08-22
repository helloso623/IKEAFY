/**
 * IKEA spare fittings.
 *
 * IKEA hands out assembly fittings — screws, cam locks, dowels, shelf pins,
 * plugs, Allen keys — free of charge, either from the spare-parts desk in store
 * or through the customer-service form. Whole components (a panel, a door, a
 * glass shelf) are normally a paid replacement unless the piece arrived damaged
 * or is inside its warranty. This module encodes that split so the studio can
 * tell the user which of the two they are actually asking for.
 *
 * Article numbers below are the fitting numbers printed on IKEA parts-list
 * pages. Always check them against the sheet in your own box: IKEA revises
 * fittings between product generations.
 */

const FITTINGS = [
  {
    articleNumber: "100347",
    name: "Screw",
    kind: "screw",
    free: true,
    matches: /screw|fasten|m6|bolt|leg into|tighten/i,
    partIds: ["m6-screw"],
  },
  {
    articleNumber: "101350",
    name: "Nail",
    kind: "nail",
    free: true,
    matches: /nail|hardboard back|back panel/i,
    partIds: [],
  },
  {
    articleNumber: "109041",
    name: "Wooden dowel",
    kind: "dowel",
    free: true,
    matches: /dowel|peg/i,
    partIds: ["dowel-18"],
  },
  {
    articleNumber: "114661",
    name: "Shelf pin",
    kind: "pin",
    free: true,
    matches: /shelf pin|shelf support|shelf bracket/i,
    partIds: [],
  },
  {
    articleNumber: "118331",
    name: "Cam lock nut",
    kind: "cam-lock",
    free: true,
    matches: /cam lock|cam nut|locking nut/i,
    partIds: [],
  },
  {
    articleNumber: "121714",
    name: "Allen key",
    kind: "tool",
    free: true,
    matches: /allen|hex key/i,
    partIds: ["allen-key"],
  },
  {
    articleNumber: "326723",
    name: "Wall fixing / tip-over restraint",
    kind: "safety",
    free: true,
    matches: /wall fixing|wall anchor|tip[- ]over|secure to the wall/i,
    partIds: [],
  },
  {
    articleNumber: "118331-FOOT",
    name: "Plastic foot / floor glide",
    kind: "foot",
    free: true,
    matches: /foot|glide|felt pad|wobble/i,
    partIds: [],
  },
];

/** Components IKEA charges for: the flat panels and legs, not the bag of fittings. */
const CHARGEABLE_CATEGORIES = new Set(["furniture", "electronics", "printable"]);

export const SPARES_POLICY = {
  free:
    "Assembly fittings (screws, nails, dowels, cam locks, shelf pins, plugs, Allen keys, wall fixings) are supplied free of charge.",
  paid:
    "Whole components — table tops, legs, panels, doors, glass — are a paid replacement unless the part arrived damaged or is still inside its guarantee.",
  channels: [
    {
      id: "web",
      name: "IKEA customer service form",
      url: "https://www.ikea.com/us/en/customer-service/",
      note: "Give the product article number and the fitting number from the parts list.",
    },
    {
      id: "store",
      name: "Spare parts desk in store",
      url: "https://www.ikea.com/us/en/stores/",
      note: "Bring the fitting or a photo of it. Staff match it against the parts drawer.",
    },
  ],
  caveat: "Policy wording differs by market — this is the common IKEA practice, not a guarantee.",
};

export function listFreeFittings() {
  return FITTINGS.filter((f) => f.free).map(({ matches, ...rest }) => ({ ...rest }));
}

export function getFitting(articleNumber) {
  const hit = FITTINGS.find((f) => f.articleNumber === String(articleNumber));
  if (!hit) return null;
  const { matches, ...rest } = hit;
  return { ...rest };
}

/** Which free fittings a guide step plausibly consumes. */
export function fittingsForStep(step) {
  if (!step) return [];
  const haystack = [step.body, step.title, step.action, step.toolRequired, ...(step.warnings || [])]
    .filter(Boolean)
    .join(" ");
  const partIds = [...(step.partsUsed || []), ...(step.parts || [])].filter((p) => typeof p === "string");
  const hits = FITTINGS.filter(
    (f) => f.matches.test(haystack) || f.partIds.some((id) => partIds.includes(id)),
  );
  return hits.map(({ matches, ...rest }) => ({ ...rest }));
}

/**
 * Is what the user is asking for a free fitting or a paid component?
 * Free wins on an explicit fitting article number or a fitting-shaped word.
 */
export function classifySpare({ articleNumber, note = "", part = null, fittingKind } = {}) {
  const byNumber = articleNumber ? getFitting(articleNumber) : null;
  if (byNumber) {
    return { free: true, fitting: byNumber, reason: SPARES_POLICY.free, kind: byNumber.kind };
  }
  if (fittingKind) {
    const byKind = FITTINGS.find((f) => f.kind === fittingKind);
    if (byKind) {
      const { matches, ...rest } = byKind;
      return { free: true, fitting: rest, reason: SPARES_POLICY.free, kind: rest.kind };
    }
  }
  const byWords = FITTINGS.find((f) => f.matches.test(String(note)));
  if (byWords && !CHARGEABLE_CATEGORIES.has(part?.category)) {
    const { matches, ...rest } = byWords;
    return { free: true, fitting: rest, reason: SPARES_POLICY.free, kind: rest.kind };
  }
  if (part && CHARGEABLE_CATEGORIES.has(part.category)) {
    return {
      free: false,
      fitting: null,
      reason: SPARES_POLICY.paid,
      kind: "component",
      cost: Number(part.cost || 0),
    };
  }
  return {
    free: false,
    fitting: null,
    reason: "Could not tell whether this is a fitting or a whole component. Send a photo and let staff decide.",
    kind: "unknown",
  };
}

let requestSeq = 0;
const requests = new Map();

/**
 * Build (and remember) a free-fittings request. Nothing is sent anywhere: this
 * produces the exact article numbers, the channel to use and a ready-to-paste
 * message, because IKEA has no public spare-parts API to post to.
 */
export function freeFittingsRequest({
  productName = "",
  productArticle = "",
  fittings = [],
  stepNumber = null,
  note = "",
  photoName = "",
  contact = {},
} = {}) {
  const wanted = fittings
    .map((f) => {
      if (typeof f === "string") return { ...(getFitting(f) || {}), articleNumber: f, qty: 1 };
      const known = getFitting(f.articleNumber) || {};
      return { ...known, ...f, qty: Math.max(1, Number(f.qty) || 1) };
    })
    .filter((f) => f.articleNumber);

  const free = wanted.filter((f) => f.free !== false);
  const paid = wanted.filter((f) => f.free === false);
  const channel = photoName || !free.length ? SPARES_POLICY.channels[1] : SPARES_POLICY.channels[0];

  const request = {
    id: `spare-${++requestSeq}`,
    createdAt: Date.now(),
    status: "drafted",
    productName,
    productArticle,
    stepNumber,
    note,
    photoName: photoName || null,
    contact: { name: contact.name || "", email: contact.email || "", country: contact.country || "" },
    fittings: free,
    chargeable: paid,
    cost: 0,
    free: free.length > 0,
    channel,
    policy: SPARES_POLICY,
    message: draftMessage({ productName, productArticle, stepNumber, note, photoName, free, paid }),
    sent: false,
    sentNote: "IKEAFY drafts the request. There is no public spare-parts API — you send it yourself.",
  };
  requests.set(request.id, request);
  return request;
}

function draftMessage({ productName, productArticle, stepNumber, note, photoName, free, paid }) {
  return [
    "Hello IKEA Customer Service,",
    "",
    `I am assembling ${productName || "an IKEA product"}${productArticle ? ` (article ${productArticle})` : ""}${
      stepNumber ? ` and I am at step ${stepNumber} of the instruction` : ""
    }.`,
    free.length
      ? `Could you send the following fitting${free.length > 1 ? "s" : ""} free of charge:`
      : "I need help identifying a part:",
    ...free.map((f) => `  • ${f.qty}× ${f.name || "fitting"} — article ${f.articleNumber}`),
    note ? `\nWhat happened: ${note}` : "",
    photoName ? `Photo attached: ${photoName}` : "",
    paid.length
      ? `\nI understand the following is a chargeable component, not a fitting: ${paid
          .map((p) => p.name || p.articleNumber)
          .join(", ")}.`
      : "",
    "",
    "Thank you.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function getRequest(id) {
  return requests.get(id) || null;
}

export function listRequests() {
  return [...requests.values()];
}

export function resetRequests() {
  requests.clear();
  requestSeq = 0;
}
