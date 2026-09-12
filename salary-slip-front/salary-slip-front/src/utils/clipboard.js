/**
 * Robust copy-to-clipboard utility that works across all environments:
 * - HTTPS (Modern Navigator Clipboard API)
 * - Localhost
 * - HTTP / Local Network IP (e.g., http://192.168.x.x) via reliable execCommand fallback
 *
 * @param {string} text - The text to copy
 * @returns {Promise<boolean>} whether copying succeeded
 */
export async function copyToClipboard(text) {
  if (text == null || text === "") return false;
  const str = String(text);

  // 1. Try Modern Clipboard API if available and in secure context
  if (typeof window !== "undefined" && window.isSecureContext && navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(str);
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  // 2. Fallback via hidden textarea & execCommand
  try {
    const textArea = document.createElement("textarea");
    textArea.value = str;

    // Prevent scrolling and ensure element is offscreen but active
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.width = "2em";
    textArea.style.height = "2em";
    textArea.style.padding = "0";
    textArea.style.border = "none";
    textArea.style.outline = "none";
    textArea.style.boxShadow = "none";
    textArea.style.background = "transparent";
    textArea.style.opacity = "0";
    textArea.setAttribute("readonly", "");

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, str.length);

    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return Boolean(successful);
  } catch (err) {
    console.error("Failed to copy to clipboard:", err);
    return false;
  }
}

export default copyToClipboard;
