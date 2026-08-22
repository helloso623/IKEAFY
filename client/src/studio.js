/**
 * IKEAlive watch: a Seedance 2.5 reel of every step, driven by Back / Play-Stop / Next.
 * Click a step in #steps or the scrub list to jump there. Upload (or Start)
 * builds the reel; this UI plays it.
 */

import { isPdfFile, pagesFromPdf } from "./pdf-guide.js";
import { bindVoice } from "./voice.js";
import { ikealiveLog, ikealiveWarn } from "./log.js";

const CUSTOM_SESSION_KEY = "ikeafy.custom-session";
const FAL_REQUIRED =
  "Set FAL_KEY for ByteDance Seedance 2.5 films. The watch reel is a live MP4, not a canvas storyboard.";
const FAL_IMAGE_REQUIRED =
  "Set FAL_KEY for Flux Schnell instruction stills. Image mode is a live plate, not a canvas table drawing.";
const STILL_MS = 4000;

const first = (...selectors) => selectors.map((s) => document.querySelector(s)).find(Boolean) || null;

function text(value) {
  return value == null ? "" : String(value);
}

export function initStudio({ api, hud = () => {} } = {}) {
  if (!api) throw new Error("initStudio requires an api client");

  const el = {
    officialMode: first("#official-mode", "[data-studio-mode='official']"),
    customMode: first("#custom-mode", "[data-studio-mode='custom']"),
    officialSource: first("#official-source"),
    customSource: first("#custom-source"),
    product: first("#official-product"),
    notes: first("#guide-notes"),
    parse: first("#parse-guide"),
    clear: first("#clear-custom-session"),
    lockBanner: first("#lock-banner"),
    steps: first("#steps"),
    bom: first("#bom"),
    reviews: first("#reviews"),
    film: first("#film"),
    frame: first("#film-frame"),
    video: first("#film-video"),
    still: first("#film-still"),
    caption: first("#film-caption"),
    play: first("#film-play"),
    next: first("#film-wait"),
    back: first("#film-back"),
    confirm: first("#step-confirm"),
    confirmLabel: first("#step-confirm-label"),
    skip: first("#step-skip"),
    stuck: first("#film-stuck"),
    colorize: first("#colorize"),
    render: first("#render-video"),
    scrub: first("#film-scrub"),
    renderOut: first("#render-video-out"),
    filmStatus: first("#film-status"),
    progress: first("#upload-progress"),
    pdf: first("#pdf-upload"),
    pdfName: first("#pdf-name"),
    pdfDrop: first("#pdf-drop", ".upload-drop"),
    productName: first("#product-name"),
    productLookup: first("#product-lookup"),
    uploadForm: first("#upload-form"),
    renderModes: first("#render-modes"),
    renderModeVideo: first("#render-mode-video"),
    renderModeImages: first("#render-mode-images"),
    renderModeScene: first("#render-mode-scene"),
    detail: first("#step-detail", "#inspect"),
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
    voice: first("#ikea-voice"),
    voiceStatus: first("#ikea-voice-status"),
  };

  const listeners = [];
  const state = {
    mode: "official",
    run: null,
    step: null,
    outline: [],
    guide: null,
    reel: [],
    clipIndex: 0,
    frames: [],
    frameIndex: 0,
    playing: 0,
    playingOn: false,
    playGen: 0,
    reelToken: 0,
    timer: null,
    watched: false,
    broken: null,
    submitting: false,
    destroyed: false,
    renderMode: null,
  };

  function listen(node, event, handler) {
    if (!node) return;
    node.addEventListener(event, handler);
    listeners.push(() => node.removeEventListener(event, handler));
  }

  function announce(message) {
    hud(text(message));
    if (el.progress) el.progress.textContent = text(message);
  }

  function setBusy(on) {
    state.submitting = Boolean(on);
    if (el.parse) {
      el.parse.disabled = state.submitting;
      el.parse.textContent = state.submitting ? "Getting…" : "Get the Reel";
    }
  }

  function showFilmStatus(message) {
    if (el.filmStatus) {
      el.filmStatus.textContent = message || "";
      el.filmStatus.classList.toggle("hidden", !message);
    }
    if (message) setOut(el.renderOut, message);
  }

  function fail(error) {
    announce(error?.message || error || "The studio could not do that.");
    return null;
  }

  function setOut(node, value) {
    if (node) node.textContent = text(value);
  }

  // ---------------------------------------------------------------- source mode

  function setInterface(name) {
    const next = name === "watch" ? "watch" : "upload";
    if (typeof window.setIkealiveInterface === "function") {
      window.setIkealiveInterface(next);
      return;
    }
    document.getElementById("app")?.setAttribute("data-interface", next);
  }

  function normalizeRenderMode(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "video") return "video";
    if (raw === "images" || raw === "image") return "images";
    if (raw === "scene" || raw === "3d") return "scene";
    return null;
  }

  function syncRenderModeUi() {
    const mode = normalizeRenderMode(state.renderMode);
    const app = document.getElementById("app");
    if (mode) app?.setAttribute("data-render-mode", mode);
    else app?.removeAttribute("data-render-mode");
    for (const btn of document.querySelectorAll("button[data-render-mode]")) {
      const on = btn.getAttribute("data-render-mode") === mode;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", String(on));
    }
  }

  function hasGuideSource() {
    return Boolean(el.pdf?.files?.[0] || String(el.productName?.value || "").trim());
  }

  async function chooseRenderMode(value) {
    const mode = normalizeRenderMode(value);
    if (!mode) return null;
    state.renderMode = mode;
    syncRenderModeUi();
    ikealiveLog("render", "mode chosen", { mode });
    try {
      if (state.submitting) return mode;
      if (state.run) return startChosenRender();
      if (hasGuideSource()) return parseCustom();
      announce("Drop a PDF or type a product name, then get the reel.");
      return mode;
    } catch (error) {
      return fail(error);
    }
  }

  async function afterGuideReady() {
    const mode = normalizeRenderMode(state.renderMode || state.run?.renderMode);
    if (!mode) {
      announce("Choose video, image, or 3D instructions.");
      return null;
    }
    state.renderMode = mode;
    syncRenderModeUi();
    return startChosenRender();
  }

  async function startChosenRender() {
    const mode = normalizeRenderMode(state.renderMode || state.run?.renderMode);
    if (!mode || !state.run) return null;
    state.renderMode = mode;
    syncRenderModeUi();
    setInterface("watch");
    el.film?.classList.remove("hidden");
    let posted = null;
    if (api.render) {
      posted = await api.render({
        mode,
        renderMode: mode,
        runId: state.run.id,
      });
      if (posted?.ok === false) return fail(new Error(posted.reason));
    }
    if (mode !== "video") {
      if (mode === "images") {
        announce("Rendering Flux Schnell stills…");
        await bootImageReel();
        if (state.reel.some((clip) => clip.imageUrl)) {
          announce("Stills ready. Watch the first step.");
        }
        return state.run;
      }
      const reason = "3D engine instructions are not implemented yet.";
      hideVideo();
      showFilmStatus(reason);
      announce(reason);
      ikealiveLog("render", "unimplemented", { mode, reason });
      return posted;
    }
    announce("Rendering Seedance 2.5…");
    await bootReel();
    if (state.reel.some((clip) => clip.videoUrl)) {
      announce("Reel ready. Watch the first step.");
    }
    return state.run;
  }

  function setMode(mode) {
    state.mode = mode === "custom" ? "custom" : "official";
    const official = state.mode === "official";
    el.officialMode?.classList.toggle("on", official);
    el.customMode?.classList.toggle("on", !official);
    el.officialMode?.setAttribute("aria-pressed", String(official));
    el.customMode?.setAttribute("aria-pressed", String(!official));
    const uploading = document.getElementById("app")?.dataset.interface === "upload";
    if (uploading) {
      el.officialSource?.classList.remove("hidden");
      el.customSource?.classList.remove("hidden");
    } else {
      el.officialSource?.classList.toggle("hidden", !official);
      el.customSource?.classList.toggle("hidden", official);
    }
    document.getElementById("app")?.setAttribute("data-guide-mode", state.mode);
  }

  function showPdfName(file) {
    if (el.pdfName) el.pdfName.textContent = file?.name || "";
  }

  function fileFromPdfBase64(base64, filename) {
    const binary = atob(String(base64 || ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], filename || "ikea-manual.pdf", { type: "application/pdf" });
  }

  function attachPdfFile(file) {
    if (!file || !el.pdf) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    el.pdf.files = transfer.files;
    showPdfName(file);
  }

  async function fetchNamedManual() {
    if (!api.lookupManual) return null;
    const name = String(el.productName?.value || "").trim();
    if (!name) {
      announce("Type an IKEA product name.");
      return null;
    }
    announce(`Looking up “${name}” with Tavily…`);
    ikealiveLog("tavily", "lookup", { productName: name });
    const found = await api.lookupManual(name);
    if (!found?.ok || !found.pdfBase64) {
      ikealiveLog("tavily", "no pdf", {
        partner: found?.partner || null,
        catalog: (found?.catalog || []).map((row) => row.id),
        reason: found?.reason || null,
      });
      announce(found?.reason || "Could not find that manual.");
      return null;
    }
    const file = fileFromPdfBase64(found.pdfBase64, found.filename);
    attachPdfFile(file);
    ikealiveLog("tavily", "pdf attached", {
      filename: file.name,
      bytes: found.bytes || file.size,
      url: found.pdfUrl || null,
    });
    announce(`Found ${file.name}. Reading the plates…`);
    return file;
  }

  async function lookupProductManual() {
    if (state.submitting) return null;
    try {
      const file = await fetchNamedManual();
      if (!file) return null;
      return parseCustom();
    } catch (error) {
      ikealiveWarn("tavily", "lookup failed", error?.message || error);
      return fail(error);
    }
  }

  async function fillProducts() {
    if (!el.product || !api.officialProducts) return;
    try {
      const { products = [] } = await api.officialProducts();
      el.product.replaceChildren();
      for (const product of products) {
        const option = document.createElement("option");
        option.value = product.article;
        option.textContent = `${product.name} ${product.size || ""} — article ${product.article}`.trim();
        el.product.append(option);
      }
      if (!products.length) {
        const option = document.createElement("option");
        option.textContent = "No official sheet transcribed yet";
        option.disabled = true;
        el.product.append(option);
      }
    } catch (error) {
      fail(error);
    }
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

  function currentStepNumber() {
    return state.reel[state.clipIndex]?.number || state.run?.cursor || 1;
  }

  function clipCaption(clip) {
    return clip?.frames?.[1]?.caption || clip?.frames?.[0]?.caption || "";
  }

  function renderSteps() {
    if (!el.steps) return;
    el.steps.replaceChildren();
    const editable = state.run ? state.run.canEdit : false;
    el.steps.dataset.editable = String(editable);
    el.steps.dataset.jump = String(Boolean(state.reel.length));
    const active = currentStepNumber();

    for (const item of state.outline) {
      const row = document.createElement("div");
      row.className = "item";
      row.dataset.step = String(item.number);
      row.classList.toggle("active", item.number === active);
      row.classList.toggle("locked", Boolean(item.locked) && !state.reel.length);
      row.classList.toggle("done", item.state === "done");

      const clip = state.reel.find((entry) => entry.number === item.number);
      const body = document.createElement("span");
      body.textContent = item.readable
        ? `${item.number}. ${item.action ? `${item.action} — ` : ""}${item.body || ""}`
        : `${item.number}. ${clipCaption(clip) || item.preview || "In the reel."}`;
      if (editable && item.readable) {
        body.contentEditable = "true";
        body.setAttribute("role", "textbox");
        body.addEventListener("blur", () => saveStepEdit(item, body));
      }
      row.append(body);

      const meta = document.createElement("small");
      meta.textContent = item.confirmed ? "done" : item.toolRequired || "jump";
      row.append(meta);
      el.steps.append(row);
    }
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

    const group = (label, lines, withShops = false) => {
      const wrap = document.createElement("div");
      wrap.className = "bom-group";
      const title = document.createElement("strong");
      title.textContent = label;
      wrap.append(title);
      if (!lines.length) {
        const empty = document.createElement("p");
        empty.textContent = "None listed.";
        wrap.append(empty);
        el.bom.append(wrap);
        return;
      }
      for (const line of lines) {
        const row = document.createElement("p");
        const shops = withShops ? line.retailers || line.offers || [] : [];
        row.textContent = `${line.qty || 1}× ${line.name}${line.why ? ` — ${line.why}` : ""}`;
        wrap.append(row);
        if (shops.length) {
          const list = document.createElement("div");
          list.className = "offers";
          for (const offer of shops.slice(0, 4)) {
            const link = document.createElement("a");
            link.href = offer.url || "#";
            link.target = "_blank";
            link.rel = "noreferrer";
            link.textContent = offer.store || "Shop";
            list.append(link);
          }
          wrap.append(list);
        }
      }
      el.bom.append(wrap);
    };

    group("Kit", bom.included || []);
    group("You have this", bom.owned || []);
    group("To purchase", bom.extra || [], true);
    if (bom.total != null) {
      const total = document.createElement("p");
      total.textContent = `List total $${bom.total}`;
      el.bom.append(total);
    }
  }

  async function renderReviews() {
    if (!el.reviews || !api.reviews) return;
    try {
      const groups = (await api.reviews()) || [];
      el.reviews.replaceChildren();
      for (const group of groups) {
        for (const review of group.reviews || []) {
          const line = document.createElement("div");
          const title = document.createElement("strong");
          title.textContent = `Step ${group.step} · ${review.difficulty}`;
          const body = document.createElement("p");
          body.textContent = review.text;
          line.append(title, body);
          el.reviews.append(line);
        }
      }
    } catch (error) {
      fail(error);
    }
  }

  function renderTransport() {
    const last = Math.max(0, state.reel.length - 1);
    if (el.back) el.back.disabled = !state.reel.length || state.clipIndex <= 0;
    if (el.next) el.next.disabled = !state.reel.length || state.clipIndex >= last;
    if (el.play) {
      el.play.disabled = !state.reel.length;
      el.play.textContent = state.playingOn ? "Stop" : "Play";
      el.play.setAttribute("aria-pressed", String(Boolean(state.playingOn)));
    }
    renderScrub();
  }

  function renderScrub() {
    if (!el.scrub) return;
    el.scrub.replaceChildren();
    for (const [index, clip] of state.reel.entries()) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = String(clip.number);
      btn.dataset.step = String(clip.number);
      btn.dataset.clip = String(index);
      btn.title = clipCaption(clip) || `Step ${clip.number}`;
      if (index === state.clipIndex) btn.setAttribute("aria-current", "true");
      el.scrub.append(btn);
    }
  }

  function renderFittings() {
    const fittings = state.step?.fittings || [];
    if (!el.spareArticle) return;
    el.spareArticle.placeholder = fittings.length
      ? `Fitting no. — this step uses ${fittings.map((f) => f.articleNumber).join(", ")}`
      : "Part number";
  }

  // -------------------------------------------------------------------- the run

  function applyView(view) {
    if (!view || view.ok === false) return view;
    state.run = view.run || state.run;
    state.step = view.step || null;
    state.outline = view.outline || [];
    state.guide = view.guide || state.guide;
    renderLockBanner();
    renderSteps();
    renderBom();
    renderTransport();
    renderFittings();
    return view;
  }

  async function startOfficial() {
    try {
      setMode("official");
      announce("Opening the official sheet…");
      ikealiveLog("assembly", "official start", { article: el.product?.value || "304.499.08" });
      const view = await api.runStart({
        mode: "official",
        article: el.product?.value || undefined,
        renderMode: state.renderMode || undefined,
      });
      if (view.ok === false) return fail(new Error(view.reason));
      applyView(view);
      await renderReviews();
      ikealiveLog("assembly", "official run ready", { runId: view.run?.id, steps: view.outline?.length || 0 });
      await afterGuideReady();
      return view;
    } catch (error) {
      return fail(error);
    }
  }

  async function parseCustom(event) {
    event?.preventDefault();
    if (state.submitting) return null;
    setBusy(true);
    try {
      setMode("custom");
      let file = el.pdf?.files?.[0] || null;
      if (!file && String(el.productName?.value || "").trim()) {
        file = await fetchNamedManual();
      }
      let images = [];
      if (file) {
        showPdfName(file);
        announce("Reading the PDF plates…");
        ikealiveLog("parse", "rasterize", { name: file.name, type: file.type, bytes: file.size });
        if (!isPdfFile(file)) {
          return fail(new Error("Drop a PDF — IKEA manuals are drawings, not plain text."));
        }
        try {
          const plates = await pagesFromPdf(file);
          images = plates.images || [];
          ikealiveLog("parse", "plates", {
            name: file.name,
            pageCount: plates.pageCount,
            usedPages: plates.usedPages,
            imageCount: images.length,
          });
        } catch (error) {
          ikealiveWarn("parse", "rasterize failed", error?.message || error);
          return fail(new Error(error?.message || "Could not read that PDF as plates."));
        }
        if (!images.length) {
          return fail(new Error("That PDF has no readable plates."));
        }
      }
      if (!images.length) {
        announce("Drop a PDF or type an IKEA product name first.");
        return null;
      }
      announce("Reading the plates with vision…");
      ikealiveLog("assembly", "start", { plates: images.length, notes: Boolean(el.notes?.value) });
      const view = await api.runStart({
        mode: "custom",
        instructions: el.notes?.value || "",
        images,
        renderMode: state.renderMode || undefined,
      });
      if (view.ok === false) return fail(new Error(view.reason));
      applyView(view);
      saveCustom();
      await renderReviews();
      ikealiveLog("assembly", "run ready", { runId: view.run?.id, steps: view.outline?.length || 0 });
      await afterGuideReady();
      return view;
    } catch (error) {
      return fail(error);
    } finally {
      setBusy(false);
    }
  }

  function saveCustom() {
    if (state.mode !== "custom") return;
    try {
      localStorage.setItem(
        CUSTOM_SESSION_KEY,
        JSON.stringify({ notes: el.notes?.value || "" }),
      );
    } catch {
      // Storage is unavailable in private windows; the session just will not persist.
    }
  }

  function restoreCustom() {
    try {
      const saved = JSON.parse(localStorage.getItem(CUSTOM_SESSION_KEY) || "null");
      if (!saved) return false;
      if (el.notes) el.notes.value = saved.notes || "";
      return true;
    } catch {
      return false;
    }
  }

  function clearCustomSession() {
    setMode("custom");
    stopPlayback();
    state.run = null;
    state.step = null;
    state.outline = [];
    state.guide = null;
    state.reel = [];
    state.clipIndex = 0;
    state.frameIndex = 0;
    state.renderMode = null;
    syncRenderModeUi();
    if (el.notes) el.notes.value = "";
    for (const node of [el.steps, el.bom, el.reviews, el.caption, el.detail, el.spareOut, el.scrub]) {
      if (node) node.replaceChildren();
    }
    hideVideo();
    el.film?.classList.add("hidden");
    renderTransport();
    try {
      localStorage.removeItem(CUSTOM_SESSION_KEY);
    } catch {
      // Nothing to clear when storage is unavailable.
    }
    renderLockBanner();
    announce("Custom session deleted.");
  }

  // ------------------------------------------------------------------- playback

  function hideStill() {
    if (el.still) {
      el.still.removeAttribute("src");
      el.still.alt = "";
      el.still.classList.add("hidden");
    }
  }

  function hideVideo() {
    if (el.video) {
      el.video.pause();
      el.video.removeAttribute("src");
      el.video.load();
      el.video.classList.add("hidden");
    }
    hideStill();
    el.frame?.classList.add("hidden");
  }

  function stopPlayback({ keepFrame = false } = {}) {
    state.playGen += 1;
    state.playingOn = false;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    if (el.video && !el.video.classList.contains("hidden")) el.video.pause();
    if (!keepFrame) hideVideo();
    renderTransport();
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

    // Contact shadow.
    ctx.save();
    ctx.filter = "blur(5px)";
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(centerX + 8, objectY + topDepthY + legHeight + 10, topWidth * 0.58, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Four legs are simple outlined cuboids: clear enough to assemble, spare
    // enough to match IKEA's line-language.
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

    // Exploded plates show dashed travel arrows without changing the assembly.
    if (explode > 0.015) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.4;
      for (const x of [topLeft + 28, topLeft + topWidth - 10]) {
        const arrowTop = topY + topDepthY + topThickness + 6;
        const arrowBottom = objectY + topDepthY - 5;
        line(x, arrowTop, x, arrowBottom, 1.4, ink);
        ctx.setLineDash([]);
        polygon(
          [
            [x - 4, arrowBottom - 6],
            [x, arrowBottom],
            [x + 4, arrowBottom - 6],
          ],
          ink,
          null,
        );
        ctx.setLineDash([5, 5]);
      }
      ctx.restore();
    }

    // Table top: top, front edge, then right edge preserves one readable
    // construction order across all camera values.
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

    // Small manual callouts identify the repeat parts without crowding the plate.
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
    ctx.fillStyle = ink;
    ctx.fillRect(0, h - cardHeight, 2, cardHeight);

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
  }

  function clipFromPlan(step) {
    return {
      number: Number(step?.number) || 0,
      frames: [],
      videoUrl: step?.videoUrl || null,
      provider: step?.provider || "seedance-2.5",
    };
  }

  function clipsFromOutline() {
    const images = normalizeRenderMode(state.renderMode) === "images";
    return (state.outline || []).map((item) => ({
      number: item.number,
      frames: [],
      videoUrl: null,
      imageUrl: null,
      provider: images ? "flux-schnell" : "seedance-2.5",
    }));
  }

  async function falIsLive() {
    if (!api.health) return false;
    try {
      const health = await api.health();
      return Boolean(health?.video?.live || health?.image?.live);
    } catch {
      return false;
    }
  }

  async function renderClipVideo(clip) {
    if (!clip || !api.renderVideo || !state.run) {
      ikealiveWarn("video", "render skipped", { step: clip?.number || null, hasRun: Boolean(state.run) });
      throw new Error(FAL_REQUIRED);
    }
    ikealiveLog("video", "render step", { runId: state.run.id, step: clip.number, renderMode: "video" });
    const result = await api.renderVideo({
      runId: state.run.id,
      stepNumber: clip.number,
      renderMode: "video",
    });
    clip.videoUrl = result.videoUrl || null;
    clip.provider = result.provider || clip.provider;
    if (!clip.videoUrl) {
      ikealiveWarn("video", "no video url", { step: clip.number, error: result.error || result.reason || FAL_REQUIRED });
      throw new Error(result.error || result.reason || FAL_REQUIRED);
    }
    ikealiveLog("video", "step ready", { step: clip.number, videoUrl: clip.videoUrl, provider: clip.provider });
    return clip;
  }

  async function renderClipImage(clip) {
    if (!clip || !api.renderImage || !state.run) {
      ikealiveWarn("image", "render skipped", { step: clip?.number || null, hasRun: Boolean(state.run) });
      throw new Error(FAL_IMAGE_REQUIRED);
    }
    ikealiveLog("image", "render step", { runId: state.run.id, step: clip.number, renderMode: "images" });
    const result = await api.renderImage({
      runId: state.run.id,
      stepNumber: clip.number,
      renderMode: "images",
    });
    clip.imageUrl = result.imageUrl || null;
    clip.provider = result.provider || clip.provider;
    if (!clip.imageUrl) {
      ikealiveWarn("image", "no image url", { step: clip.number, error: result.error || result.reason || FAL_IMAGE_REQUIRED });
      throw new Error(result.error || result.reason || FAL_IMAGE_REQUIRED);
    }
    ikealiveLog("image", "url", { step: clip.number, imageUrl: clip.imageUrl, provider: clip.provider });
    return clip;
  }

  async function upgradeReel(clips) {
    if (!api.renderVideo || !state.run) return;
    const token = ++state.reelToken;
    let live = 0;
    for (const clip of clips) {
      if (state.destroyed || token !== state.reelToken) return;
      if (clip.videoUrl) {
        live += 1;
        continue;
      }
      try {
        const status = `Rendering Seedance 2.5 · step ${clip.number} of ${clips.length}…`;
        announce(status);
        if (!state.reel[state.clipIndex]?.videoUrl) showFilmStatus(status);
        await renderClipVideo(clip);
        live += 1;
        setOut(el.renderOut, `Seedance 2.5 · ${live}/${clips.length} films`);
        if (currentStepNumber() === clip.number) showClip(state.clipIndex, { play: state.playingOn, restart: false });
      } catch (error) {
        fail(error);
        showFilmStatus(error?.message || FAL_REQUIRED);
        return;
      }
    }
  }

  async function bootReel() {
    if (!state.run) return;
    stopPlayback();
    el.film?.classList.remove("hidden");
    hideVideo();
    state.reel = clipsFromOutline();
    state.clipIndex = Math.max(
      0,
      state.reel.findIndex((clip) => clip.number === state.run.cursor),
    );
    if (state.clipIndex < 0) state.clipIndex = 0;
    state.frameIndex = 0;
    renderSteps();
    renderTransport();
    showFilmStatus("Rendering Seedance 2.5…");

    if (!(await falIsLive())) {
      showFilmStatus(FAL_REQUIRED);
      announce(FAL_REQUIRED);
      ikealiveWarn("video", "fal not live — reel is not a canvas storyboard");
      return;
    }

    const first = state.reel[state.clipIndex];
    try {
      if (first) {
        announce(`Rendering Seedance 2.5 · step ${first.number}…`);
        showFilmStatus(`Rendering Seedance 2.5 · step ${first.number}…`);
        await renderClipVideo(first);
      }
    } catch (error) {
      fail(error);
      showFilmStatus(error?.message || FAL_REQUIRED);
      return;
    }

    showClip(state.clipIndex, { play: true, restart: true });
    if (state.reel.some((clip) => !clip.videoUrl)) upgradeReel(state.reel);
  }

  async function upgradeImageReel(clips) {
    if (!api.renderImage || !state.run) return;
    const token = ++state.reelToken;
    let live = 0;
    for (const clip of clips) {
      if (state.destroyed || token !== state.reelToken) return;
      if (clip.imageUrl) {
        live += 1;
        continue;
      }
      try {
        const status = `Rendering Flux Schnell · step ${clip.number} of ${clips.length}…`;
        announce(status);
        if (!state.reel[state.clipIndex]?.imageUrl) showFilmStatus(status);
        await renderClipImage(clip);
        live += 1;
        setOut(el.renderOut, `Flux Schnell · ${live}/${clips.length} stills`);
        if (currentStepNumber() === clip.number) showClip(state.clipIndex, { play: state.playingOn, restart: false });
      } catch (error) {
        fail(error);
        showFilmStatus(error?.message || FAL_IMAGE_REQUIRED);
        return;
      }
    }
  }

  async function bootImageReel() {
    if (!state.run) return;
    stopPlayback();
    el.film?.classList.remove("hidden");
    hideVideo();
    state.reel = clipsFromOutline();
    state.clipIndex = Math.max(
      0,
      state.reel.findIndex((clip) => clip.number === state.run.cursor),
    );
    if (state.clipIndex < 0) state.clipIndex = 0;
    state.frameIndex = 0;
    renderSteps();
    renderTransport();
    showFilmStatus("Rendering Flux Schnell stills…");

    if (!(await falIsLive())) {
      showFilmStatus(FAL_IMAGE_REQUIRED);
      announce(FAL_IMAGE_REQUIRED);
      ikealiveWarn("image", "fal not live — stills are not a canvas table");
      return;
    }

    const first = state.reel[state.clipIndex];
    try {
      if (first) {
        announce(`Rendering Flux Schnell · step ${first.number}…`);
        showFilmStatus(`Rendering Flux Schnell · step ${first.number}…`);
        await renderClipImage(first);
      }
    } catch (error) {
      fail(error);
      showFilmStatus(error?.message || FAL_IMAGE_REQUIRED);
      return;
    }

    showClip(state.clipIndex, { play: true, restart: true });
    if (state.reel.some((clip) => !clip.imageUrl)) upgradeImageReel(state.reel);
  }

  function showVideo(url, { play = false } = {}) {
    if (!el.video || !url) return false;
    el.frame?.classList.add("hidden");
    hideStill();
    showFilmStatus("");
    el.video.classList.remove("hidden");
    if (el.video.src !== url) {
      el.video.src = url;
      el.video.currentTime = 0;
    }
    if (play) {
      const playAttempt = el.video.play();
      if (playAttempt?.catch) playAttempt.catch(() => {});
    } else {
      el.video.pause();
    }
    return true;
  }

  function showStill(url, { number } = {}) {
    if (!el.still || !url) return false;
    el.frame?.classList.add("hidden");
    if (el.video) {
      el.video.pause();
      el.video.classList.add("hidden");
    }
    showFilmStatus("");
    el.still.classList.remove("hidden");
    el.still.alt = number ? `Step ${number} assembly still` : "Assembly still";
    if (el.still.getAttribute("src") !== url) el.still.src = url;
    return true;
  }

  function showClip(index, { play = false, restart = true } = {}) {
    if (!state.reel.length) return;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    state.clipIndex = Math.max(0, Math.min(index, state.reel.length - 1));
    const clip = state.reel[state.clipIndex];
    if (restart) state.frameIndex = 0;
    state.playingOn = Boolean(play);
    const outline = state.outline.find((item) => item.number === clip.number);
    if (outline) {
      state.step = {
        ...(state.step || {}),
        number: outline.number,
        action: outline.action,
        body: outline.body || clipCaption(clip),
        toolRequired: outline.toolRequired,
      };
    }
    setOut(el.caption, clipCaption(clip) || state.step?.body || `Step ${clip.number}`);
    renderSteps();
    renderTransport();

    const images = normalizeRenderMode(state.renderMode) === "images";
    if (images) {
      if (clip.imageUrl && showStill(clip.imageUrl, { number: clip.number })) {
        if (play) {
          state.timer = setTimeout(() => finishClip(), STILL_MS);
        }
        return;
      }
      hideVideo();
      showFilmStatus(
        play
          ? `Rendering Flux Schnell · step ${clip.number}…`
          : `No Flux still for step ${clip.number} yet.`,
      );
      return;
    }

    if (clip.videoUrl && showVideo(clip.videoUrl, { play })) {
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
      return;
    }

    hideVideo();
    showFilmStatus(
      play
        ? `Rendering Seedance 2.5 · step ${clip.number}…`
        : `No Seedance film for step ${clip.number} yet.`,
    );
  }

  function finishClip() {
    if (!state.playingOn) return;
    if (state.clipIndex >= state.reel.length - 1) {
      stopPlayback({ keepFrame: true });
      announce("End of the reel.");
      return;
    }
    showClip(state.clipIndex + 1, { play: true, restart: true });
  }

  function togglePlay() {
    if (!state.reel.length) return;
    if (state.playingOn) {
      stopPlayback({ keepFrame: true });
      announce("Stopped.");
      return;
    }
    state.playGen += 1;
    state.playingOn = true;
    renderTransport();
    showClip(state.clipIndex, { play: true, restart: false });
    announce(`Playing step ${currentStepNumber()}.`);
  }

  function goToClip(index, { play = state.playingOn } = {}) {
    if (!state.reel.length) return null;
    const next = Math.max(0, Math.min(index, state.reel.length - 1));
    state.playGen += 1;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    if (!play) state.playingOn = false;
    showClip(next, { play, restart: true });
    return state.reel[next];
  }

  // ------------------------------------------------------------------- controls

  async function nextStep() {
    if (!state.reel.length) return null;
    if (state.clipIndex >= state.reel.length - 1) {
      stopPlayback({ keepFrame: true });
      announce("End of the reel.");
      return null;
    }
    const clip = goToClip(state.clipIndex + 1);
    announce(`Step ${clip.number}.`);
    return clip;
  }

  async function backStep() {
    if (!state.reel.length) return null;
    if (state.clipIndex <= 0) {
      announce("Already at the first step.");
      return null;
    }
    const clip = goToClip(state.clipIndex - 1);
    announce(`Back to step ${clip.number}.`);
    return clip;
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
      const index = state.reel.findIndex((clip) => clip.number === result.run?.cursor);
      goToClip(index >= 0 ? index : state.clipIndex + 1);
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

  /** Jump the reel to a step. One click in #steps or the scrub list. */
  async function openStep(number) {
    const target = Number(number);
    if (!target) return null;
    const index = state.reel.findIndex((clip) => clip.number === target);
    if (index >= 0) {
      const clip = goToClip(index);
      const outline = state.outline.find((item) => item.number === target);
      setOut(
        el.detail,
        [
          `Step ${target}${outline?.action ? ` — ${outline.action}` : ""}`,
          outline?.body || clipCaption(clip),
          outline?.toolRequired ? `Tool: ${outline.toolRequired}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      announce(`Jumped to step ${target}.`);
      return clip;
    }
    if (!state.run) return null;
    try {
      const result = await api.runPeek(state.run.id, target);
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
        ]
          .filter(Boolean)
          .join("\n"),
      );
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
        stepNumber: currentStepNumber(),
        articleNumber: el.spareArticle?.value || "",
        qty: Number(el.spareQty?.value || 1),
        note: el.brokenNote?.value || "",
        photoName: el.brokenPhoto?.files?.[0]?.name || "",
        contact: { name: el.spareName?.value || "", email: el.spareEmail?.value || "" },
      });
      const request = result.request || {};
      setOut(
        el.spareOut,
        [
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
      announce(result.free ? "Free fittings request drafted." : "That part is chargeable — details on the right.");
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

  async function applyStudioActions(actions) {
    for (const action of actions || []) {
      if (action?.type !== "studio") continue;
      ikealiveLog("voice", "studio action", action.action);
      if (action.action === "start") await parseCustom();
      else if (action.action === "official") await startOfficial();
      else if (action.action === "next") await nextStep();
      else if (action.action === "back") await backStep();
      else if (action.action === "play") togglePlay();
      else if (action.action === "spare") await requestFittings();
      else if (action.action === "clear") {
        if (el.pdf) el.pdf.value = "";
        if (el.productName) el.productName.value = "";
        showPdfName(null);
        clearCustomSession();
        setInterface("upload");
      }
    }
  }

  async function sendChat(event) {
    event?.preventDefault();
    const message = el.chatInput?.value?.trim();
    if (!message) return null;
    el.chatInput.value = "";
    addChatLine("you", message);
    try {
      const reply = await api.chat(message, { step: currentStepNumber(), mode: state.mode });
      addChatLine(reply?.agent?.name || "shop", reply?.text || "");
      if (typeof window.__ikeafyApplyShop === "function") await window.__ikeafyApplyShop(reply.actions);
      else await applyStudioActions(reply.actions);
      return reply;
    } catch (error) {
      addChatLine("shop", error?.message || "Chat failed");
      return null;
    }
  }

  // --------------------------------------------------------------------- wiring

  listen(el.officialMode, "click", startOfficial);
  listen(el.customMode, "click", () => {
    setMode("custom");
    restoreCustom();
    announce("Drop a PDF or type a product name, then get the reel.");
  });
  listen(el.uploadForm, "submit", parseCustom);
  listen(el.parse, "click", parseCustom);
  listen(el.renderModes, "click", (event) => {
    const btn = event.target.closest("button[data-render-mode]");
    if (btn) chooseRenderMode(btn.getAttribute("data-render-mode"));
  });
  listen(el.productLookup, "click", lookupProductManual);
  listen(el.pdf, "change", () => {
    const file = el.pdf?.files?.[0] || null;
    showPdfName(file);
    if (file) parseCustom();
  });
  listen(el.pdfDrop, "dragover", (event) => {
    event.preventDefault();
    el.pdfDrop.classList.add("drag");
  });
  listen(el.pdfDrop, "dragleave", () => el.pdfDrop.classList.remove("drag"));
  listen(el.pdfDrop, "drop", (event) => {
    event.preventDefault();
    el.pdfDrop.classList.remove("drag");
    const file = [...(event.dataTransfer?.files || [])].find(
      (item) => item.type === "application/pdf" || /\.pdf$/i.test(item.name),
    );
    if (!file || !el.pdf) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    el.pdf.files = transfer.files;
    showPdfName(file);
    parseCustom();
  });
  listen(el.clear, "click", () => {
    if (el.pdf) el.pdf.value = "";
    if (el.productName) el.productName.value = "";
    showPdfName(null);
    clearCustomSession();
    setInterface("upload");
  });
  listen(el.steps, "click", (event) => {
    if (event.target.isContentEditable) return;
    const row = event.target.closest("[data-step]");
    if (row) openStep(Number(row.dataset.step));
  });
  listen(el.scrub, "click", (event) => {
    const tick = event.target.closest("[data-step]");
    if (tick) openStep(Number(tick.dataset.step));
  });
  listen(el.play, "click", togglePlay);
  listen(el.next, "click", nextStep);
  listen(el.back, "click", backStep);
  listen(el.video, "ended", () => {
    if (state.playingOn) finishClip();
  });
  listen(el.broken, "click", attachBroken);
  listen(el.spare, "click", requestFittings);
  listen(el.chatForm, "submit", sendChat);
  bindVoice({
    button: el.voice,
    status: el.voiceStatus,
    input: el.chatInput,
    onHear: (text) => {
      if (el.chatInput) el.chatInput.value = text;
      sendChat();
    },
  });

  setMode("custom");
  setInterface("upload");
  fillProducts();

  return {
    state,
    setInterface,
    startOfficial,
    parseCustom,
    chooseRenderMode,
    lookupProductManual,
    applyActions: applyStudioActions,
    nextStep,
    backStep,
    skipStep,
    openStep,
    togglePlay,
    jumpToStep: openStep,
    stuckOnStep,
    attachBroken,
    requestFittings,
    clearCustomSession,
    replay() {
      return normalizeRenderMode(state.renderMode) === "images" ? bootImageReel() : bootReel();
    },
    destroy() {
      state.destroyed = true;
      stopPlayback();
      for (const off of listeners.splice(0)) off();
    },
  };
}
