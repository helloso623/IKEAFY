/**
 * Watch / shop mic: Web Speech API → transcript → existing /api/agents/chat.
 * No paid voice vendor. Missing speech APIs fail visibly.
 */

function speechCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function bindVoice({
  button,
  status,
  input,
  onHear,
} = {}) {
  if (!button) return { available: false };

  const Ctor = speechCtor();
  const fail = (message) => {
    if (status) status.textContent = message;
    button.setAttribute("aria-pressed", "false");
    button.classList.remove("on");
    console.warn("[ikealive:voice]", message);
  };

  if (!Ctor) {
    button.disabled = true;
    fail("This browser has no speech recognition. Type instead.");
    return { available: false };
  }

  let rec = null;
  let listening = false;

  function setListening(on) {
    listening = Boolean(on);
    button.classList.toggle("on", listening);
    button.setAttribute("aria-pressed", String(listening));
    if (status) status.textContent = listening ? "Listening…" : "";
  }

  function start() {
    if (listening) {
      rec?.stop();
      return;
    }
    rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      setListening(true);
      console.log("[ikealive:voice]", "listen");
    };
    rec.onerror = (event) => {
      setListening(false);
      fail(event?.error === "not-allowed" ? "Microphone permission denied." : `Voice failed: ${event?.error || "unknown"}.`);
    };
    rec.onend = () => setListening(false);
    rec.onresult = (event) => {
      const text = String(event.results?.[0]?.[0]?.transcript || "").trim();
      console.log("[ikealive:voice]", "transcript", { text, length: text.length });
      if (status) status.textContent = text ? `Heard: ${text}` : "";
      if (input && text) input.value = text;
      if (text && typeof onHear === "function") onHear(text);
    };
    try {
      rec.start();
    } catch (error) {
      fail(error?.message || "Could not start the microphone.");
    }
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    start();
  });

  return { available: true, start };
}
