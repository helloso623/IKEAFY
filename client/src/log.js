const SECRET_FIELD = /^(.*(?:api[_-]?key|secret|token|password|authorization|bearer|fal_key).*)$/i;

function redactString(value) {
  const text = String(value);
  if (text.startsWith("data:")) return `[data ${text.length} chars]`;
  if (text.length > 80 && /^[A-Za-z0-9+/=]+$/.test(text)) return `[b64 ${text.length} chars]`;
  return text;
}

export function sanitizeLogValue(value, depth = 0) {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redactString(value);
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
  console.log(`[ikealive:${scope}]`, ...args.map((arg) => sanitizeLogValue(arg)));
}

export function ikealiveWarn(scope, ...args) {
  console.warn(`[ikealive:${scope}]`, ...args.map((arg) => sanitizeLogValue(arg)));
}
