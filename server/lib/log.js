const SECRET_FIELD = /^(.*(?:api[_-]?key|secret|token|password|authorization|bearer|fal_key).*)$/i;

function redactString(value) {
  const text = String(value);
  if (text.startsWith("data:")) return `[data ${text.length} chars]`;
  if (text.length > 80 && /^[A-Za-z0-9+/=\s]+$/.test(text) && text.replace(/\s/g, "").length > 80) {
    return `[b64 ${text.replace(/\s/g, "").length} chars]`;
  }
  return text;
}

export function sanitizeLogValue(value, depth = 0) {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "function") return "[fn]";
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (depth > 4) return "[…]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeLogValue(item, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SECRET_FIELD.test(key) ? (item ? "[set]" : "[empty]") : sanitizeLogValue(item, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function ikealiveLog(scope, ...args) {
  const prefix = `[ikealive:${scope}]`;
  const safe = args.map((arg) => sanitizeLogValue(arg));
  console.log(prefix, ...safe);
}

export function ikealiveWarn(scope, ...args) {
  const prefix = `[ikealive:${scope}]`;
  const safe = args.map((arg) => sanitizeLogValue(arg));
  console.warn(prefix, ...safe);
}
