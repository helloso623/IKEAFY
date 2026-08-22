/**
 * Turn a dropped building-guide PDF into the same payload as photos:
 * extracted text (when the file has any) plus JPEG plates of the first pages.
 *
 * IKEA manuals are usually drawings, so the plates matter more than the text.
 */

export const PDF_PAGE_LIMIT = 8;

export function isPdfFile(file) {
  if (!file) return false;
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "");
  return type === "application/pdf" || type === "application/x-pdf" || /\.pdf$/i.test(name);
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  return pdfjs;
}

function pageTextFrom(content) {
  return (content?.items || [])
    .map((item) => String(item.str || "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function pagesFromPdf(file, { maxPages = PDF_PAGE_LIMIT, maxDim = 1024 } = {}) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const usedPages = Math.min(pdf.numPages, maxPages);
  const images = [];
  const textParts = [];

  for (let pageNumber = 1; pageNumber <= usedPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const extracted = pageTextFrom(await page.getTextContent());
    if (extracted) textParts.push(`Page ${pageNumber}: ${extracted}`);

    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(maxDim / base.width, maxDim / base.height, 1.4);
    const viewport = page.getViewport({ scale: Math.max(0.6, scale) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) continue;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    images.push({
      name: `${file.name} p${pageNumber}`,
      type: "image/jpeg",
      dataUrl: canvas.toDataURL("image/jpeg", 0.72),
    });
  }

  const header =
    pdf.numPages > usedPages
      ? `${file.name}: ${pdf.numPages} pages; the first ${usedPages} plates were read.`
      : `${file.name}: ${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}.`;

  return {
    images,
    text: [header, ...textParts].filter(Boolean).join("\n"),
    pageCount: pdf.numPages,
    usedPages,
  };
}
