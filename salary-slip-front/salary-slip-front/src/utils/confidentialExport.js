import { confidentialExportApi } from "./api";

/**
 * Fail-closed orchestration for exports that carry a complete Aadhaar number.
 *
 * Every function here either returns a server-approved result or throws. There is
 * no partial success and no degraded path: if authorisation cannot be obtained —
 * refused, expired, timed out, network down, response malformed — the caller must
 * abandon the export entirely rather than fall back to producing the document
 * anyway. The previous implementation fired the recheck and ignored the outcome,
 * which meant a revoked permission still printed.
 *
 * Masked exports never come through here. They need no authorisation because
 * they disclose nothing beyond what the list already shows.
 */

export const EXPORT_TYPE = {
  PRINT: "PRINT",
  PDF: "PDF",
};

/** Shown whenever a confidential export is abandoned, for any reason. */
export const CONFIDENTIAL_EXPORT_FAILED_MESSAGE =
  "Confidential export could not be authorized. The document was not printed or downloaded.";

/** Wall-clock ceiling on each request, so a hanging server fails closed too. */
const REQUEST_TIMEOUT_MS = 15000;

class ConfidentialExportError extends Error {
  constructor(reason, cause) {
    super(CONFIDENTIAL_EXPORT_FAILED_MESSAGE);
    this.name = "ConfidentialExportError";
    // Kept for logging and tests; the user-facing string is deliberately the
    // same for every reason so a refusal cannot be probed for detail.
    this.reason = reason;
    this.status = cause?.status;
    this.code = cause?.code ?? cause?.data?.error?.code;
  }
}

export function isConfidentialExportError(error) {
  return error instanceof ConfidentialExportError;
}

/**
 * Reject rather than hang. A request that never settles is indistinguishable
 * from a refusal as far as the export is concerned, so it has to be treated as
 * one — otherwise the UI sits on a spinner and the user retries by pressing
 * Print again.
 */
function withTimeout(promise, reason) {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new ConfidentialExportError(reason)),
      REQUEST_TIMEOUT_MS,
    );
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Obtain a fresh, single-purpose authorization for one export.
 *
 * The response is validated before it is trusted: a 200 carrying no token, the
 * wrong export type, or an already-past expiry is a malformed answer, and
 * treating it as approval would defeat the point of asking.
 */
export async function authoriseConfidentialExport({
  id,
  exportType,
  accessToken,
  tokenType,
  surface = "appointments",
}) {
  if (!id || !exportType) {
    throw new ConfidentialExportError("MISSING_TARGET");
  }

  let response;

  try {
    response = await withTimeout(
      confidentialExportApi.authorize(id, exportType, accessToken, tokenType, surface),
      "AUTHORIZATION_TIMEOUT",
    );
  } catch (error) {
    if (isConfidentialExportError(error)) throw error;

    // 401, 403, 404, 503, a network error, or a thrown non-JSON response — all
    // of them mean the export is not authorised.
    throw new ConfidentialExportError("AUTHORIZATION_REFUSED", error);
  }

  const data = response?.data;
  const token = data?.exportToken;

  if (typeof token !== "string" || token.length === 0) {
    throw new ConfidentialExportError("AUTHORIZATION_MALFORMED");
  }

  if (data?.exportType !== exportType) {
    throw new ConfidentialExportError("AUTHORIZATION_TYPE_MISMATCH");
  }

  const expiresAt = data?.expiresAt ? new Date(data.expiresAt) : null;

  if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
    throw new ConfidentialExportError("AUTHORIZATION_MALFORMED");
  }

  if (expiresAt.getTime() <= Date.now()) {
    throw new ConfidentialExportError("AUTHORIZATION_EXPIRED");
  }

  return {
    exportAuthorizationId: data.exportAuthorizationId,
    exportToken: token,
    exportType: data.exportType,
    expiresAt,
    exportReference: data.exportReference,
  };
}

/**
 * The print view model, from the server.
 *
 * The full number in the printed output comes from this response and nowhere
 * else — not from the details fetch made when the modal opened, and certainly not
 * from text scraped out of the visible page.
 */
export async function fetchConfidentialPrintPayload({
  id,
  exportToken,
  accessToken,
  tokenType,
  surface = "appointments",
}) {
  let response;

  try {
    response = await withTimeout(
      confidentialExportApi.printPayload(id, exportToken, accessToken, tokenType, surface),
      "PRINT_PAYLOAD_TIMEOUT",
    );
  } catch (error) {
    if (isConfidentialExportError(error)) throw error;

    throw new ConfidentialExportError("PRINT_PAYLOAD_REFUSED", error);
  }

  const data = response?.data;

  // Twelve digits or nothing. A masked or truncated value here would silently
  // produce a "confidential" printout with no confidential content in it.
  if (!/^\d{12}$/.test(String(data?.aadhaarFull ?? ""))) {
    throw new ConfidentialExportError("PRINT_PAYLOAD_MALFORMED");
  }

  return {
    aadhaarFull: String(data.aadhaarFull),
    exportReference: data.exportReference,
    exportAuthorizationId: data.exportAuthorizationId,
    generatedBy: data.generatedBy ?? "",
    generatedAt: data.generatedAt ?? "",
    recordLabel: data.recordLabel ?? "",
  };
}

/** The server-generated PDF bytes. Never assembled or rasterised here. */
export async function fetchConfidentialPdfBlob({
  id,
  exportToken,
  accessToken,
  tokenType,
  surface = "appointments",
}) {
  try {
    return await withTimeout(
      confidentialExportApi.downloadPdf(id, exportToken, accessToken, tokenType, surface),
      "PDF_TIMEOUT",
    );
  } catch (error) {
    if (isConfidentialExportError(error)) throw error;

    throw new ConfidentialExportError("PDF_REFUSED", error);
  }
}

/**
 * Hand a Blob to the browser's download mechanism.
 *
 * The object URL is revoked immediately afterwards so the bytes are not left
 * reachable from the page for the rest of the session.
 */
export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Appointment_APT-000104_Confidential.pdf
 *
 * The server sends its own Content-Disposition; this is only the local fallback
 * name for the anchor. Built from the record reference, never from the Aadhaar —
 * a filename ends up in download histories and chat messages.
 */
export function confidentialFileName(recordLabel, surface = "appointments") {
  const prefix = surface === "employees" ? "Employee" : "Appointment";
  const safe = String(recordLabel || "record").replace(/[^A-Za-z0-9._-]/g, "");

  return `${prefix}_${safe}_Confidential.pdf`;
}
