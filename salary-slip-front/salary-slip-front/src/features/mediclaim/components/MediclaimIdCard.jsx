import { useRef, useState } from "react";
import { Download, Eye, QrCode, BadgeCheck, ShieldCheck, Loader2 } from "lucide-react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import html2canvas from "html2canvas";
import toast from "react-hot-toast";
import Modal from "../../../components/ui/Modal";
import Badge from "../../../components/ui/Badge";
import { getCompanyConfig } from "../../../config/companyConfig";
import { formatClaimDate, formatMaskedCardNumber } from "../utils/formatters";

const STATUS_VARIANT = { active: "green", expired: "gray", revoked: "red", superseded: "gray" };

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function triggerDownload(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * A single Mediclaim card rendered as an actual company ID-card visual —
 * white body with a colored header band (company logo/name), a photo (or
 * initials), name/designation/relationship, an ID number (the sponsoring
 * employee's own employee code — the same number HR/hospitals already use
 * to identify them, not a separate generated card number), validity dates,
 * and a scan-to-verify QR. Reused by both the employee's own
 * `CardViewer.jsx` and the admin `EmployeesTab.jsx` detail drawer, so both
 * places show the same card, not two different designs of the same data.
 *
 * Two ways to get the card as an image, both built on the same
 * `html2canvas` rasterization of the card's own on-screen DOM node (already
 * used the same way by `orgchart/export.js`):
 *  - **View** opens it enlarged in a popup, with its own Download action.
 *  - **Download** rasterizes and saves it directly (a real browser download
 *    via a programmatic `<a download>` click, not a "right-click to save"
 *    hint) without needing the popup at all.
 * Only the card face (the ref'd node) is captured, styled with fixed
 * (non-dark-mode) colors so the resulting image always looks the same
 * regardless of the viewer's app theme — the footer action row sits
 * outside that node so it never ends up baked into the image.
 *
 * Two things that broke the captured PNG (blank photo, blank QR) even
 * though the live card looked fine:
 *  - `html2canvas`'s `useCORS: true` only works if the `<img>` element
 *    itself was ALSO loaded in CORS mode (`crossOrigin="anonymous"`) —
 *    without it the photo/logo images silently render as blank rather than
 *    erroring, since the canvas region is cross-origin-tainted. Both
 *    images set `crossOrigin="anonymous"` for exactly this reason, and the
 *    photo falls back to initials on a load error rather than staying
 *    blank.
 *  - `QRCodeSVG` renders inline `<svg>`/`<path>` markup, which html2canvas
 *    does not reliably rasterize. The on-card QR uses `QRCodeCanvas`
 *    instead (an actual `<canvas>` element — html2canvas copies canvas
 *    pixel data directly, no re-rendering involved) purely for capture
 *    reliability; the enlarge-on-tap popups (never captured) keep
 *    `QRCodeSVG` for its crisper scaling at a larger size.
 *  - Nothing inside the capturable node uses CSS `truncate` (`overflow:
 *    hidden` + `text-overflow: ellipsis`) — html2canvas does not reliably
 *    rasterize that combination (it showed up as corrupted/overlapping
 *    glyphs on long company names and designations, not a clean "…"). Long
 *    text wraps instead (`overflowWrap: "anywhere"`, no `white-space:
 *    nowrap`), which html2canvas handles as plain text layout. The company
 *    name specifically uses the short `label` from `companyConfig.js`
 *    ("Silver Star", not the full "SILVER STAR DIAM PRIVATE LIMITED") so it
 *    reliably fits on one line without needing to wrap or truncate at all.
 *
 * The QR encodes the public verify URL
 * `${origin}/mediclaim/verify/{card.verifyToken}`, shown inline on the card
 * and enlargeable in its own popup.
 */
export default function MediclaimIdCard({
  card,
  name,
  relationship,
  photoUrl,
  employeeCode,
  companyCode,
  department,
  designation,
}) {
  const cardRef = useRef(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState({ open: false, src: null, loading: false });
  const [downloading, setDownloading] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  const status = String(card?.status || "").toLowerCase();
  const verifyToken = card?.verifyToken || card?.verify_token;
  const resolvedName = name || "—";
  const company = getCompanyConfig(companyCode);
  const idNumber = employeeCode || formatMaskedCardNumber(card?.cardNumber || card?.card_number) || "—";
  const subtitle = [designation, department].filter(Boolean).join(" · ");
  const fileBase = (employeeCode || resolvedName || "card").toString().replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const verifyUrl = verifyToken ? `${window.location.origin}/mediclaim/verify/${verifyToken}` : null;
  const showPhoto = Boolean(photoUrl) && !photoFailed;

  const renderCardCanvas = () => {
    const node = cardRef.current;
    if (!node) return Promise.resolve(null);
    return html2canvas(node, { backgroundColor: "#ffffff", scale: 3, useCORS: true });
  };

  const viewCardImage = async () => {
    setImagePreview({ open: true, src: null, loading: true });
    try {
      const canvas = await renderCardCanvas();
      setImagePreview({ open: true, src: canvas?.toDataURL("image/png") ?? null, loading: false });
    } catch {
      toast.error("Failed to generate the card image.");
      setImagePreview({ open: false, src: null, loading: false });
    }
  };

  const downloadCardImage = async () => {
    setDownloading(true);
    try {
      const canvas = await renderCardCanvas();
      if (!canvas) throw new Error("No card node to render.");
      triggerDownload(canvas.toDataURL("image/png"), `mediclaim-card-${fileBase}.png`);
    } catch {
      toast.error("Failed to download the card image.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700">
      {/* Capturable card face — fixed (non-dark-mode) styling so the
          generated image always looks the same regardless of theme. */}
      <div ref={cardRef} className="bg-white text-gray-900">
        {/* Colored header band — the only splash of brand color, not a
            full-bleed gradient body, per the "white card" request. */}
        <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {company?.logo ? (
              <img
                src={company.logo}
                alt={company?.label ? `${company.label} logo` : "Company logo"}
                crossOrigin="anonymous"
                className="h-8 w-8 flex-shrink-0 rounded-md bg-white object-contain p-1"
              />
            ) : (
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-white/20 text-[11px] font-bold text-white">
                {company?.initials || "—"}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[13px] font-extrabold uppercase tracking-wide text-white" style={{ overflowWrap: "anywhere" }}>
                {company?.label || company?.name || "—"}
              </p>
              <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/80">Mediclaim ID Card</p>
            </div>
          </div>
          <Badge variant={STATUS_VARIANT[status] || "gray"} className="flex-shrink-0">{card?.status || "—"}</Badge>
        </div>

        {/* Photo + identity — its own row, full width, so a long name never
            has to compete with the QR for space (that's what truncated it
            before). */}
        <div className="flex items-start gap-3 p-4 pb-3">
          {showPhoto ? (
            <img
              src={photoUrl}
              alt={resolvedName}
              crossOrigin="anonymous"
              onError={() => setPhotoFailed(true)}
              className="h-[72px] w-[72px] flex-shrink-0 rounded-xl border border-gray-200 object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-100 to-indigo-100 text-xl font-bold text-brand-700">
              {initials(resolvedName)}
            </div>
          )}

          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-base font-bold leading-tight text-gray-900" style={{ overflowWrap: "anywhere" }}>{resolvedName}</p>
            {subtitle && (
              <p className="mt-0.5 text-[11px] text-gray-500" style={{ overflowWrap: "anywhere" }}>{subtitle}</p>
            )}
            {relationship && (
              <span className="mt-1.5 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                {relationship}
              </span>
            )}
          </div>
        </div>

        {/* ID / validity + QR — QR is a small tap-to-enlarge thumbnail here,
            not competing for space with the name. */}
        <div className="flex items-end justify-between gap-3 border-t border-gray-100 px-4 py-2.5">
          <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <div>
              <dt className="text-gray-400">ID No.</dt>
              <dd className="font-mono text-sm font-bold tracking-wide text-gray-800">{idNumber}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Valid Till</dt>
              <dd className="font-semibold text-gray-700">{formatClaimDate(card?.validTo || card?.valid_to)}</dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={() => verifyToken && setQrOpen(true)}
            disabled={!verifyToken}
            title="Tap to enlarge QR"
            className="flex-shrink-0 rounded-lg border border-gray-200 bg-white p-1 disabled:opacity-40"
          >
            {verifyToken ? (
              <QRCodeCanvas value={verifyUrl} size={48} />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center text-gray-300"><QrCode size={18} /></div>
            )}
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-1.5 text-[10px] text-gray-400">
          <span>Valid from {formatClaimDate(card?.validFrom || card?.valid_from)}</span>
          <span className="flex items-center gap-1"><ShieldCheck size={10} /> Company-Sponsored Health Cover</span>
        </div>
      </div>

      {/* Footer actions — outside the capturable node so they're never baked into the image. */}
      <div className="flex items-center justify-end gap-4 border-t border-gray-100 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-900/30">
        <button
          type="button"
          onClick={viewCardImage}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
        >
          <Eye size={13} /> View Card
        </button>
        <button
          type="button"
          onClick={downloadCardImage}
          disabled={downloading}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-400"
        >
          {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download
        </button>
      </div>

      <Modal isOpen={qrOpen} onClose={() => setQrOpen(false)} title="Mediclaim Card QR" size="sm">
        <div className="flex flex-col items-center gap-4 py-4">
          {verifyUrl && <QRCodeSVG value={verifyUrl} size={200} />}
          <p className="flex items-center gap-1.5 text-center text-xs text-gray-500 dark:text-gray-400">
            <BadgeCheck size={13} className="text-emerald-500" />
            Scan to verify this card
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={imagePreview.open}
        onClose={() => setImagePreview({ open: false, src: null, loading: false })}
        title={`${resolvedName}'s Card`}
        size="sm"
      >
        <div className="flex flex-col items-center gap-3 py-2">
          {imagePreview.loading ? (
            <div className="flex h-48 w-full items-center justify-center">
              <Loader2 size={22} className="animate-spin text-gray-400" />
            </div>
          ) : imagePreview.src ? (
            <>
              <img src={imagePreview.src} alt="Mediclaim card" className="w-full rounded-xl border border-gray-100 shadow-sm dark:border-gray-700" />
              <button
                type="button"
                onClick={() => triggerDownload(imagePreview.src, `mediclaim-card-${fileBase}.png`)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700"
              >
                <Download size={13} /> Download
              </button>
            </>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
