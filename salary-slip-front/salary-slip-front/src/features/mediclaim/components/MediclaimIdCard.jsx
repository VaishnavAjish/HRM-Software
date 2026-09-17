import { useRef, useState } from "react";
import { Eye, QrCode, BadgeCheck, ShieldCheck, Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import html2canvas from "html2canvas";
import toast from "react-hot-toast";
import Modal from "../../../components/ui/Modal";
import Badge from "../../../components/ui/Badge";
import { formatClaimDate, formatMaskedCardNumber } from "../utils/formatters";

const STATUS_VARIANT = { active: "green", expired: "gray", revoked: "red", superseded: "gray" };

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

/**
 * A single Mediclaim card rendered as an actual ID-card visual — photo (or
 * initials), name/relationship, QR, card number and validity — reused by
 * both the employee's own `CardViewer.jsx` and the admin `EmployeesTab.jsx`
 * detail drawer, so both places show the same card, not two different
 * designs of the same data.
 *
 * "View Card" rasterizes the card's own on-screen DOM node into a PNG
 * (`html2canvas`, already used the same way by `orgchart/export.js`) and
 * shows it enlarged in a popup — a real image, viewable on demand, never a
 * server-generated PDF opened through a document viewer (which can't even
 * preview most file types inline, only offer a download). Only the
 * header+body (the ref'd node) is captured, styled with fixed
 * (non-dark-mode) colors so the resulting image always looks the same
 * regardless of the viewer's app theme — the footer's action button sits
 * outside that node so it never ends up baked into the image.
 *
 * The QR encodes the public verify URL
 * `${origin}/mediclaim/verify/{card.verifyToken}`, shown inline on the card
 * and enlargeable in its own popup.
 */
export default function MediclaimIdCard({ card, name, relationship, photoUrl, employeeCode }) {
  const cardRef = useRef(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState({ open: false, src: null, loading: false });

  const status = String(card?.status || "").toLowerCase();
  const verifyToken = card?.verifyToken || card?.verify_token;
  const resolvedName = name || "—";

  const viewCardImage = async () => {
    const node = cardRef.current;
    if (!node) return;

    setImagePreview({ open: true, src: null, loading: true });
    try {
      const canvas = await html2canvas(node, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
      setImagePreview({ open: true, src: canvas.toDataURL("image/png"), loading: false });
    } catch {
      toast.error("Failed to generate the card image.");
      setImagePreview({ open: false, src: null, loading: false });
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700">
      {/* Capturable card face — fixed (non-dark-mode) styling so the
          generated image always looks the same regardless of theme. */}
      <div ref={cardRef} className="bg-white">
        <div className="relative flex items-center justify-between gap-2 bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-white">
            <ShieldCheck size={14} />
            <span className="text-[11px] font-bold uppercase tracking-wider">Mediclaim ID Card</span>
          </div>
          <Badge variant={STATUS_VARIANT[status] || "gray"}>{card?.status || "—"}</Badge>
        </div>

        <div className="flex gap-4 p-4">
          <div className="flex-shrink-0">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={resolvedName}
                className="h-16 w-16 rounded-xl border border-gray-100 object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-brand-100 to-indigo-100 text-lg font-bold text-brand-700">
                {initials(resolvedName)}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-gray-900">{resolvedName}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {relationship && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  {relationship}
                </span>
              )}
              {employeeCode && <span className="text-[11px] text-gray-400">#{employeeCode}</span>}
            </div>

            <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <div>
                <dt className="text-gray-400">Card No.</dt>
                <dd className="font-mono font-semibold text-gray-700">{formatMaskedCardNumber(card?.cardNumber || card?.card_number)}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Valid Till</dt>
                <dd className="font-semibold text-gray-700">{formatClaimDate(card?.validTo || card?.valid_to)}</dd>
              </div>
            </dl>
          </div>

          <button
            type="button"
            onClick={() => verifyToken && setQrOpen(true)}
            disabled={!verifyToken}
            title="Tap to enlarge QR"
            className="flex-shrink-0 rounded-lg border border-gray-100 bg-white p-1.5 disabled:opacity-40"
          >
            {verifyToken ? (
              <QRCodeSVG value={`${window.location.origin}/mediclaim/verify/${verifyToken}`} size={64} />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center text-gray-300"><QrCode size={24} /></div>
            )}
          </button>
        </div>

        <div className="border-t border-gray-100 px-4 py-1.5 text-[11px] text-gray-400">
          Valid from {formatClaimDate(card?.validFrom || card?.valid_from)}
        </div>
      </div>

      {/* Footer action — outside the capturable node so it's never baked into the image. */}
      <div className="flex justify-end border-t border-gray-100 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-900/30">
        <button
          type="button"
          onClick={viewCardImage}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
        >
          <Eye size={13} /> View Card
        </button>
      </div>

      <Modal isOpen={qrOpen} onClose={() => setQrOpen(false)} title="Mediclaim Card QR" size="sm">
        <div className="flex flex-col items-center gap-4 py-4">
          {verifyToken && <QRCodeSVG value={`${window.location.origin}/mediclaim/verify/${verifyToken}`} size={200} />}
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
              <p className="text-center text-[11px] text-gray-400">Right-click (or press and hold) the image to save it.</p>
            </>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
