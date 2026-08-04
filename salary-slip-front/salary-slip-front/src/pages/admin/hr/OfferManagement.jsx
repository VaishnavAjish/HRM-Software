import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  CheckCircle2, Send, ThumbsUp, ThumbsDown, History, FileDown, Trash2,
  PauseCircle, XCircle, FilePlus2,
} from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { hrApi } from "../../../utils/api";
import { downloadTablePDF } from "../../../utils/exportUtils";
import { stageLabel, stageColor } from "./hiring/stageMeta";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STATUS_VARIANT = {
  draft: "gray", pending_approval: "yellow", approved: "blue", released: "purple",
  accepted: "green", rejected: "red", expired: "gray", withdrawn: "red",
};

const PRIORITY_DOT = { high: "bg-red-500", medium: "bg-yellow-400", low: "bg-gray-400" };

/** Everything this tab owns — a candidate lands here once marked Selected in
 *  Interviews, and leaves once the offer's accepted (Onboarding takes over). */
const OFFER_STAGES = ["selected", "offer_sent", "offer_accepted"];

const EMPTY_FORM = { designation: "", ctc_annual: "", joining_date: "", expiry_date: "", notes: "" };
const EMPTY_BREAKUP = [{ label: "Basic", amount: "" }, { label: "HRA", amount: "" }, { label: "Allowances", amount: "" }];

export default function OfferManagement() {
  const { user } = useAuth();
  const [offers, setOffers] = useState([]);
  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [actingId, setActingId] = useState(null);

  const [draftTarget, setDraftTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [breakup, setBreakup] = useState(EMPTY_BREAKUP);
  const [saving, setSaving] = useState(false);
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

  const openDraft = (candidate) => {
    setDraftTarget(candidate);
    setForm({ ...EMPTY_FORM, designation: candidate.current_designation || "" });
    setBreakup(EMPTY_BREAKUP);
  };

  const addBreakupRow = () => setBreakup([...breakup, { label: "", amount: "" }]);
  const removeBreakupRow = (i) => setBreakup(breakup.filter((_, idx) => idx !== i));
  const breakupTotal = breakup.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  /** No candidate picker in the modal — the row you clicked "Draft Offer"
   *  from already tells us who it's for. */
  const saveDraft = async () => {
    if (!form.designation || !form.ctc_annual) { toast.error("Designation and CTC are required"); return; }
    setSaving(true);
    try {
      const salary_breakup = Object.fromEntries(breakup.filter((r) => r.label).map((r) => [r.label, Number(r.amount) || 0]));
      const res = await hrApi.storeOffer({ candidate_id: draftTarget.id, ...form, salary_breakup }, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Offer created"); setDraftTarget(null); loadOffers(); loadRoster(); }
    } catch (err) {
      toast.error(err.message || "Failed to create offer");
    } finally {
      setSaving(false);
    }
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
        Every candidate marked Selected in Interviews lands here — draft the offer through a proper form, then approve, release and track it in this tab
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
                {roster.map((c) => {
                  const offer = offers.find((o) => String(o.candidate_id) === String(c.id));
                  const busy = actingId === c.id;
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[c.priority] || "bg-gray-400"}`} />
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{c.name}</p>
                            {c.requisition?.title && <p className="text-xs text-gray-400">{c.requisition.title}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${stageColor(c.stage)}1a`, color: stageColor(c.stage) }}>
                          {stageLabel(c.stage)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {offer ? (
                          <div className="text-gray-600 dark:text-gray-300">
                            <p className="font-medium text-gray-900 dark:text-white">{offer.designation}</p>
                            <p className="text-xs">₹{Number(offer.ctc_annual).toLocaleString("en-IN")} · {offer.joining_date || "no joining date"} · v{offer.version}</p>
                          </div>
                        ) : (
                          <button
                            onClick={() => openDraft(c)}
                            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 border border-brand-100 dark:border-brand-900/40"
                          >
                            <FilePlus2 size={13} /> Draft Offer
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {offer && <Badge variant={STATUS_VARIANT[offer.status] || "gray"}>{offer.status?.replace("_", " ")}</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {offer ? (
                            <>
                              {offer.status === "draft" && (
                                <button title="Approve" onClick={() => approve(offer.id)} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"><CheckCircle2 size={15} /></button>
                              )}
                              {offer.status === "approved" && (
                                <button title="Release to candidate" onClick={() => release(offer.id)} className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"><Send size={15} /></button>
                              )}
                              {offer.status === "released" && (
                                <>
                                  <button title="Mark accepted" onClick={() => respond(offer.id, "accepted")} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"><ThumbsUp size={15} /></button>
                                  <button title="Mark rejected" onClick={() => respond(offer.id, "rejected")} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><ThumbsDown size={15} /></button>
                                </>
                              )}
                              <button title="Offer letter PDF" onClick={() => downloadOfferLetter(offer)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><FileDown size={15} /></button>
                              <button title="Version history" onClick={() => viewHistory(offer)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><History size={15} /></button>
                              {!["accepted", "withdrawn"].includes(offer.status) && (
                                <button title="Withdraw" onClick={() => withdraw(offer.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={15} /></button>
                              )}
                            </>
                          ) : c.stage === "selected" && (
                            <>
                              <button title="Hold" disabled={busy} onClick={() => rejectOrHold(c, "on_hold")} className="p-1.5 rounded-lg text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 disabled:opacity-40"><PauseCircle size={15} /></button>
                              <button title="Reject" disabled={busy} onClick={() => rejectOrHold(c, "rejected")} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40"><XCircle size={15} /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={!!draftTarget} onClose={() => setDraftTarget(null)} title={`Draft Offer — ${draftTarget?.name || ""}`} size="lg"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setDraftTarget(null)}>Cancel</Button><Button onClick={saveDraft} disabled={saving}>{saving ? "Saving..." : "Create Offer"}</Button></div>}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Designation" required><input className={inputClass} value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></Field>
            <Field label="CTC (Annual)" required><input type="number" className={inputClass} value={form.ctc_annual} onChange={(e) => setForm({ ...form, ctc_annual: e.target.value })} /></Field>
            <Field label="Joining Date"><input type="date" className={inputClass} value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} /></Field>
            <Field label="Offer Expiry Date"><input type="date" className={inputClass} value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></Field>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400">Salary Breakdown</label>
              <button type="button" onClick={addBreakupRow} className="text-xs font-semibold text-brand-600 hover:underline">+ Add component</button>
            </div>
            <div className="space-y-2">
              {breakup.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input className={inputClass} placeholder="Component" value={row.label} onChange={(e) => setBreakup(breakup.map((r, idx) => idx === i ? { ...r, label: e.target.value } : r))} />
                  <input type="number" className={inputClass} placeholder="Amount" value={row.amount} onChange={(e) => setBreakup(breakup.map((r, idx) => idx === i ? { ...r, amount: e.target.value } : r))} />
                  <button type="button" onClick={() => removeBreakupRow(i)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Breakdown total: ₹{breakupTotal.toLocaleString("en-IN")}</p>
          </div>

          <Field label="Notes"><textarea rows={2} className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
      </Modal>

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

function Field({ label, required, full, children }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
