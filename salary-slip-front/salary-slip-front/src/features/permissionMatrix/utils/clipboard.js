/**
 * Copy text, including where the async Clipboard API is unavailable.
 *
 * `navigator.clipboard` only exists in a secure context. This HRMS is served
 * over plain http on the LAN, so on the deployment that matters the API is
 * undefined and an optional-chained call silently does nothing — a menu item
 * that looks like it worked and did not. The execCommand path is deprecated but
 * it is what actually functions there.
 *
 * @returns {Promise<boolean>} whether the text reached the clipboard
 */
export async function copyText(text) {
  if (!text) return false;

  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through — permission refused or the API is blocked by policy.
    }
  }

  try {
    const holder = document.createElement("textarea");
    holder.value = text;
    holder.setAttribute("readonly", "");
    holder.style.position = "fixed";
    holder.style.opacity = "0";
    document.body.appendChild(holder);
    holder.select();

    const copied = document.execCommand("copy");
    document.body.removeChild(holder);

    return copied;
  } catch {
    return false;
  }
}

export default copyText;
