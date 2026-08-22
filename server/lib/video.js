import { storyboardForStep } from "./ikeafy.js";

const PARTNER = "Veed";
const MODEL = "veed/fabric-1.0";
const ENDPOINT = `https://fal.run/${MODEL}`;

function makePlaceholderImage() {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">',
    '<rect width="640" height="480" fill="#f3efe6"/>',
    '<rect x="70" y="330" width="500" height="32" rx="4" fill="#d7b98e"/>',
    '<rect x="105" y="362" width="24" height="88" fill="#b88b58"/>',
    '<rect x="511" y="362" width="24" height="88" fill="#b88b58"/>',
    '<circle cx="320" cy="190" r="64" fill="#ffda1a"/>',
    '<text x="320" y="275" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#292929">Birch workshop</text>',
    "</svg>",
  ].join("");
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function makeSilentWav() {
  const sampleRate = 8000;
  const sampleCount = 800;
  const wav = Buffer.alloc(44 + sampleCount, 128);

  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + sampleCount, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(sampleCount, 40);

  return `data:audio/wav;base64,${wav.toString("base64")}`;
}

function videoUrlFrom(response) {
  return (
    response?.video?.url ||
    response?.video_url ||
    response?.data?.video?.url ||
    response?.data?.video_url ||
    response?.url ||
    null
  );
}

export function hasVeed() {
  return typeof process.env.FAL_KEY === "string" && process.env.FAL_KEY.trim().length > 0;
}

export async function renderStepVideo({ guide, stepNumber, imageDataUrl } = {}) {
  let frames = [];
  let theme = {
    setting: "birch workshop",
    light: "north window",
    material: "particleboard foil + steel inserts",
    accent: "#ffda1a",
  };

  try {
    frames = storyboardForStep(guide, stepNumber);
    theme = guide?.theme || theme;
  } catch {
    // An unusable guide still yields a safe local result.
  }

  const local = {
    provider: "local-storyboard",
    partner: PARTNER,
    model: MODEL,
    videoUrl: null,
    frames,
    continuous: true,
    theme,
  };

  if (!hasVeed()) return local;

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Key ${process.env.FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: imageDataUrl || makePlaceholderImage(),
        audio_url: makeSilentWav(),
        resolution: "480p",
      }),
    });

    if (!response.ok) return local;

    const videoUrl = videoUrlFrom(await response.json());
    if (!videoUrl) return local;

    return {
      ...local,
      provider: "veed-fabric",
      videoUrl,
    };
  } catch {
    return local;
  }
}
