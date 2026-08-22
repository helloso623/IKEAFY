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

export function formatLogArgs(args) {
  return args
    .map((arg) => {
      const safe = sanitizeLogValue(arg);
      if (typeof safe === "string") return safe;
      if (safe == null || typeof safe === "number" || typeof safe === "boolean") return String(safe);
      try {
        return JSON.stringify(safe);
      } catch {
        return String(safe);
      }
    })
    .join(" ");
}

export function ikealiveLog(scope, ...args) {
  console.log(`[ikealive:${scope}] ${formatLogArgs(args)}`.trimEnd());
}

export function ikealiveWarn(scope, ...args) {
  console.warn(`[ikealive:${scope}] ${formatLogArgs(args)}`.trimEnd());
}
