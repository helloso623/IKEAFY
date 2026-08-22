function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function sourceLinks(line) {
  return (line.sources || [])
    .map((source) => {
      const url = safeUrl(source.url);
      return url ? `<a href="${escapeHtml(url)}">${escapeHtml(source.store || "Source")}</a>` : "";
    })
    .filter(Boolean)
    .join(" · ");
}

export function buildPacketHtml(packet = {}) {
  const bom = packet.bom || {};
  const lines = bom.lines || [];
  const steps = packet.assembly?.guide?.steps || [];
  const live = bom.liveSources || [];
  const rows = lines
    .map(
      (line) => `<tr>
        <td>${escapeHtml(line.qty)}</td>
        <td><strong>${escapeHtml(line.name)}</strong><small>${escapeHtml(line.why)}</small></td>
        <td>${escapeHtml(line.dimensions)}<small>${escapeHtml(line.shape)}</small></td>
        <td>$${Number(line.estimatedCost || 0).toFixed(2)}</td>
        <td>${sourceLinks(line)}</td>
      </tr>`,
    )
    .join("");
  const stepRows = steps
    .map((step) => `<li><strong>${escapeHtml(step.action || "assemble")}</strong> ${escapeHtml(step.body)}</li>`)
    .join("");
  const liveRows = live
    .map((source) => {
      const url = safeUrl(source.url);
      return url
        ? `<li><a href="${escapeHtml(url)}">${escapeHtml(source.title || source.store || url)}</a>${
            source.note ? ` — ${escapeHtml(source.note)}` : ""
          }</li>`
        : "";
    })
    .filter(Boolean)
    .join("");
  const match = bom.ikeaMatch
    ? `<p class="match"><strong>IKEA dimension match:</strong> ${escapeHtml(bom.ikeaMatch.name)}
       · article ${escapeHtml(bom.ikeaMatch.article)} ·
       <a href="${escapeHtml(safeUrl(bom.ikeaMatch.url))}">official search</a><br>
       ${escapeHtml(bom.ikeaMatch.note)}</p>`
    : `<p class="match">No IKEA article matched the modeled dimensions closely enough.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(packet.pdf?.filename || `${bom.name || "Furniture"} hardware BOM`)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #171717; font: 10pt/1.4 Arial, sans-serif; }
    h1 { margin: 0 0 2mm; font-size: 22pt; }
    h2 { margin: 8mm 0 3mm; font-size: 14pt; }
    .kicker { color: #585858; text-transform: uppercase; letter-spacing: .08em; }
    .match { padding: 3mm; border-left: 4px solid #ffda1a; background: #f7f7f2; }
    table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
    th, td { padding: 2.5mm; border-bottom: 1px solid #ccc; text-align: left; vertical-align: top; }
    th { background: #efefea; }
    tr { page-break-inside: avoid; }
    small { display: block; margin-top: 1mm; color: #555; }
    a { color: #174ea6; overflow-wrap: anywhere; }
    li { margin-bottom: 2mm; }
    .warning { margin-top: 7mm; padding-top: 3mm; border-top: 1px solid #777; font-weight: bold; }
    .meta { display: flex; justify-content: space-between; color: #555; }
  </style>
</head>
<body>
  <p class="kicker">IKEAlive build packet · hardware only</p>
  <h1>${escapeHtml(bom.name || "Custom furniture")}</h1>
  <div class="meta"><span>${escapeHtml(bom.scope || "")}</span><span>Estimated hardware: $${Number(
    bom.estimatedTotal || 0,
  ).toFixed(2)} ${escapeHtml(bom.currency || "USD")}</span></div>
  ${match}
  <h2>Bill of materials</h2>
  <table>
    <thead><tr><th>Qty</th><th>Component</th><th>Shape / size</th><th>Estimate</th><th>Legal source links</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${liveRows ? `<h2>Live search results</h2><ul>${liveRows}</ul>` : ""}
  <h2>Custom IKEAlive steps</h2>
  <ol>${stepRows}</ol>
  <p class="warning">${escapeHtml(bom.disclaimer || "")}</p>
</body>
</html>`;
}

export function openBuildPacketPrint(packet, printWindow = null) {
  const target = printWindow || window.open("", "_blank");
  if (!target) throw new Error("Allow pop-ups so IKEAlive can open the hardware BOM for PDF printing.");
  target.document.open();
  target.document.write(buildPacketHtml(packet));
  target.document.close();
  target.focus();
  target.setTimeout(() => target.print(), 80);
  return target;
}
