const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => HTML_ESCAPE_MAP[char],
  );
}

export function safeImageSrc(value) {
  const url = String(value ?? "").trim();
  if (!url) return "";
  try {
    const parsed = new URL(url, window.location.origin);
    if (["http:", "https:", "data:"].includes(parsed.protocol)) {
      return url;
    }
  } catch {
    return "";
  }
  return "";
}
