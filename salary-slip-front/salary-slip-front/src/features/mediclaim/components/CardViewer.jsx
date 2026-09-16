import { useEffect, useState } from "react";
import { Eye, QrCode, BadgeCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";
import Modal from "../../../components/ui/Modal";
import Badge from "../../../components/ui/Badge";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import DocumentViewerModal from "../../../components/documents/DocumentViewerModal";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { formatClaimDate, formatMaskedCardNumber } from "../utils/formatters";

const STATUS_VARIANT = { active: "green", expired: "gray", revoked: "red", superseded: "gray" };

/**
 * The employee's own Mediclaim cards — one per approved covered member.
 * Each row's "View/Download" opens the card's backend-generated PDF
 * document through the existing `DocumentViewerModal`, reused completely
 * unmodified per the plan's reconciliation #4.
 *
 * The QR encodes the public verify URL
 * `${origin}/mediclaim/verify/{card.verifyToken}`. That route doesn't exist
 * until F7 (a later phase) — the code is genuinely unreachable (404) until
 * then, which is expected and not a bug in this component.
 */
export default function CardViewer() {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const requestKey = `${accessToken ?? ""}|${tokenType ?? ""}`;
  const [result, setResult] = useState({ key: null, cards: [], error: null });
  const [viewerDoc, setViewerDoc] = useState(null);
  const [qrTarget, setQrTarget] = useState(null);

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;

    mediclaimApi.myCards(accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const cards = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setResult({ key: requestKey, cards, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key: requestKey, cards: [], error: err?.message || "Failed to load Mediclaim cards." });
      });

    return () => { cancelled = true; };
  }, [accessToken, tokenType, requestKey]);

  const state = { loading: result.key !== requestKey, cards: result.cards, error: result.error };

  const openDocument = (card) => {
    // `GET /me/cards` returns raw MediclaimCard rows — the real column is
    // `document_id` (snake_case), never a nested `document`/`cardDocument`
    // object or a camelCased `documentId`. Missing that fallback made this
    // button a silent no-op for every card.
    const documentId = card.document?.documentId ?? card.document?.id
      ?? card.cardDocument?.documentId ?? card.card_document?.documentId
      ?? card.documentId ?? card.document_id;

    if (!documentId) {
      toast.error("This card's PDF hasn't been generated yet.");
      return;
    }

    setViewerDoc({ documentId });
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {state.loading ? (
          <div className="p-6"><SkeletonTable rows={3} /></div>
        ) : state.error ? (
          <p className="py-16 text-center text-sm text-red-500">{state.error}</p>
        ) : state.cards.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">
            No Mediclaim cards issued yet. A card is generated for each approved covered member.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3 text-left">Member</th>
                  <th className="px-4 py-3 text-left">Card Number</th>
                  <th className="px-4 py-3 text-left">Validity</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {state.cards.map((card) => (
                  <tr key={card.id ?? card.cardId} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {card.memberName || card.member_name || card.member?.fullName || card.member?.full_name || "—"}
                      {(card.relationshipType || card.member?.relationshipType || card.member?.relationship_type) && (
                        <span className="ml-1 text-xs font-normal text-gray-400">
                          ({card.relationshipType || card.member?.relationshipType || card.member?.relationship_type})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatMaskedCardNumber(card.cardNumber || card.card_number)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {formatClaimDate(card.validFrom || card.valid_from)} – {formatClaimDate(card.validTo || card.valid_to)}
                    </td>
                    <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[card.status] || "gray"}>{card.status || "—"}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button title="View / Download card" onClick={() => openDocument(card)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                          <Eye size={15} />
                        </button>
                        {(card.verifyToken || card.verify_token) && (
                          <button title="QR code" onClick={() => setQrTarget(card)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                            <QrCode size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={Boolean(qrTarget)} onClose={() => setQrTarget(null)} title="Mediclaim Card QR" size="sm">
        <div className="flex flex-col items-center gap-4 py-4">
          {qrTarget && (
            <QRCodeSVG
              value={`${window.location.origin}/mediclaim/verify/${qrTarget.verifyToken || qrTarget.verify_token}`}
              size={180}
            />
          )}
          <p className="flex items-center gap-1.5 text-center text-xs text-gray-500 dark:text-gray-400">
            <BadgeCheck size={13} className="text-emerald-500" />
            Scan to verify this card
          </p>
        </div>
      </Modal>

      <DocumentViewerModal document={viewerDoc} open={Boolean(viewerDoc)} onClose={() => setViewerDoc(null)} />
    </div>
  );
}
