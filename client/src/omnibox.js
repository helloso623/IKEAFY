/** One command box: type to filter the shelf, Enter to ask when it is a question. */

const QUESTION =
  /[?]|^\s*(what|which|who|where|when|why|how|can|could|should|is|are|do|does|did|will|would|may|might|recommend|suggest|help|any)\b/i;

const BENCH_COMMAND =
  /^\s*(add|put|drop|place|generate|make|build|create|move|rotate|label|isolate)\b/i;

const STOP =
  /\b(what|which|who|where|when|why|how|can|could|should|is|are|do|does|did|will|would|please|find|show|list|get|search|look|recommend|suggest|help|me|my|a|an|the|some|any|for|with|under|over|cheap|cheaper|best|good|about)\b/gi;

export function looksLikeQuestion(raw) {
  const text = String(raw || "").trim();
  return QUESTION.test(text) || BENCH_COMMAND.test(text);
}

export function looksLikeBenchCommand(raw) {
  return BENCH_COMMAND.test(String(raw || "").trim());
}

export function catalogNeedle(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[?!.,]/g, " ")
    .replace(STOP, " ")
    .replace(/\$?\d+(?:\.\d+)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseBudget(raw) {
  const match = String(raw || "").match(/(?:\$|under\s+)\s*(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : "";
}

export function ensureOmnibox() {
  const header = document.querySelector("header.top");
  let input = document.getElementById("omnibox");
  if (!input && header) {
    input = document.createElement("input");
    input.id = "omnibox";
    input.type = "search";
    input.autocomplete = "off";
    input.placeholder = "Add a table, generate a lamp, or ask…";
    input.setAttribute("aria-label", "Search the catalog or ask the shop");
    header.insertBefore(input, header.querySelector(".top-actions"));
  }
  let ask = document.getElementById("omnibox-ask");
  if (!ask && input) {
    ask = document.createElement("button");
    ask.type = "button";
    ask.id = "omnibox-ask";
    ask.textContent = "Ask";
    input.insertAdjacentElement("afterend", ask);
  }
  return {
    form: document.getElementById("omnibox-form"),
    input,
    ask,
  };
}

export function bindOmnibox({ boxes = [], form, askButton, onFilter, onAsk } = {}) {
  const nodes = boxes.filter(Boolean);

  function current() {
    const active = nodes.find((node) => node === document.activeElement);
    return String((active || nodes[0])?.value || "");
  }

  function sync(from) {
    if (!from) return;
    for (const node of nodes) {
      if (node !== from) node.value = from.value;
    }
  }

  function filterFrom(from) {
    if (from) sync(from);
    onFilter?.(current());
  }

  function askFrom(from) {
    if (from) sync(from);
    const query = current().trim();
    if (query) onAsk?.(query);
  }

  for (const node of nodes) {
    node.addEventListener("input", () => filterFrom(node));
    node.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (form && form.contains(node)) return;
      event.preventDefault();
      if (looksLikeQuestion(node.value)) askFrom(node);
      else filterFrom(node);
    });
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const node = nodes.find((box) => form.contains(box)) || nodes[0];
    if (looksLikeQuestion(node?.value)) askFrom(node);
    else filterFrom(node);
  });

  askButton?.addEventListener("click", (event) => {
    event.preventDefault();
    const node = nodes.find((box) => askButton.form?.contains(box)) || nodes[0];
    askFrom(node);
  });

  return { current, filterFrom, askFrom };
}
