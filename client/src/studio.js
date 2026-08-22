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

import { isPdfFile, pagesFromPdf, PDF_PAGE_LIMIT } from "./pdf-guide.js";

const CUSTOM_SESSION_KEY = "ikeafy.custom-session";

const PROGRESS_BEATS = [
  { id: "parse", label: "Parsing the building guide into steps (Pioneer / GLiNER 2)" },
  { id: "film", label: "Generating a tutorial film for each step (Seedance 2.5)" },
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
    video: first("#film-video"),
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
    tag.className = badge === "included" ? "tag included" : badge === "owned" ? "tag owned" : "tag purchase";
    tag.textContent = badge === "included" ? "included" : badge === "owned" ? "you have this" : "to purchase";
    title.append(" ", tag);
    body.append(title);
    if (line.ikeaArticle) {
      const art = document.createElement("p");
      art.className = "hint";
      art.textContent = `Article ${line.ikeaArticle}`;
      body.append(art);
    }
    if (line.why) {
      const why = document.createElement("p");
      why.className = "hint";
      why.textContent = line.why;
      body.append(why);
    }
    const offers = line.retailers || line.offers || [];
    if (badge !== "included" && badge !== "owned" && (offers.length || line.storeUrl)) {
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
    if (bom.live) {
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent = "Missing tools: live shop links from Tavily.";
      el.bom.append(note);
    }
    for (const line of bom.included || []) el.bom.append(materialCard(line, "included"));
    for (const line of bom.owned || []) el.bom.append(materialCard(line, "owned"));
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

    const parts = step?.partsUsed?.length ? step.partsUsed : ["panel"];
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
      const images = state.attachments
        .filter((file) => file.dataUrl)
        .slice(0, PDF_PAGE_LIMIT)
        .map((file) => ({ name: file.name, type: file.type, dataUrl: file.dataUrl }));
      if (!raw.trim() && !images.length && !state.attachments.length) {
        announce("Paste a guide or drop a file first.");
        return null;
      }
      if (!raw.trim() && !images.length) {
        announce("Drop a photo or PDF of the guide, or paste the steps as text.");
        return null;
      }
      announce("Turning your guide into a film…");
      const view = await runWithProgress(() =>
        api.runStart({
          mode: "custom",
          guide: raw,
          instructions: el.notes?.value || "",
          images,
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

  function readDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Could not read file"));
      reader.readAsDataURL(file);
    });
  }

  function isGuideImage(file) {
    return Boolean(file?.type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(file?.name || ""));
  }

  async function ingestFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const maxImages = PDF_PAGE_LIMIT;
    const maxBytes = 800 * 1024;
    for (const file of files) {
      if (isPdfFile(file)) {
        try {
          announce(`Reading plates from ${file.name}…`);
          const result = await pagesFromPdf(file);
          if (!result.images.length) {
            announce(`${file.name} had no readable plates. Paste the steps as text.`);
            state.attachments.push({ name: file.name, type: file.type || "application/pdf", size: file.size });
            continue;
          }
          for (const image of result.images) {
            state.attachments.push({
              name: image.name,
              type: image.type,
              size: image.dataUrl.length,
              dataUrl: image.dataUrl,
            });
          }
          if (result.text && el.guide) {
            el.guide.value = [el.guide.value, result.text].filter(Boolean).join("\n\n");
          }
          announce(
            `${file.name}: ${result.usedPages} of ${result.pageCount} plate${
              result.pageCount === 1 ? "" : "s"
            } ready to parse.`,
          );
        } catch (error) {
          announce(`Could not read ${file.name}. ${error?.message || "Try photos or paste the steps."}`);
          state.attachments.push({ name: file.name, type: file.type || "application/pdf", size: file.size });
        }
        continue;
      }
      const attachment = { name: file.name, type: file.type || "", size: file.size };
      if (isGuideImage(file)) {
        const already = state.attachments.filter((item) => item.dataUrl).length;
        if (already >= maxImages) {
          announce("Up to eight plates — extra images are listed but not sent.");
        } else if (file.size > maxBytes) {
          announce(`${file.name} is too large to send (max ~800KB).`);
        } else {
          try {
            attachment.dataUrl = await readDataUrl(file);
          } catch {
            announce(`Could not read ${file.name}.`);
          }
        }
      }
      state.attachments.push(attachment);
      if (file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name)) {
        const body = await file.text();
        if (el.guide) el.guide.value = [el.guide.value, body].filter(Boolean).join("\n\n");
      }
    }
    renderGuideFiles();
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
    if (el.video) {
      el.video.pause();
      el.video.removeAttribute("src");
      el.video.load();
      el.video.onended = null;
      el.video.onerror = null;
      el.video.classList.add("hidden");
    }
    el.frame?.classList.remove("hidden");
  }

  function drawTablePlate({
    polygon,
    line,
    label,
    birch,
    birchEdge,
    ink,
    colorized,
    explode,
    topLeft,
    topWidth,
    topDepthX,
    topDepthY,
    topY,
    topThickness,
    objectY,
    legHeight,
    legWidth,
  }) {
    const legs = [
      [topLeft + 12, objectY + topDepthY],
      [topLeft + topDepthX + 18, objectY + topDepthY * 1.82],
      [topLeft + topWidth - 18, objectY + topDepthY * 1.82],
      [topLeft + topWidth + topDepthX - 20, objectY + topDepthY],
    ];
    for (const [x, y] of legs) {
      polygon(
        [
          [x, y],
          [x + legWidth, y],
          [x + legWidth, y + legHeight],
          [x, y + legHeight],
        ],
        birch,
      );
      polygon(
        [
          [x + legWidth, y],
          [x + legWidth + 5, y - 3],
          [x + legWidth + 5, y + legHeight - 3],
          [x + legWidth, y + legHeight],
        ],
        birchEdge,
      );
    }
    if (explode > 0.015) {
      for (const x of [topLeft + 28, topLeft + topWidth - 10]) {
        const arrowTop = topY + topDepthY + topThickness + 6;
        const arrowBottom = objectY + topDepthY - 5;
        line(x, arrowTop, x, arrowBottom, 1.4, ink);
        polygon(
          [
            [x - 4, arrowBottom - 6],
            [x, arrowBottom],
            [x + 4, arrowBottom - 6],
          ],
          ink,
          null,
        );
      }
    }
    polygon(
      [
        [topLeft, topY],
        [topLeft + topWidth, topY],
        [topLeft + topWidth + topDepthX, topY + topDepthY],
        [topLeft + topDepthX, topY + topDepthY],
      ],
      birch,
      ink,
      1.8,
    );
    polygon(
      [
        [topLeft + topDepthX, topY + topDepthY],
        [topLeft + topWidth + topDepthX, topY + topDepthY],
        [topLeft + topWidth + topDepthX, topY + topDepthY + topThickness],
        [topLeft + topDepthX, topY + topDepthY + topThickness],
      ],
      birchEdge,
    );
    polygon(
      [
        [topLeft + topWidth, topY],
        [topLeft + topWidth + topDepthX, topY + topDepthY],
        [topLeft + topWidth + topDepthX, topY + topDepthY + topThickness],
        [topLeft + topWidth, topY + topThickness],
      ],
      colorized ? "#c7955a" : "#e8e6de",
    );
    label("1", topLeft + topDepthX * 0.45, topY - 17);
    line(topLeft + topDepthX * 0.45, topY - 6, topLeft + topDepthX, topY + 4, 1, ink);
    label("4×", topLeft + topWidth + topDepthX + 30, objectY + topDepthY + legHeight * 0.55);
    line(
      topLeft + topWidth + topDepthX + 19,
      objectY + topDepthY + legHeight * 0.55,
      topLeft + topWidth + topDepthX - 1,
      objectY + topDepthY + legHeight * 0.6,
      1,
      ink,
    );
  }

  function drawCabinetPlate({
    polygon,
    line,
    label,
    birch,
    birchEdge,
    ink,
    explode,
    centerX,
    objectY,
    zoom,
    usableBottom,
    kind,
  }) {
    const caseW = Math.min(160, usableBottom * 0.42) * zoom;
    const caseH = Math.min(200, usableBottom * 0.58) * zoom;
    const depth = 22 * zoom;
    const lift = explode * 36;
    const x = centerX - caseW / 2;
    const y = objectY - caseH * 0.35 - lift;
    polygon(
      [
        [x, y],
        [x + caseW, y],
        [x + caseW, y + caseH],
        [x, y + caseH],
      ],
      birch,
      ink,
      1.8,
    );
    polygon(
      [
        [x + caseW, y],
        [x + caseW + depth, y - depth * 0.45],
        [x + caseW + depth, y + caseH - depth * 0.45],
        [x + caseW, y + caseH],
      ],
      birchEdge,
    );
    polygon(
      [
        [x, y],
        [x + caseW, y],
        [x + caseW + depth, y - depth * 0.45],
        [x + depth, y - depth * 0.45],
      ],
      birch,
    );
    const shelves = kind === "bookcase" ? 3 : 2;
    for (let i = 1; i <= shelves; i += 1) {
      const shelfY = y + (caseH * i) / (shelves + 1);
      line(x + 6, shelfY, x + caseW - 6, shelfY, 1.4, ink);
    }
    label("1", x - 18, y + 14);
    line(x - 8, y + 14, x + 8, y + 10, 1, ink);
    label(`${shelves}×`, x + caseW + depth + 18, y + caseH * 0.45);
  }

  function drawFrame(frame = {}) {
    const canvas = el.frame;
    if (!canvas?.getContext) {
      setOut(canvas, frame.caption);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = Math.max(320, canvas.clientWidth || 720);
    const h = Math.max(220, canvas.clientHeight || 280);
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const colorized = Boolean(frame.colorized);
    const ink = "#25231f";
    const paper = colorized ? "#f2e5ca" : "#f7f5ee";
    const wall = colorized ? "#ead7b4" : "#efeee8";
    const floor = colorized ? "#c69b63" : "#dedcd4";
    const birch = colorized ? "#e7c98f" : "#fbfaf6";
    const birchEdge = colorized ? "#bd8952" : "#e0ded6";
    const shadow = colorized ? "rgba(79, 50, 24, .17)" : "rgba(37, 35, 31, .09)";
    const camera = frame.camera || {};
    const zoom = Math.max(0.88, Math.min(1.16, Number(camera.zoom) || 1));
    const azimuth = Math.max(30, Math.min(60, Number(camera.az) || 42));
    const depthX = 24 + ((azimuth - 30) / 30) * 18;
    const depthY = 13 + ((Number(camera.el) || 26) / 28) * 8;
    const explode = Math.max(0, Math.min(0.35, Number(frame.explode) || 0));
    const caption = text(frame.caption).trim() || "Follow the plate, then confirm the step.";

    const polygon = (points, fill, stroke = ink, lineWidth = 1.5) => {
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (const point of points.slice(1)) ctx.lineTo(point[0], point[1]);
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = "round";
        ctx.stroke();
      }
    };
    const line = (x1, y1, x2, y2, width = 1, stroke = ink) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    const label = (value, x, y) => {
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fillStyle = "#fffdf7";
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.font = "700 10px ui-monospace, SFMono-Regular, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(value, x, y + 0.5);
    };

    // A single quiet birch workshop anchors every plate, while the object keeps
    // the same elevated three-quarter projection as the storyboard camera moves.
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, h);
    const horizon = Math.max(105, h * 0.43);
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, horizon);
    ctx.fillStyle = floor;
    ctx.fillRect(0, horizon, w, h - horizon);

    ctx.save();
    ctx.globalAlpha = colorized ? 0.32 : 0.19;
    ctx.strokeStyle = colorized ? "#8b653d" : "#9b9991";
    ctx.lineWidth = 0.7;
    for (let y = horizon + 18; y < h; y += 19) line(0, y, w, y, 0.7, ctx.strokeStyle);
    for (let x = -w; x < w * 2; x += 54) line(w / 2, horizon, x, h, 0.7, ctx.strokeStyle);
    ctx.restore();

    // Workshop landmarks stay deliberately faint so this reads as a manual,
    // not a room illustration.
    ctx.save();
    ctx.globalAlpha = colorized ? 0.52 : 0.3;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(23, 27, 112, 56);
    for (let x = 34; x < 129; x += 15) {
      for (let y = 37; y < 77; y += 13) {
        ctx.beginPath();
        ctx.arc(x, y, 1.1, 0, Math.PI * 2);
        ctx.fillStyle = ink;
        ctx.fill();
      }
    }
    line(w - 136, horizon - 40, w - 22, horizon - 40, 2, ink);
    line(w - 126, horizon - 40, w - 126, horizon, 2, ink);
    line(w - 32, horizon - 40, w - 32, horizon, 2, ink);
    ctx.restore();

    const cardHeight = Math.min(82, Math.max(66, h * 0.25));
    const usableBottom = h - cardHeight;
    const centerX = w * 0.52;
    const objectY = Math.max(92, usableBottom * 0.34);
    const topWidth = Math.min(w * 0.4, 300) * zoom;
    const topDepthX = depthX * zoom;
    const topDepthY = depthY * zoom;
    const topLift = explode * Math.min(150, h * 0.48);
    const topLeft = centerX - topWidth / 2;
    const topY = objectY - topLift;
    const topThickness = Math.max(10, 13 * zoom);
    const legHeight = Math.min(usableBottom * 0.39, 102) * zoom;
    const legWidth = Math.max(11, 14 * zoom);
    const kind = frame.kind || "table";

    ctx.save();
    ctx.filter = "blur(5px)";
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(centerX + 8, objectY + topDepthY + legHeight + 10, topWidth * 0.58, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (kind === "table") {
      drawTablePlate({
        polygon,
        line,
        label,
        birch,
        birchEdge,
        ink,
        colorized,
        explode,
        topLeft,
        topWidth,
        topDepthX,
        topDepthY,
        topY,
        topThickness,
        objectY,
        legHeight,
        legWidth,
      });
    } else {
      drawCabinetPlate({
        polygon,
        line,
        label,
        birch,
        birchEdge,
        ink,
        explode,
        centerX,
        objectY,
        zoom,
        usableBottom,
        kind,
      });
    }

    ctx.fillStyle = ink;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.font = "700 9px ui-monospace, SFMono-Regular, monospace";
    ctx.fillText(colorized ? "BIRCH WORKSHOP · MATERIAL VIEW" : "BIRCH WORKSHOP · ASSEMBLY VIEW", w - 18, 20);

    // Caption card remains legible at narrow sizes and gives every frame the
    // same hierarchy: plate number, instruction, then progress.
    ctx.fillStyle = colorized ? "rgba(255, 252, 243, .96)" : "rgba(255, 255, 252, .96)";
    ctx.fillRect(0, h - cardHeight, w, cardHeight);
    line(0, h - cardHeight, w, h - cardHeight, 1.5, ink);
    ctx.fillStyle = "#ffda1a";
    ctx.fillRect(0, h - cardHeight, 8, cardHeight);

    const plate = Math.max(1, Number(frame.frame) + 1 || 1);
    ctx.fillStyle = ink;
    ctx.textAlign = "left";
    ctx.font = "700 10px ui-monospace, SFMono-Regular, monospace";
    ctx.fillText(`PLATE ${String(plate).padStart(2, "0")}`, 22, h - cardHeight + 20);

    const words = caption.split(/\s+/);
    const lines = [];
    let current = "";
    const captionWidth = Math.max(200, w - 145);
    ctx.font = `600 ${w < 520 ? 15 : 17}px Newsreader, Georgia, serif`;
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(candidate).width > captionWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    ctx.fillStyle = ink;
    ctx.font = `600 ${w < 520 ? 15 : 17}px Newsreader, Georgia, serif`;
    lines.slice(0, 2).forEach((value, index) => {
      const clipped = index === 1 && lines.length > 2 ? `${value.replace(/[.,;:]?$/, "")}…` : value;
      ctx.fillText(clipped, 22, h - cardHeight + 42 + index * 19);
    });

    ctx.textAlign = "right";
    ctx.font = "700 9px ui-monospace, SFMono-Regular, monospace";
    ctx.fillText(colorized ? "CATALOG COLOUR" : "LINE PLATE", w - 18, h - 16);
    ctx.textAlign = "left";
    drawScheme(state.step);
  }

  async function loadFrames() {
    if (!api.renderVideo || !state.run) return { frames: [], videoUrl: null };
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
          ? `${result.model} via fal.ai — live step film`
          : `${result.provider} · local canvas storyboard (set FAL_KEY for ${result.model})`,
      );
      return {
        frames: result.frames || result.plan || [],
        videoUrl: result.videoUrl || null,
        caption: state.step?.body || "",
      };
    } catch (error) {
      fail(error);
      return { frames: [], videoUrl: null };
    }
  }

  function playLiveVideo(url, caption, token) {
    if (!el.video) return false;
    el.frame?.classList.add("hidden");
    el.video.classList.remove("hidden");
    el.video.src = url;
    setOut(el.caption, caption || state.step?.body);
    drawScheme(state.step);
    const done = () => {
      if (state.destroyed || token !== state.playing) return;
      finishFrames();
    };
    el.video.onended = done;
    el.video.onerror = () => {
      if (state.destroyed || token !== state.playing) return;
      el.video.classList.add("hidden");
      el.frame?.classList.remove("hidden");
      if (state.frames.length) playStoryboard(token);
      else done();
    };
    const play = el.video.play();
    if (play && typeof play.catch === "function") play.catch(() => {});
    return true;
  }

  function playStoryboard(token) {
    el.video?.classList.add("hidden");
    el.frame?.classList.remove("hidden");
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

  async function playCurrent() {
    if (!state.run) return;
    stopPlayback();
    const token = state.playing;
    el.film?.classList.remove("hidden");
    const loaded = await loadFrames();
    if (state.destroyed || token !== state.playing) return;
    state.frames = loaded.frames || [];
    state.frameIndex = 0;
    state.watched = false;
    renderConfirm();
    if (loaded.videoUrl && playLiveVideo(loaded.videoUrl, loaded.caption, token)) return;
    playStoryboard(token);
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
