import { ikealiveLog, ikealiveWarn } from "./log.js";

export const PLATE_VISION_ENDPOINT = "https://fal.run/openrouter/router/vision";
export const PLATE_VISION_MODEL = "google/gemini-2.5-flash";
export const FAL_PLATE_VISION_REQUIRED =
  "GLiNER 2 found insufficient extractable PDF text. Set FAL_KEY so fal plate vision can read the drawing plates.";

function safeDetail(value) {
  return String(value || "")
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, "[image data]")
    .replace(/[A-Za-z0-9+/=]{100,}/g, "[base64 data]")
    .replace(/\bKey\s+\S+/gi, "Key [redacted]")
    .slice(0, 500);
}

function plateUrls(images = []) {
  return images
    .map((image) => image?.dataUrl || image?.url || "")
    .filter((url) => /^data:image\/|^https?:\/\//i.test(String(url)))
    .slice(0, 8);
}

function promptForPlates({ raw = "", instructions = "", availableTools = [] } = {}) {
  return [
    "Read these assembly-manual plates in image order. Interpret the drawings, arrows, part labels, quantities, tools, warnings, and action sequence.",
    "Return JSON only: {\"title\":string,\"steps\":[{\"number\":number,\"action\":string,\"body\":string,\"partsUsed\":string[],\"toolRequired\":string|null,\"warnings\":string[]}]}",
    "Use one physical move per step. Do not invent actions that are not visible. Preserve printed part labels even when they are numeric.",
    raw ? `Extracted PDF text and labels (may be incomplete):\n${String(raw).slice(0, 6000)}` : "",
    instructions ? `Builder notes: ${String(instructions).slice(0, 1000)}` : "",
    availableTools.length ? `Tools on hand: ${availableTools.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function readPlatesWithFal(
  { raw = "", images = [], instructions = "", availableTools = [], requestId = null } = {},
  { fetchFn = fetch, falVisionFn } = {},
) {
  const imageUrls = plateUrls(images);
  if (!imageUrls.length) return "";
  if (falVisionFn) {
    const mocked = await falVisionFn({
      endpoint: PLATE_VISION_ENDPOINT,
      model: PLATE_VISION_MODEL,
      image_urls: imageUrls,
      prompt: promptForPlates({ raw, instructions, availableTools }),
      requestId,
    });
    return typeof mocked === "string" ? mocked : JSON.stringify(mocked);
  }

  const key = String(process.env.FAL_KEY || "").trim();
  if (!key) throw new Error(FAL_PLATE_VISION_REQUIRED);
  const payload = {
    model: PLATE_VISION_MODEL,
    image_urls: imageUrls,
    prompt: promptForPlates({ raw, instructions, availableTools }),
    system_prompt: "Return only valid JSON grounded in the supplied assembly plates.",
    temperature: 0,
    max_tokens: 8000,
  };
  ikealiveLog("plate-vision", "request", {
    requestId,
    endpoint: PLATE_VISION_ENDPOINT,
    model: PLATE_VISION_MODEL,
    plates: imageUrls.length,
  });
  let response;
  try {
    response = await fetchFn(PLATE_VISION_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const detail = safeDetail(error?.message || error);
    throw new Error(`fal plate vision request failed: ${detail || "network error"}`);
  }
  if (!response.ok) {
    const detail = safeDetail(await response.text().catch(() => ""));
    ikealiveWarn("plate-vision", "error", { requestId, status: response.status, detail });
    throw new Error(
      detail
        ? `fal plate vision failed (HTTP ${response.status}): ${detail}`
        : `fal plate vision failed (HTTP ${response.status}).`,
    );
  }
  const result = await response.json();
  const output = String(result?.output || result?.data?.output || "").trim();
  if (!output) throw new Error("fal plate vision returned no usable plate description.");
  ikealiveLog("plate-vision", "response", {
    requestId,
    model: PLATE_VISION_MODEL,
    outputChars: output.length,
  });
  return output;
}
