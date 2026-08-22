export function usableOpenAiKey(value = process.env.OPENAI_API_KEY) {
  const key = String(value || "").trim();
  if (!key || /\s/.test(key)) return "";
  if (!key.startsWith("sk-")) return "";
  return key;
}
