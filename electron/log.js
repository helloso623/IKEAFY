/** Pull Chromium console-message text from Electron 43's event object or the older (level, message) args. */
export function rendererConsoleText(event, level, message) {
  if (event && typeof event.message === "string") return event.message;
  if (typeof message === "string") return message;
  if (typeof level === "string" && !/^(verbose|info|warning|error|debug|\d+)$/i.test(level)) return level;
  return "";
}
