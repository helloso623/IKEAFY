/**
 * The IKEAFY studio: input, then a progress beat, then a results film.
 *
 * Two sources feed it. The official IKEA sheet is locked — the server decides
 * which step you are on, will not send a step you have not reached, and refuses
 * skips and edits out loud. A guide you paste yourself is the opposite: editable
 * inline, skippable, and stored so you can come back to it.
 *
 * Nothing here decides progress on its own. Every move is a server call, so
 * disabling a button is a courtesy rather than the lock itself.
 */

const CUSTOM_SESSION_KEY = "ikeafy.custom-session";

const PROGRESS_BEATS = [
  { id: "parse", label: "Parsing the building guide into steps (Pioneer / GLiNER 2)" },
  { id: "film", label: "Generating a tutorial film for each step (Veed)" },
  { id: "parts", label: "Looking up kit vs extra and retailers (Tavily)" },
];

const first = (...selectors) => selectors.map((s) => document.querySelector(s)).find(Boolean) || null;

function text(value) {
  return value == null ? "" : String(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function initStudio({ api, hud = () => {} } = {}) {
  if (!api) throw new Error("initStudio requires an api client");

  const el = {
    officialMode: first("#official-mode", "[data-studio-mode='official']"),
    customMode: first("#custom-mode", "[data-studio-mode='custom']"),
    officialSource: first("#official-source"),
    customSource: first("#custom-source"),
    product: first("#official-product"),
    productSearch: first("#product-search"),
    productHits: first("#product-hits"),
    openOfficial: first("#open-official"),
    guide: first("#guide-in"),
    notes: first("#guide-notes"),
    parse: first("#parse-guide"),
    clear: first("#clear-custom-session"),
    drop: first("#guide-drop"),
    guideFile: first("#guide-file"),
    guideFiles: first("#guide-files"),
    lockBanner: first("#lock-banner"),
    steps: first("#steps"),
    bom: first("#bom"),
    reviews: first("#reviews"),
    film: first("#film"),
    frame: first("#film-frame"),
    scheme: first("#step-scheme"),
    caption: first("#film-caption"),
    seeGuide: first("#see-guide"),
    confirm: first("#step-confirm"),
    confirmLabel: first("#step-confirm-label"),
    next: first("#film-wait"),
    back: first("#film-back"),
    stuck: first("#film-stuck"),
    skip: first("#step-skip"),
    colorize: first("#colorize"),
    render: first("#render-video"),
    renderOut: first("#render-video-out"),
    detail: first("#step-detail", "#inspect"),
    extraContext: first("#extra-context"),
    extraMedia: first("#extra-media"),
    regenerate: first("#regenerate-step"),
    tabInstructions: first("#tab-instructions"),
    tabMaterial: first("#tab-material"),
    studioBack: first("#studio-back"),
    progress: first("#studio-progress"),
    progressStatus: first("#progress-status"),
    progressDetail: first("#progress-detail"),
    progressBeats: first("#progress-beats"),
    broken: first("#broken-btn"),
    brokenNote: first("#broken-note"),
    brokenPhoto: first("#broken-photo"),
    spare: first("#spare-request"),
    spareArticle: first("#spare-article"),
    spareQty: first("#spare-qty"),
    spareName: first("#spare-name"),
    spareEmail: first("#spare-email"),
    spareOut: first("#spare-out"),
    chatForm: first("#ikea-chat-form", "#chat-form"),
    chatInput: first("#ikea-chat-in", "#chat-in"),
    chatLog: first("#ikea-chat-log", "#chat-log"),
    chatFiles: first("#ikea-chat-files"),
  };

  const listeners = [];
  const state = {
    mode: "official",
    view: "input",
    resultsTab: "instructions",
    products: [],
    attachments: [],
    extraMedia: [],
    run: null,
    step: null,
    outline: [],
    guide: null,
    frames: [],
    frameIndex: 0,
    playing: 0,
    timer: null,
    watched: false,
    broken: null,
    showingGuide: false,
    destroyed: false,
  };

  function listen(node, event, handler) {
    if (!node) return;
    node.addEventListener(event, handler);
    listeners.push(() => node.removeEventListener(event, handler));
  }

  function announce(message) {
    hud(text(message));
  }

  function fail(error) {
    announce(error?.message || error || "The studio could not do that.");
    return null;
  }

  function setOut(node, value) {
    if (node) node.textContent = text(value);
  }

  function setStudioView(view) {
    state.view = view;
    const app = document.getElementById("app");
    app?.setAttribute("data-studio-view", view);
    el.progress?.classList.toggle("hidden", view !== "progress");
    if (view === "results") el.film?.classList.remove("hidden");
    if (view === "input") el.film?.classList.add("hidden");
  }

  function setResultsTab(tab) {
    state.resultsTab = tab === "material" ? "material" : "instructions";
    document.getElementById("app")?.setAttribute("data-results-tab", state.resultsTab);
    el.tabInstructions?.classList.toggle("on", state.resultsTab === "instructions");
    el.tabMaterial?.classList.toggle("on", state.resultsTab === "material");
    el.tabInstructions?.setAttribute("aria-pressed", String(state.resultsTab === "instructions"));
    el.tabMaterial?.setAttribute("aria-pressed", String(state.resultsTab === "material"));
  }

  // ---------------------------------------------------------------- source mode

  function setMode(mode) {
    state.mode = mode === "custom" ? "custom" : "official";
    const official = state.mode === "official";
    el.officialMode?.classList.toggle("on", official);
    el.customMode?.classList.toggle("on", !official);
    el.officialMode?.setAttribute("aria-pressed", String(official));
    el.customMode?.setAttribute("aria-pressed", String(!official));
    el.officialSource?.classList.toggle("hidden", !official);
    el.customSource?.classList.toggle("hidden", official);
    document.getElementById("app")?.setAttribute("data-guide-mode", state.mode);
  }

  function productUnlocked(product) {
    if (!product) return false;
    if (product.unlocked === false || product.locked === true) return false;
    return true;
  }

  function renderProductHits(query = "") {
    if (!el.productHits) return;
    el.productHits.replaceChildren();
    const needle = String(query || "").trim().toLowerCase();
    const hits = (state.products || []).filter((product) => {
      if (!needle) return true;
      const hay = `${product.name} ${product.article || ""} ${product.size || ""}`.toLowerCase();
      return hay.includes(needle);
    });
    if (!hits.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = needle ? "No IKEA product by that name in the catalog yet." : "";
      el.productHits.append(empty);
      return;
    }
    for (const product of hits) {
      const row = document.createElement("div");
      const unlocked = productUnlocked(product);
      row.className = unlocked ? "item" : "item catalog-locked";
      row.dataset.article = product.article;
      const body = document.createElement("span");
      body.textContent = `${product.name} ${product.size || ""} — ${product.article}`.trim();
      const meta = document.createElement("small");
      const tag = document.createElement("span");
      tag.className = unlocked ? "tag included" : "tag locked";
      tag.textContent = unlocked ? "unlocked" : "locked";
      meta.append(tag);
      row.append(body, meta);
      el.productHits.append(row);
    }
  }

  async function fillProducts() {
    if (!api.officialProducts) return;
    try {
      const { products = [] } = await api.officialProducts();
      state.products = products;
      if (el.product) {
        el.product.replaceChildren();
        const unlocked = products.filter(productUnlocked);
        for (const product of unlocked) {
          const option = document.createElement("option");
          option.value = product.article;
          option.textContent = `${product.name} ${product.size || ""} — article ${product.article}`.trim();
          el.product.append(option);
        }
        if (!unlocked.length) {
          const option = document.createElement("option");
          option.textContent = "No official sheet transcribed yet";
          option.disabled = true;
          el.product.append(option);
        }
      }
      renderProductHits(el.productSearch?.value || "");
    } catch (error) {
      fail(error);
    }
  }

  function pickProduct(article) {
    const product = (state.products || []).find((p) => p.article === article);
    if (!product) return;
    if (!productUnlocked(product)) {
      announce(
        `${product.name} is in the catalog but its official sheet is not transcribed yet.`,
      );
      return;
    }
    if (el.product) el.product.value = product.article;
    startOfficial();
  }

  // ------------------------------------------------------------------ rendering

  function renderLockBanner() {
    if (!el.lockBanner) return;
    if (!state.run) {
      el.lockBanner.textContent = "";
      return;
    }
    const { locked, cursor, total, confirmed } = state.run;
    el.lockBanner.classList.toggle("locked", locked);
    el.lockBanner.textContent = locked
      ? `Official sheet · step ${cursor} of ${total} · ${confirmed.length} confirmed · read-only, in order`
      : `Your guide · step ${cursor} of ${total} · edit or skip as you like`;
  }

  function renderSteps() {
    if (!el.steps) return;
    el.steps.replaceChildren();
    const editable = state.run ? state.run.canEdit : false;
    el.steps.dataset.editable = String(editable);

    for (const item of state.outline) {
      const row = document.createElement("div");
      row.className = "item";
      row.dataset.step = String(item.number);
      row.classList.toggle("active", item.number === state.run?.cursor);
      row.classList.toggle("locked", Boolean(item.locked));
      row.classList.toggle("done", item.state === "done");

      const body = document.createElement("span");
      body.textContent = item.readable
        ? `${item.number}. ${item.action ? `${item.action} — ` : ""}${item.body || ""}`
        : `${item.number}. ${item.preview || "Locked until you get there."}`;
      if (editable && item.readable) {
        body.contentEditable = "true";
        body.setAttribute("role", "textbox");
        body.addEventListener("blur", () => saveStepEdit(item, body));
      }
      row.append(body);

      const meta = document.createElement("small");
      meta.textContent = item.confirmed
        ? "done"
        : item.locked
          ? "locked"
          : `${item.toolRequired || "hands"} · film`;
      row.append(meta);
      el.steps.append(row);
    }
  }

  function materialCard(line, badge) {
    const card = document.createElement("article");
    card.className = "material-card";
    const swatch = document.createElement("div");
    swatch.className = "swatch";
    swatch.style.background = line.color || line.picture?.color || "#e4d2b0";
    swatch.title = line.name;
    const body = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = `${line.qty || 1}× ${line.name}`;
    const tag = document.createElement("span");
    tag.className = badge === "included" ? "tag included" : "tag purchase";
    tag.textContent = badge === "included" ? "included" : "to purchase";
    title.append(" ", tag);
    body.append(title);
    if (line.ikeaArticle) {
      const art = document.createElement("p");
      art.className = "hint";
      art.textContent = `Article ${line.ikeaArticle}`;
      body.append(art);
    }
    const offers = line.retailers || line.offers || [];
    if (badge !== "included" && (offers.length || line.storeUrl)) {
      const list = document.createElement("div");
      list.className = "offers";
      const rows = offers.length
        ? offers
        : [{ store: line.store, url: line.storeUrl, price: line.cost, primary: true }];
      for (const offer of rows) {
        const link = document.createElement("a");
        link.href = offer.url || "#";
        link.target = "_blank";
        link.rel = "noreferrer";
        const price = offer.price == null ? "" : ` · $${offer.price}`;
        link.textContent = `${offer.store || "Shop"}${price}${offer.note ? ` — ${offer.note}` : ""}`;
        list.append(link);
      }
      body.append(list);
    }
    card.append(swatch, body);
    return card;
  }

  function renderBom() {
    if (!el.bom) return;
    const bom = state.guide?.bom;
    el.bom.replaceChildren();
    if (!bom) return;
    for (const line of bom.included || []) el.bom.append(materialCard(line, "included"));
    for (const line of bom.extra || []) el.bom.append(materialCard(line, "to-purchase"));
  }

  async function renderReviews() {
    if (!el.reviews || !api.reviews) return;
    try {
      const groups = (await api.reviews()) || [];
      el.reviews.replaceChildren();
      for (const group of groups) {
        for (const review of group.reviews || []) {
          const line = document.createElement("div");
          line.textContent = `Step ${group.step} · ${review.stars}★ · ${review.difficulty}\n${review.text}`;
          el.reviews.append(line);
        }
      }
    } catch (error) {
      fail(error);
    }
  }

  function renderConfirm() {
    const locked = Boolean(state.run?.locked);
    if (el.confirm) {
      el.confirm.checked = false;
      el.confirm.disabled = !state.watched;
    }
    setOut(
      el.confirmLabel,
      state.step?.confirmPrompt ||
        (locked ? "Confirm this step before the next plate." : "Mark this step done."),
    );
    if (el.next) el.next.disabled = locked ? true : !state.watched;
    if (el.skip) el.skip.classList.toggle("refuses", locked);
  }

  function renderFittings() {
    const fittings = state.step?.fittings || [];
    if (!el.spareArticle) return;
    el.spareArticle.placeholder = fittings.length
      ? `Fitting no. — this step uses ${fittings.map((f) => f.articleNumber).join(", ")}`
      : "Fitting no. (e.g. 100347)";
  }

  function drawScheme(step = state.step) {
    const canvas = el.scheme;
    if (!canvas?.getContext) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = canvas.clientWidth || 320;
    canvas.height = canvas.clientHeight || 200;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#ead9b4";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1b1914";
    ctx.font = "13px Source Sans 3, sans-serif";
    ctx.fillText(`3D scheme · step ${step?.number || "—"}`, 12, 22);

    const parts = step?.partsUsed?.length ? step.partsUsed : ["lack-top", "lack-leg"];
    const ox = w * 0.46;
    const oy = h * 0.62;
    const iso = (x, y, z) => ({ x: ox + (x - z) * 0.9, y: oy + (x + z) * 0.5 - y });

    function box(x, y, z, dx, dy, dz, fill) {
      const a = iso(x, y + dy, z);
      const b = iso(x + dx, y + dy, z);
      const c = iso(x + dx, y + dy, z + dz);
      const d = iso(x, y + dy, z + dz);
      const e = iso(x, y, z);
      const f = iso(x + dx, y, z);
      const g = iso(x + dx, y, z + dz);
      ctx.fillStyle = fill;
      ctx.strokeStyle = "#2a251d";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(f.x, f.y);
      ctx.lineTo(g.x, g.y);
      ctx.lineTo(c.x, c.y);
      ctx.closePath();
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(e.x, e.y);
      ctx.lineTo(f.x, f.y);
      ctx.lineTo(b.x, b.y);
      ctx.closePath();
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
    }

    const lift = Number(state.frames[Math.max(0, state.frameIndex - 1)]?.explode || 0) * 40;
    parts.forEach((id, i) => {
      const isLeg = /leg|dowel|screw|key/.test(id);
      const fill = isLeg ? "#d8c7a1" : "#f3efe6";
      if (isLeg) box(-30 + i * 28, lift + i * 6, 10, 12, 54, 12, fill);
      else box(-70, 54 + lift, -20, 140, 16, 90, fill);
    });
  }

  // -------------------------------------------------------------------- the run

  function applyView(view) {
    if (!view || view.ok === false) return view;
    state.run = view.run || state.run;
    state.step = view.step || null;
    state.outline = view.outline || [];
    state.guide = view.guide || state.guide;
    state.watched = false;
    state.showingGuide = false;
    renderLockBanner();
    renderSteps();
    renderBom();
    renderConfirm();
    renderFittings();
    drawScheme(state.step);
    return view;
  }

  function renderProgress(activeId) {
    if (el.progressBeats) {
      el.progressBeats.replaceChildren();
      for (const beat of PROGRESS_BEATS) {
        const item = document.createElement("li");
        item.textContent = beat.label;
        if (beat.id === activeId) item.className = "on";
        const idx = PROGRESS_BEATS.findIndex((b) => b.id === beat.id);
        const active = PROGRESS_BEATS.findIndex((b) => b.id === activeId);
        if (idx < active) item.className = "done";
        el.progressBeats.append(item);
      }
    }
    const beat = PROGRESS_BEATS.find((b) => b.id === activeId);
    setOut(el.progressStatus, beat ? `${beat.label}…` : "Working…");
  }

  async function runWithProgress(work) {
    setStudioView("progress");
    for (const beat of PROGRESS_BEATS) {
      renderProgress(beat.id);
      setOut(el.progressDetail, beat.id === "parse" ? "Turning plates into structured JSON." : "");
      await sleep(260);
    }
    try {
      const result = await work();
      if (!result || result.ok === false) {
        setStudioView("input");
        return result;
      }
      setStudioView("results");
      setResultsTab("instructions");
      return result;
    } catch (error) {
      setStudioView("input");
      throw error;
    }
  }

  async function startOfficial() {
    try {
      setMode("official");
      const article = el.product?.value || undefined;
      const picked = (state.products || []).find((p) => p.article === article);
      if (picked && !productUnlocked(picked)) {
        announce(`${picked.name} is locked until its official sheet is transcribed.`);
        return null;
      }
      announce("Opening the official sheet…");
      const view = await runWithProgress(() =>
        api.runStart({ mode: "official", article }),
      );
      if (view?.ok === false) return fail(new Error(view.reason));
      if (!view) return null;
      applyView(view);
      await renderReviews();
      await playCurrent();
      announce(`${state.guide?.title || "Official guide"} — one plate at a time, in order.`);
      return view;
    } catch (error) {
      return fail(error);
    }
  }

  async function parseCustom() {
    try {
      setMode("custom");
      const raw = el.guide?.value || "";
      if (!raw.trim() && !state.attachments.length) {
        announce("Paste a guide or drop a file first.");
        return null;
      }
      const attached = state.attachments.map((f) => f.name).join(", ");
      const guideText = raw.trim()
        ? raw
        : `Custom build from ${attached}\n1. Unpack the pieces in the photos.\n2. Identify each part against the pictures.\n3. Assemble following the attached guide.`;
      announce("Turning your guide into a film…");
      const view = await runWithProgress(() =>
        api.runStart({
          mode: "custom",
          guide: guideText,
          instructions: el.notes?.value || "",
        }),
      );
      if (view?.ok === false) return fail(new Error(view.reason));
      if (!view) return null;
      applyView(view);
      saveCustom(raw);
      await renderReviews();
      await playCurrent();
      announce("Your guide is a film now. This one you can edit and skip.");
      return view;
    } catch (error) {
      return fail(error);
    }
  }

  function saveCustom(raw) {
    if (state.mode !== "custom") return;
    try {
      localStorage.setItem(
        CUSTOM_SESSION_KEY,
        JSON.stringify({ raw: raw ?? el.guide?.value ?? "", notes: el.notes?.value || "" }),
      );
    } catch {
      // Storage is unavailable in private windows; the session just will not persist.
    }
  }

  function restoreCustom() {
    try {
      const saved = JSON.parse(localStorage.getItem(CUSTOM_SESSION_KEY) || "null");
      if (!saved?.raw) return false;
      if (el.guide) el.guide.value = saved.raw;
      if (el.notes) el.notes.value = saved.notes || "";
      return true;
    } catch {
      return false;
    }
  }

  function renderGuideFiles() {
    if (!el.guideFiles) return;
    el.guideFiles.replaceChildren();
    for (const file of state.attachments) {
      const chip = document.createElement("span");
      chip.textContent = file.name;
      el.guideFiles.append(chip);
    }
  }

  async function ingestFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    for (const file of files) {
      state.attachments.push({ name: file.name, type: file.type, size: file.size });
      if (file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name)) {
        const body = await file.text();
        if (el.guide) el.guide.value = [el.guide.value, body].filter(Boolean).join("\n\n");
      }
    }
    renderGuideFiles();
    announce(`${files.length} file${files.length === 1 ? "" : "s"} attached.`);
  }

  function clearCustomSession() {
    setMode("custom");
    stopPlayback();
    state.run = null;
    state.step = null;
    state.outline = [];
    state.guide = null;
    state.attachments = [];
    if (el.guide) el.guide.value = "";
    if (el.notes) el.notes.value = "";
    for (const node of [el.steps, el.bom, el.reviews, el.caption, el.detail, el.spareOut]) {
      if (node) node.replaceChildren();
    }
    el.film?.classList.add("hidden");
    renderGuideFiles();
    try {
      localStorage.removeItem(CUSTOM_SESSION_KEY);
    } catch {
      // Nothing to clear when storage is unavailable.
    }
    renderLockBanner();
    setStudioView("input");
    announce("Custom session deleted.");
  }

  function backToInput() {
    stopPlayback();
    setStudioView("input");
    announce("Start another build, or pick up the last one from the results.");
  }

  // ------------------------------------------------------------------- playback

  function stopPlayback() {
    state.playing += 1;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
  }

  function drawFrame(frame = {}) {
    const canvas = el.frame;
    if (!canvas?.getContext) {
      setOut(canvas, frame.caption);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = canvas.clientWidth || 720;
    canvas.height = canvas.clientHeight || 280;
    const w = canvas.width;
    const h = canvas.height;
    // Black-and-white line plate first, catalog colour once colorized.
    const lift = Number(frame.explode || 0) * 80;
    ctx.fillStyle = frame.colorized ? "#e9d9b6" : "#f2ecdd";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#6b4b2a";
    ctx.fillRect(0, h - 46, w, 46);
    ctx.strokeStyle = "#2a251d";
    ctx.lineWidth = 2;
    ctx.fillStyle = frame.colorized ? "#f3efe6" : "#fbf7ee";
    ctx.fillRect(w * 0.32, h * 0.3 - lift, w * 0.36, 20);
    ctx.strokeRect(w * 0.32, h * 0.3 - lift, w * 0.36, 20);
    for (let i = 0; i < 4; i += 1) {
      const x = w * 0.34 + i * (w * 0.1);
      ctx.fillStyle = frame.colorized ? "#e6d7bc" : "#fbf7ee";
      ctx.fillRect(x, h * 0.3 + 20, 14, h * 0.34);
      ctx.strokeRect(x, h * 0.3 + 20, 14, h * 0.34);
    }
    ctx.fillStyle = "#1b1914";
    ctx.font = "20px Newsreader, serif";
    ctx.fillText(text(frame.caption).slice(0, 74), 22, 34);
    ctx.fillStyle = "#ffda1a";
    ctx.fillRect(0, 0, 8, h);
    drawScheme(state.step);
  }

  async function loadFrames() {
    if (!api.renderVideo || !state.run) return [];
    try {
      const extra = el.extraContext?.value || "";
      const media = [...(el.extraMedia?.files || [])].map((f) => f.name);
      const result = await api.renderVideo({
        runId: state.run.id,
        stepNumber: state.run.cursor,
        guide: state.mode === "custom" ? el.guide?.value || "" : undefined,
        instructions: extra,
        extraMedia: media,
      });
      setOut(
        el.renderOut,
        result.videoUrl
          ? `${result.model} via fal.ai — ${result.videoUrl}`
          : `${result.provider} · local canvas storyboard (set FAL_KEY for ${result.model})`,
      );
      return result.frames || result.plan || [];
    } catch (error) {
      fail(error);
      return [];
    }
  }

  async function playCurrent() {
    if (!state.run) return;
    stopPlayback();
    el.film?.classList.remove("hidden");
    state.frames = await loadFrames();
    state.frameIndex = 0;
    state.watched = false;
    renderConfirm();
    const token = state.playing;

    const advance = () => {
      if (state.destroyed || token !== state.playing) return;
      const frame = state.frames[state.frameIndex];
      if (!frame) {
        finishFrames();
        return;
      }
      drawFrame(frame);
      setOut(el.caption, frame.caption || state.step?.body);
      state.frameIndex += 1;
      if (state.frameIndex >= state.frames.length) {
        finishFrames();
        return;
      }
      state.timer = setTimeout(advance, Math.max(120, Number(frame.durationMs) || 1000));
    };
    advance();
  }

  function finishFrames() {
    state.watched = true;
    renderConfirm();
    announce(
      state.run?.locked
        ? "Plate finished. Tick the check, then take the next one."
        : "Plate finished. Next when you are ready.",
    );
  }

  function toggleActualGuide() {
    state.showingGuide = !state.showingGuide;
    if (!state.showingGuide) {
      setOut(el.detail, "");
      announce("Back to the film.");
      return;
    }
    const step = state.step;
    setOut(
      el.detail,
      [
        "ACTUAL GUIDE",
        step ? `Step ${step.number} — ${step.action || ""}` : "",
        step?.body || state.guide?.raw || "No plate loaded.",
        step?.toolRequired ? `Tool: ${step.toolRequired}` : "Hands only",
        step?.partsUsed?.length ? `Parts: ${step.partsUsed.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    announce("Original plate is under the film.");
  }

  // ------------------------------------------------------------------- controls

  async function nextStep() {
    if (!state.run) return null;
    try {
      const result = await api.runConfirm(state.run.id, {
        step: state.run.cursor,
        checked: Boolean(el.confirm?.checked),
      });
      if (result.ok === false) {
        announce(result.reason || "That step is not confirmed yet.");
        if (result.confirmPrompt) setOut(el.confirmLabel, result.confirmPrompt);
        if (el.confirm) el.confirm.disabled = false;
        return result;
      }
      const before = state.run.cursor;
      applyView(result);
      if (result.run?.done && result.run.cursor === before) {
        announce("Every step confirmed. That is the whole build.");
        return result;
      }
      await playCurrent();
      return result;
    } catch (error) {
      return fail(error);
    }
  }

  async function backStep() {
    if (!state.run) return null;
    try {
      const result = await api.runBack(state.run.id, Math.max(1, state.run.cursor - 1));
      if (result.ok === false) return announce(result.reason);
      applyView(result);
      await playCurrent();
      announce("Back a step. Everything after it is open again.");
      return result;
    } catch (error) {
      return fail(error);
    }
  }

  /** Skip exists so the refusal is visible: official says no, your own guide says yes. */
  async function skipStep() {
    if (!state.run) return null;
    try {
      const result = await api.runSkip(state.run.id, state.run.cursor);
      if (result.ok === false) {
        setOut(el.detail, [result.reason, result.alternative].filter(Boolean).join("\n"));
        announce(result.reason);
        return result;
      }
      applyView(result);
      await playCurrent();
      announce(`Skipped step ${result.skipped}. Your guide, your call.`);
      return result;
    } catch (error) {
      return fail(error);
    }
  }

  async function saveStepEdit(item, node) {
    if (!state.run) return;
    const prefix = `${item.number}. ${item.action ? `${item.action} — ` : ""}`;
    const body = node.textContent.startsWith(prefix)
      ? node.textContent.slice(prefix.length)
      : node.textContent;
    if (body.trim() === (item.body || "").trim()) return;
    try {
      const result = await api.runEdit(state.run.id, item.number, { body });
      if (result.ok === false) {
        announce(result.reason);
        node.textContent = `${prefix}${item.body || ""}`;
        return;
      }
      applyView(result);
      saveCustom();
      announce(`Step ${item.number} rewritten.`);
    } catch (error) {
      fail(error);
    }
  }

  /** Clicking a step reads it. It never moves the cursor, and it never opens a locked plate. */
  async function openStep(number) {
    if (!state.run) return null;
    try {
      const result = await api.runPeek(state.run.id, number);
      if (result.ok === false) {
        setOut(el.detail, result.reason);
        announce(result.reason);
        return result;
      }
      setOut(
        el.detail,
        [
          `Step ${result.step.number} — ${result.step.action || ""}`,
          result.step.body,
          result.step.toolRequired ? `Tool: ${result.step.toolRequired}` : "Hands only",
          ...(result.step.warnings || []).map((w) => `Watch out: ${w}`),
          result.step.fittings?.length
            ? `Free fittings for this step: ${result.step.fittings
                .map((f) => `${f.name} (${f.articleNumber})`)
                .join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      drawScheme(result.step);
      return result;
    } catch (error) {
      return fail(error);
    }
  }

  async function stuckOnStep() {
    if (!state.run) return null;
    try {
      const result = await api.runStuck(state.run.id, el.brokenNote?.value || "I cannot do this step");
      if (result.ok === false) return announce(result.reason);
      setOut(
        el.detail,
        [
          result.detail,
          result.fittingsNote,
          ...(result.fittings || []).map((f) => `• ${f.name} — article ${f.articleNumber} (free)`),
        ]
          .filter(Boolean)
          .join("\n"),
      );
      announce(`Still on step ${result.stillOnStep}. Slow version is on the right.`);
      return result;
    } catch (error) {
      return fail(error);
    }
  }

  async function colorizePlate() {
    if (!state.run) return null;
    try {
      const result = await api.colorize(state.run.cursor);
      drawFrame({
        caption: state.frames[Math.max(0, state.frameIndex - 1)]?.caption || state.step?.body,
        colorized: true,
      });
      setOut(
        el.detail,
        ["COLORIZED PLATE", ...(result.fills || []).map((f) => `${f.name} ${f.color} ${f.texture}`), result.note]
          .filter(Boolean)
          .join("\n"),
      );
      announce(result.note || "Plate painted with catalog materials.");
      return result;
    } catch (error) {
      return fail(error);
    }
  }

  async function attachBroken() {
    if (!state.run) return null;
    try {
      state.broken = await api.broken(
        state.run.cursor,
        el.brokenNote?.value || "",
        el.brokenPhoto?.files?.[0]?.name || "broken.jpg",
      );
      setOut(
        el.spareOut,
        [
          `Break on step ${state.broken.step}`,
          state.broken.identified,
          state.broken.fix ? `Fix: ${state.broken.fix}` : "",
          state.broken.spare ? `Catalog stand-in: ${state.broken.spare.name} $${state.broken.spare.cost}` : "",
          "Now request the fitting — IKEA does not charge for it.",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      announce("Break attached to this step.");
      return state.broken;
    } catch (error) {
      return fail(error);
    }
  }

  async function requestFittings() {
    if (!api.spare) return null;
    try {
      const result = await api.spare({
        runId: state.run?.id,
        stepNumber: state.run?.cursor,
        articleNumber: el.spareArticle?.value || "",
        qty: Number(el.spareQty?.value || 1),
        note: el.brokenNote?.value || "",
        photoName: el.brokenPhoto?.files?.[0]?.name || "",
        contact: { name: el.spareName?.value || "", email: el.spareEmail?.value || "" },
      });
      const request = result.request || {};
      const letter = result.letter || {};
      const goToStore = Boolean(letter.storeVisit || result.classification?.storeVisit);
      setOut(
        el.spareOut,
        goToStore
          ? [
              "NO PART NUMBER — go to the store",
              letter.message || result.classification?.reason,
              request.channel?.name ? `Spare parts desk: ${request.channel.name}` : "IKEA spare parts desk in store",
              request.channel?.url || "",
            ]
          : [
              result.free ? "FREE OF CHARGE — assembly fitting" : "CHARGEABLE — this is a component, not a fitting",
              result.classification?.reason,
              ...(request.fittings || []).map((f) => `• ${f.qty}× ${f.name} — article ${f.articleNumber}`),
              request.channel ? `Send it via: ${request.channel.name} — ${request.channel.url}` : "",
              request.channel?.note,
              "",
              request.message,
              "",
              request.sentNote,
            ]
              .filter(Boolean)
              .join("\n"),
      );
      announce(
        goToStore
          ? "No part number — take the photo to the IKEA store."
          : result.free
            ? "Free fittings request drafted."
            : "That part is chargeable — details on the right.",
      );
      return result;
    } catch (error) {
      return fail(error);
    }
  }

  function addChatLine(author, message) {
    if (!el.chatLog) return;
    const line = document.createElement("div");
    line.textContent = `${author}: ${message}`;
    el.chatLog.append(line);
    el.chatLog.scrollTop = el.chatLog.scrollHeight;
  }

  async function sendChat(event) {
    event?.preventDefault();
    const message = el.chatInput?.value?.trim();
    if (!message) return null;
    const files = [...(el.chatFiles?.files || [])].map((f) => f.name);
    el.chatInput.value = "";
    addChatLine("you", files.length ? `${message} [${files.join(", ")}]` : message);
    try {
      const reply = await api.chat(
        files.length ? `${message}\nAttached: ${files.join(", ")}` : message,
        { step: state.run?.cursor, mode: state.mode },
      );
      const desk =
        reply?.backend === "gliner-2-standin"
          ? "GLiNER 2"
          : reply?.escalated
            ? `${reply.agent?.name || "shop"} (escalated)`
            : reply?.agent?.name || "shop";
      addChatLine(desk, reply?.text || "");
      return reply;
    } catch (error) {
      addChatLine("shop", error?.message || "Chat failed");
      return null;
    }
  }

  async function regenerateStep() {
    if (!state.run) {
      announce("Parse a guide first.");
      return null;
    }
    const extra = el.extraContext?.value || "";
    const media = [...(el.extraMedia?.files || [])].map((f) => f.name);
    announce(
      media.length || extra
        ? "Regenerating this step with your extra context…"
        : "Replaying the film for this step…",
    );
    return playCurrent();
  }

  // --------------------------------------------------------------------- wiring

  listen(el.officialMode, "click", () => {
    setMode("official");
    announce("Search an IKEA product. LACK is unlocked; the rest of the catalog is waiting.");
  });
  listen(el.openOfficial, "click", startOfficial);
  listen(el.product, "change", startOfficial);
  listen(el.productSearch, "input", () => renderProductHits(el.productSearch.value));
  listen(el.productHits, "click", (event) => {
    const row = event.target.closest("[data-article]");
    if (row) pickProduct(row.dataset.article);
  });
  listen(el.customMode, "click", () => {
    setMode("custom");
    restoreCustom();
    announce("Paste a guide or drop a file, then parse it. This one you can edit and skip.");
  });
  listen(el.parse, "click", parseCustom);
  listen(el.clear, "click", clearCustomSession);
  listen(el.studioBack, "click", backToInput);
  listen(el.tabInstructions, "click", () => setResultsTab("instructions"));
  listen(el.tabMaterial, "click", () => setResultsTab("material"));
  listen(el.guideFile, "change", (event) => ingestFiles(event.target.files));
  listen(el.drop, "dragover", (event) => {
    event.preventDefault();
    el.drop?.classList.add("drag");
  });
  listen(el.drop, "dragleave", () => el.drop?.classList.remove("drag"));
  listen(el.drop, "drop", (event) => {
    event.preventDefault();
    el.drop?.classList.remove("drag");
    ingestFiles(event.dataTransfer?.files);
  });
  listen(el.steps, "click", (event) => {
    if (event.target.isContentEditable) return;
    const row = event.target.closest("[data-step]");
    if (row) openStep(Number(row.dataset.step));
  });
  listen(el.confirm, "change", () => {
    if (el.next) el.next.disabled = !(el.confirm.checked || !state.run?.locked) || !state.watched;
  });
  listen(el.next, "click", nextStep);
  listen(el.back, "click", backStep);
  listen(el.skip, "click", skipStep);
  listen(el.stuck, "click", stuckOnStep);
  listen(el.colorize, "click", colorizePlate);
  listen(el.render, "click", () => playCurrent());
  listen(el.seeGuide, "click", toggleActualGuide);
  listen(el.regenerate, "click", regenerateStep);
  listen(el.broken, "click", attachBroken);
  listen(el.spare, "click", requestFittings);
  listen(el.chatForm, "submit", sendChat);

  setMode("official");
  setStudioView("input");
  fillProducts();

  return {
    state,
    startOfficial,
    parseCustom,
    nextStep,
    backStep,
    skipStep,
    openStep,
    stuckOnStep,
    colorizePlate,
    attachBroken,
    requestFittings,
    clearCustomSession,
    replay: playCurrent,
    destroy() {
      state.destroyed = true;
      stopPlayback();
      for (const off of listeners.splice(0)) off();
    },
  };
}
