/**
 * Lab / shop mic: Web Speech API → transcript → existing /api/agents/chat.
 * No paid voice vendor. Missing speech APIs fail visibly; type instead.
 */

export function speechCtor(scope = typeof window === "undefined" ? undefined : window) {
  if (!scope) return null;
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null;
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
    rec.onstart = () => setListening(true);
    rec.onerror = (event) => {
      setListening(false);
      fail(
        event?.error === "not-allowed"
          ? "Microphone permission denied. Type instead."
          : `Voice failed: ${event?.error || "unknown"}. Type instead.`,
      );
    };
    rec.onend = () => setListening(false);
    rec.onresult = (event) => {
      const text = String(event.results?.[0]?.[0]?.transcript || "").trim();
      if (status) status.textContent = text ? `Heard: ${text}` : "";
      if (input && text) input.value = text;
      if (text && typeof onHear === "function") onHear(text);
    };
    try {
      rec.start();
    } catch (error) {
      fail(error?.message || "Could not start the microphone. Type instead.");
    }
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    start();
  });

  return { available: true, start };
}
