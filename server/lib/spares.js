import { getPart, listParts } from "./catalog.js";

const IKEA_SERVICE = "ikea.com/customer-service";
const IKEA_PARTS = listParts().filter(
  (part) =>
    part.store === "IKEA" ||
    /ikea/i.test(part.brand || "") ||
    (part.includedIn || []).some((kit) => /ikea|lack/i.test(kit)),
);

function normalizeArticleNumber(value) {
  const match = String(value || "").match(/\b(\d{3})[.\s-]?(\d{3})[.\s-]?(\d{2})\b/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

function catalogPart(value) {
  const needle = String(value || "").trim().toLowerCase();
  if (!needle) return null;

  const direct = getPart(needle);
  if (direct && IKEA_PARTS.some((part) => part.id === direct.id)) return direct;

  return (
    IKEA_PARTS.find(
      (part) =>
        part.sku.toLowerCase() === needle ||
        part.name.toLowerCase() === needle ||
        part.sku.toLowerCase().endsWith(needle),
    ) || null
  );
}

function resultForPart(part) {
  return part ? { article: part.sku, partName: part.name } : null;
}

function resultForSuppliedArticle(value, fallbackName = "IKEA replacement fitting") {
  const articleNumber = normalizeArticleNumber(value);
  if (articleNumber) {
    const known = IKEA_PARTS.find((part) => part.sku.includes(articleNumber));
    return {
      article: articleNumber,
      partName: known?.name || fallbackName,
    };
  }

  const known = catalogPart(value);
  return known
    ? resultForPart(known)
    : {
        article: String(value).trim(),
        partName: fallbackName,
      };
}

function inferFromText(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const articleNumber = normalizeArticleNumber(text);
  if (articleNumber) {
    const known = IKEA_PARTS.find((part) => part.sku.includes(articleNumber));
    return {
      article: articleNumber,
      partName: known?.name || "IKEA replacement fitting",
    };
  }

  const lower = text.toLowerCase();
  const namedPart = IKEA_PARTS.find(
    (part) =>
      lower.includes(part.id.toLowerCase()) ||
      lower.includes(part.sku.toLowerCase()) ||
      lower.includes(part.name.toLowerCase()),
  );
  if (namedPart) return resultForPart(namedPart);

  if (/\b(m6|insert|fastener|machine screw)\b/i.test(text)) {
    return resultForPart(getPart("m6-screw"));
  }
  if (/\b(lack[\s-]*)?leg\b/i.test(text)) return resultForPart(getPart("lack-leg"));
  if (/\b(lack[\s-]*)?(table )?top\b/i.test(text)) return resultForPart(getPart("lack-top"));
  if (/\b(allen|hex key)\b/i.test(text)) return resultForPart(getPart("allen-key"));

  return null;
}

function inferFromStep(step) {
  if (!step) return null;
  const parts = [
    ...(Array.isArray(step.partsUsed) ? step.partsUsed : []),
    ...(Array.isArray(step.parts) ? step.parts : []),
    ...(Array.isArray(step.partIds) ? step.partIds : []),
  ];

  for (const candidate of parts) {
    if (candidate && typeof candidate === "object") {
      const suppliedArticle = candidate.article || candidate.sku;
      if (suppliedArticle) {
        return resultForSuppliedArticle(suppliedArticle, candidate.name);
      }
      const known = catalogPart(candidate.id);
      if (known) return resultForPart(known);
      const inferred = inferFromText(candidate.name);
      if (inferred) return inferred;
      continue;
    }

    const articleNumber = normalizeArticleNumber(candidate);
    if (articleNumber) return inferFromText(articleNumber);
    const known = catalogPart(candidate);
    if (known) return resultForPart(known);
    const inferred = inferFromText(candidate);
    if (inferred) return inferred;
  }

  return inferFromText([step.body, step.note, step.action].filter(Boolean).join(" "));
}

function makeRequestLetter({ article, partName, guide, stepNumber, note, photoName }) {
  const product = guide?.title ? ` for my ${guide.title}` : "";
  const step = stepNumber == null ? "" : ` at assembly step ${stepNumber}`;
  const details = note ? `\nProblem: ${note}` : "";
  const photo = photoName ? `\nAttached photo: ${photoName}` : "";

  return [
    "Hello IKEA Customer Service,",
    "",
    `I would like to request a free replacement fitting${product}${step}.`,
    `Part: ${partName}`,
    `Article/part number: ${article}${details}${photo}`,
    "",
    "Please let me know if you need any other product details. Thank you.",
  ].join("\n");
}

export function requestSpare({
  guide,
  stepNumber,
  note = "",
  photoName = "",
  article,
} = {}) {
  const step = guide?.steps?.find((candidate) => Number(candidate.number) === Number(stepNumber));

  let inferred = null;
  if (article != null && String(article).trim()) {
    inferred = resultForSuppliedArticle(
      article,
      inferFromText(note)?.partName || "IKEA replacement fitting",
    );
  }
  inferred ||= inferFromText(note);
  inferred ||= inferFromStep(step);

  if (!inferred?.article) {
    const photo = photoName ? `the photo "${photoName}"` : "a photo of the missing or broken fitting";
    return {
      ok: true,
      storeVisit: true,
      article: null,
      message: `No part number could be identified. Take ${photo} and the product to the IKEA store so staff can match the fitting.`,
    };
  }

  return {
    ok: true,
    storeVisit: false,
    article: inferred.article,
    partName: inferred.partName,
    requestLetter: makeRequestLetter({
      ...inferred,
      guide,
      stepNumber,
      note,
      photoName,
    }),
    where: IKEA_SERVICE,
  };
}
