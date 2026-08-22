import { inflateSync, unzipSync } from "node:zlib";

function decodePdfString(raw) {
  return String(raw || "")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\b/g, "")
    .replace(/\\f/g, "")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

function decodeHexString(hex) {
  const clean = String(hex || "").replace(/\s+/g, "");
  if (!clean) return "";
  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2).padEnd(2, "0"), 16));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return text;
  }
  return Buffer.from(bytes).toString("latin1");
}

function stringsFrom(chunk) {
  const out = [];
  const literals = /\(((?:\\.|[^\\)])*)\)/g;
  let match;
  while ((match = literals.exec(chunk))) out.push(decodePdfString(match[1]));
  const hex = /<([0-9A-Fa-f \t\r\n]+)>/g;
  while ((match = hex.exec(chunk))) {
    const decoded = decodeHexString(match[1]);
    if (decoded.trim()) out.push(decoded);
  }
  return out;
}

function inflateStream(raw) {
  try {
    return inflateSync(raw);
  } catch {
    try {
      return unzipSync(raw);
    } catch {
      return raw;
    }
  }
}

/**
 * Best-effort text pull from a PDF buffer. Image-only IKEA booklets may
 * return nothing — the upload screen then asks for a paste.
 */
export function extractPdfText(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input || "");
  if (buf.length < 5) return "";
  const latin = buf.toString("latin1");
  if (!latin.startsWith("%PDF")) return "";

  const chunks = [latin];
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamRe.exec(latin))) {
    chunks.push(inflateStream(Buffer.from(match[1], "latin1")).toString("latin1"));
  }

  const parts = chunks.flatMap(stringsFrom).map((part) => part.replace(/\s+/g, " ").trim());
  const text = parts
    .filter((part) => part && /[A-Za-z0-9]/.test(part))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}
