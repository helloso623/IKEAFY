export function preferredPhoneUrl(link = {}) {
  return String(
    link.url ||
      link.lanUrl ||
      link.urls?.[0] ||
      link.apiUrl ||
      "",
  ).trim();
}

export function lanFallbackUrl(link = {}, primary = preferredPhoneUrl(link)) {
  const candidates = [link.lanUrl, ...(link.urls || []), link.apiUrl].filter(Boolean);
  return String(
    candidates.find((candidate) => {
      if (candidate === primary) return false;
      try {
        return Boolean(new URL(candidate).hostname);
      } catch {
        return false;
      }
    }) || "",
  );
}

export async function copyPhoneUrl(
  input,
  {
    clipboard = globalThis.navigator?.clipboard,
    documentRef = globalThis.document,
  } = {},
) {
  const value = String(input?.value || input?.textContent || "").trim();
  if (!value) throw new Error("No phone URL is ready yet.");
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(value);
      return value;
    } catch {
      // HTTP LAN pages often deny Clipboard API; the selected-input path below still works.
    }
  }
  input?.focus?.();
  input?.select?.();
  input?.setSelectionRange?.(0, value.length);
  if (!documentRef?.execCommand?.("copy")) {
    throw new Error("Select the URL and copy it manually.");
  }
  return value;
}
