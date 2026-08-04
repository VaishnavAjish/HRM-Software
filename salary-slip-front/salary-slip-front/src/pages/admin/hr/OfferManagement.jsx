import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  CheckCircle2, Send, ThumbsUp, ThumbsDown, History, FileDown, Trash2,
  PauseCircle, XCircle, Check, X,
} from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { hrApi } from "../../../utils/api";
import { downloadTablePDF } from "../../../utils/exportUtils";
import { stageLabel, stageColor } from "./hiring/stageMeta";

const smallInputClass = "rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STATUS_VARIANT = {
  draft: "gray", pending_approval: "yellow", approved: "blue", released: "purple",
  accepted: "green", rejected: "red", expired: "gray", withdrawn: "red",
};

const PRIORITY_DOT = { high: "bg-red-500", medium: "bg-yellow-400", low: "bg-gray-400" };

/** Everything this tab owns — a candidate lands here once marked Selected in
 *  Interviews, and leaves once the offer's accepted (Onboarding takes over). */
const OFFER_STAGES = ["selected", "offer_sent", "offer_accepted"];

export default function OfferManagement() {
  const { user } = useAuth();
  const [offers, setOffers] = useState([]);
  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const [historyTarget, setHistoryTarget] = useState(null);

  const loadOffers = () =>
    hrApi.getOffers(user?.accessToken, user?.tokenType, { per_page: 100 })
      .then((res) => { if (res.status) setOffers(res.data?.data || res.data || []); })
      .catch((err) => toast.error(err.message || "Failed to load offers"));

  // This tab owns Selected → Offer Sent → Offer Accepted. "Selected" is the
  // hand-off point from the Interview tab: a candidate lands here as soon as
  // they're marked Selected, whether or not an offer's been drafted yet.
  const loadRoster = useCallback(() => {
    if (!user?.accessToken) return;
    setRosterLoading(true);
    hrApi.getCandidates(user.accessToken, user.tokenType, { per_page: 100, stage: OFFER_STAGES.join(",") })
      .then((res) => { if (res.status) setRoster(res.data?.data || res.data || []); })
      .catch(() => {})
      .finally(() => setRosterLoading(false));
  }, [user]);

  useEffect(() => {
    if (!user?.accessToken) return;
    loadOffers();
    loadRoster();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const rejectOrHold = async (candidate, toStage) => {
    setActingId(candidate.id);
    try {
      const res = await hrApi.moveCandidateStage(candidate.id, { to_stage: toStage }, user?.accessToken, user?.tokenType);
      if (!res.status) throw new Error(res.message);
      toast.success(toStage === "rejected" ? "Marked Rejected" : "Marked On Hold");
      loadRoster();
    } catch (err) {
      toast.error(err.message || "Failed to update stage");
    } finally {
      setActingId(null);
    }
  };

  /** Fired from a roster row's inline form — the row already knows the
   *  candidate, so there's no separate "pick a candidate" modal. */
  const createOfferFor = async (candidate, payload) => {
    const res = await hrApi.storeOffer({ candidate_id: candidate.id, ...payload }, user?.accessToken, user?.tokenType);
    if (!res.status) throw new Error(res.message);
    toast.success("Offer created");
    loadOffers();
    loadRoster();
  };

  const approve = async (id) => {
    try { const res = await hrApi.approveOffer(id, user?.accessToken, user?.tokenType); if (res.status) { toast.success("Offer approved"); loadOffers(); } }
    catch (err) { toast.error(err.message || "Failed to approve"); }
  };
  const release = async (id) => {
    try { const res = await hrApi.releaseOffer(id, user?.accessToken, user?.tokenType); if (res.status) { toast.success("Offer released"); loadOffers(); } }
    catch (err) { toast.error(err.message || "Failed to release"); }
  };
  const respond = async (id, status) => {
    try { const res = await hrApi.respondOffer(id, { status }, user?.accessToken, user?.tokenType); if (res.status) { toast.success(`Offer ${status}`); loadOffers(); loadRoster(); } }
    catch (err) { toast.error(err.message || "Failed to record response"); }
  };
  const withdraw = async (id) => {
    if (!window.confirm("Withdraw this offer?")) return;
    try { const res = await hrApi.deleteOffer(id, user?.accessToken, user?.tokenType); if (res.status) { toast.success("Offer withdrawn"); loadOffers(); loadRoster(); } }
    catch (err) { toast.error(err.message || "Failed to withdraw"); }
  };

  const viewHistory = async (offer) => {
    try {
      const res = await hrApi.getOffer(offer.id, user?.accessToken, user?.tokenType);
      if (res.status) setHistoryTarget(res.data);
    } catch (err) {
      toast.error(err.message || "Failed to load offer history");
    }
  };

  const downloadOfferLetter = (offer) => {
    const breakupRows = Object.entries(offer.salary_breakup || {}).map(([k, v]) => [k, `₹${Number(v).toLocaleString("en-IN")}`]);
    downloadTablePDF({
      title: "Offer Letter",
      subtitle: `${offer.candidate?.name || "Candidate"} — ${offer.designation}`,
      columns: ["Salary Component", "Annual Amount"],
      rows: [...breakupRows, ["Total CTC", `₹${Number(offer.ctc_annual).toLocaleString("en-IN")}`]],
      filename: `Offer-${offer.candidate?.name || offer.id}`,
    });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Every candidate marked Selected in Interviews lands here — draft the offer right on their row, then approve, release and track it in this tab
      </p>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        {rosterLoading ? (
          <div className="p-6"><SkeletonTable rows={6} /></div>
        ) : roster.length === 0 ? (
          <p className="text-center py-16 text-sm text-gray-500 dark:text-gray-400">
            No one's in the offer process right now — candidates show up here once marked Selected in Interviews.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left px-4 py-3">Candidate</th>
                  <th className="text-left px-4 py-3">Stage</th>
                  <th className="text-left px-4 py-3">Offer</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {roster.map((c) => (
                  <RosterRow
                    key={c.id}
                    candidate={c}
                    offer={offers.find((o) => String(o.candidate_id) === String(c.id))}
                    busy={actingId === c.id}
                    onCreateOffer={createOfferFor}
                    onRejectOrHold={rejectOrHold}
                    onApprove={approve}
                    onRelease={release}
                    onRespond={respond}
                    onWithdraw={withdraw}
                    onHistory={viewHistory}
                    onDownload={downloadOfferLetter}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={!!historyTarget} onClose={() => setHistoryTarget(null)} title={`Version History — ${historyTarget?.candidate?.name || ""}`}>
        <div className="space-y-3">
          {(historyTarget?.revisions || []).map((rev) => (
            <div key={rev.id} className="rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Version {rev.version}</span>
                <span className="text-xs text-gray-400">{rev.created_at ? new Date(rev.created_at).toLocaleString() : ""}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{rev.reason}</p>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">CTC: ₹{Number(rev.snapshot?.ctc_annual || 0).toLocaleString("en-IN")}</p>
            </div>
          ))}
          {(!historyTarget?.revisions || historyTarget.revisions.length === 0) && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">No revision history</p>
          )}
        </div>
      </Modal>
    </div>
  );
}

/** One row per candidate. No detour through a separate "new offer" modal —
 *  designation/CTC/joining date are filled in right here, since the row
 *  already knows who it's for. */
function RosterRow({ candidate, offer, busy, onCreateOffer, onRejectOrHold, onApprove, onRelease, onRespond, onWithdraw, onHistory, onDownload }) {
  const [drafting, setDrafting] = useState(false);
  const [designation, setDesignation] = useState(candidate.current_designation || "");
  const [ctc, setCtc] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!designation.trim() || !ctc) { toast.error("Designation and CTC are required"); return; }
    setSubmitting(true);
    try {
      await onCreateOffer(candidate, { designation, ctc_annual: ctc, joining_date: joiningDate || undefined });
      setDrafting(false);
    } catch (err) {
      toast.error(err.message || "Failed to create offer");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/30 align-top">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${PRIORITY_DOT[candidate.priority] || "bg-gray-400"}`} />
          <div>
            <p className="font-medium text-gray-900 dark:text-white">{candidate.name}</p>
            {candidate.requisition?.title && <p className="text-xs text-gray-400">{candidate.requisition.title}</p>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${stageColor(candidate.stage)}1a`, color: stageColor(candidate.stage) }}>
          {stageLabel(candidate.stage)}
        </span>
      </td>
      <td className="px-4 py-3">
        {offer ? (
          <div className="text-gray-600 dark:text-gray-300">
            <p className="font-medium text-gray-900 dark:text-white">{offer.designation}</p>
            <p className="text-xs">₹{Number(offer.ctc_annual).toLocaleString("en-IN")} · {offer.joining_date || "no joining date"} · v{offer.version}</p>
          </div>
        ) : drafting ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <input placeholder="Designation" value={designation} onChange={(e) => setDesignation(e.target.value)} className={`${smallInputClass} w-28`} />
            <input type="number" placeholder="CTC / year" value={ctc} onChange={(e) => setCtc(e.target.value)} className={`${smallInputClass} w-24`} />
            <input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} className={smallInputClass} />
            <button title="Save" onClick={submit} disabled={submitting} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-40">
              <Check size={14} />
            </button>
            <button title="Cancel" onClick={() => setDrafting(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
              <X size={14} />
            </button>
          </div>
        ) : (
          <button onClick={() => setDrafting(true)} className="text-xs font-semibold text-brand-600 hover:underline">
            + Draft offer
          </button>
        )}
      </td>
      <td className="px-4 py-3">
        {offer && <Badge variant={STATUS_VARIANT[offer.status] || "gray"}>{offer.status?.replace("_", " ")}</Badge>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          {offer ? (
            <>
              {offer.status === "draft" && (
                <button title="Approve" onClick={() => onApprove(offer.id)} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"><CheckCircle2 size={14} /></button>
              )}
              {offer.status === "approved" && (
                <button title="Release to candidate" onClick={() => onRelease(offer.id)} className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"><Send size={14} /></button>
              )}
              {offer.status === "released" && (
                <>
                  <button title="Mark accepted" onClick={() => onRespond(offer.id, "accepted")} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"><ThumbsUp size={14} /></button>
                  <button title="Mark rejected" onClick={() => onRespond(offer.id, "rejected")} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><ThumbsDown size={14} /></button>
                </>
              )}
              <button title="Offer letter PDF" onClick={() => onDownload(offer)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><FileDown size={14} /></button>
              <button title="Version history" onClick={() => onHistory(offer)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><History size={14} /></button>
              {!["accepted", "withdrawn"].includes(offer.status) && (
                <button title="Withdraw" onClick={() => onWithdraw(offer.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={14} /></button>
              )}
            </>
          ) : candidate.stage === "selected" && (
            <>
              <button title="Hold" disabled={busy} onClick={() => onRejectOrHold(candidate, "on_hold")} className="p-1.5 rounded-lg text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 disabled:opacity-40">
                <PauseCircle size={14} />
              </button>
              <button title="Reject" disabled={busy} onClick={() => onRejectOrHold(candidate, "rejected")} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40">
                <XCircle size={14} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
