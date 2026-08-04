import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, CheckCircle2, Send, ThumbsUp, ThumbsDown, History, FileDown, Trash2, Briefcase, GraduationCap, PauseCircle, XCircle } from "lucide-react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { hrApi } from "../../../utils/api";
import { downloadTablePDF } from "../../../utils/exportUtils";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STATUS_VARIANT = {
  draft: "gray", pending_approval: "yellow", approved: "blue", released: "purple",
  accepted: "green", rejected: "red", expired: "gray", withdrawn: "red",
};

const PRIORITY_DOT = { high: "bg-red-500", medium: "bg-yellow-400", low: "bg-gray-400" };

const EMPTY_FORM = { candidate_id: "", designation: "", ctc_annual: "", joining_date: "", expiry_date: "", notes: "" };
const EMPTY_BREAKUP = [{ label: "Basic", amount: "" }, { label: "HRA", amount: "" }, { label: "Allowances", amount: "" }];

export default function OfferManagement() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [awaitingOffer, setAwaitingOffer] = useState([]);
  const [awaitingLoading, setAwaitingLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [breakup, setBreakup] = useState(EMPTY_BREAKUP);
  const [saving, setSaving] = useState(false);
  const [historyTarget, setHistoryTarget] = useState(null);

  /**
   * Raises no spinner of its own — every state update happens in a promise
   * continuation. `loading` starts true, so the mount fetch needs none, and
   * turning it on from the effect was a synchronous setState that cost a
   * cascading render before the request had even been sent. Callers refetching
   * over an already-rendered list use reload().
   */
  const load = () =>
    hrApi
      .getOffers(user?.accessToken, user?.tokenType, { per_page: 100 })
      .then((res) => {
        if (res.status) setOffers(res.data?.data || res.data || []);
      })
      .catch((err) => toast.error(err.message || "Failed to load offers"))
      .finally(() => setLoading(false));

  const reload = () => {
    setLoading(true);
    return load();
  };

  // This tab owns Selected → Offer Sent → Offer Accepted. "Selected" is the
  // hand-off point from the Interview tab: a candidate lands here as soon as
  // they're marked Selected, whether or not an offer's been drafted yet.
  const loadCandidates = useCallback(() => {
    if (!user?.accessToken) return;
    setAwaitingLoading(true);
    hrApi.getCandidates(user.accessToken, user.tokenType, { per_page: 100, stage: "selected,offer_sent" })
      .then((res) => { if (res.status) setCandidates(res.data?.data || res.data || []); })
      .catch(() => {})
      .finally(() => setAwaitingLoading(false));
  }, [user]);

  useEffect(() => {
    if (!user?.accessToken) return;
    load();
    loadCandidates();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Awaiting Offer" = Selected candidates with no offer drafted for them yet.
  useEffect(() => {
    const withOffer = new Set(offers.map((o) => String(o.candidate_id)));
    setAwaitingOffer(candidates.filter((c) => c.stage === "selected" && !withOffer.has(String(c.id))));
  }, [candidates, offers]);

  const createOfferFor = (candidate) => {
    setForm({ ...EMPTY_FORM, candidate_id: String(candidate.id), designation: candidate.current_designation || "" });
    setModalOpen(true);
  };

  const rejectOrHold = async (candidate, toStage) => {
    setActingId(candidate.id);
    try {
      const res = await hrApi.moveCandidateStage(candidate.id, { to_stage: toStage }, user?.accessToken, user?.tokenType);
      if (!res.status) throw new Error(res.message);
      toast.success(toStage === "rejected" ? "Marked Rejected" : "Marked On Hold");
      loadCandidates();
    } catch (err) {
      toast.error(err.message || "Failed to update stage");
    } finally {
      setActingId(null);
    }
  };

  const addBreakupRow = () => setBreakup([...breakup, { label: "", amount: "" }]);
  const removeBreakupRow = (i) => setBreakup(breakup.filter((_, idx) => idx !== i));
  const breakupTotal = breakup.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const save = async () => {
    if (!form.candidate_id || !form.designation || !form.ctc_annual) { toast.error("Candidate, designation and CTC are required"); return; }
    setSaving(true);
    try {
      const salary_breakup = Object.fromEntries(breakup.filter((r) => r.label).map((r) => [r.label, Number(r.amount) || 0]));
      const res = await hrApi.storeOffer({ ...form, salary_breakup }, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Offer created"); setModalOpen(false); setForm(EMPTY_FORM); setBreakup(EMPTY_BREAKUP); reload(); loadCandidates(); }
    } catch (err) {
      toast.error(err.message || "Failed to create offer");
    } finally {
      setSaving(false);
    }
  };

  const approve = async (id) => {
    try { const res = await hrApi.approveOffer(id, user?.accessToken, user?.tokenType); if (res.status) { toast.success("Offer approved"); reload(); } }
    catch (err) { toast.error(err.message || "Failed to approve"); }
  };
  const release = async (id) => {
    try { const res = await hrApi.releaseOffer(id, user?.accessToken, user?.tokenType); if (res.status) { toast.success("Offer released"); reload(); } }
    catch (err) { toast.error(err.message || "Failed to release"); }
  };
  const respond = async (id, status) => {
    try { const res = await hrApi.respondOffer(id, { status }, user?.accessToken, user?.tokenType); if (res.status) { toast.success(`Offer ${status}`); reload(); } }
    catch (err) { toast.error(err.message || "Failed to record response"); }
  };
  const withdraw = async (id) => {
    if (!window.confirm("Withdraw this offer?")) return;
    try { const res = await hrApi.deleteOffer(id, user?.accessToken, user?.tokenType); if (res.status) { toast.success("Offer withdrawn"); reload(); } }
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Every candidate marked Selected in Interviews lands here — drafting, approving, releasing and tracking offers all happen in this tab</p>
        <Button icon={<Plus size={16} />} onClick={() => setModalOpen(true)}>New Offer</Button>
      </div>

      {/* ── Selected candidates without a drafted offer yet ── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Awaiting Offer</h2>
        {awaitingLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div className="skeleton h-32 rounded-2xl" /></div>
        ) : awaitingOffer.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 text-center py-6">
            No one is waiting on an offer right now — candidates show up here once marked Selected in Interviews.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {awaitingOffer.map((c) => {
              const busy = actingId === c.id;
              return (
                <div key={c.id} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[c.priority] || "bg-gray-400"}`} />
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.name}</p>
                  </div>
                  {c.requisition?.title && (
                    <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 truncate"><Briefcase size={11} /> {c.requisition.title}</p>
                  )}
                  <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-2"><GraduationCap size={11} /> {c.experience_years ?? 0} yrs</p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => createOfferFor(c)}
                      className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 border border-brand-100 dark:border-brand-900/40"
                    >
                      <Plus size={12} /> Create Offer
                    </button>
                    <button title="Hold" disabled={busy} onClick={() => rejectOrHold(c, "on_hold")} className="p-1.5 rounded-lg text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 disabled:opacity-40">
                      <PauseCircle size={13} />
                    </button>
                    <button title="Reject" disabled={busy} onClick={() => rejectOrHold(c, "rejected")} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40">
                      <XCircle size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Offers</h2>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6"><SkeletonTable rows={6} /></div>
        ) : offers.length === 0 ? (
          <p className="text-center py-16 text-sm text-gray-500 dark:text-gray-400">No offers yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left px-4 py-3">Candidate</th>
                  <th className="text-left px-4 py-3">Designation</th>
                  <th className="text-left px-4 py-3">CTC (Annual)</th>
                  <th className="text-left px-4 py-3">Joining</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Version</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {offers.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{o.candidate?.name}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{o.designation}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">₹{Number(o.ctc_annual).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{o.joining_date || "—"}</td>
                    <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[o.status] || "gray"}>{o.status?.replace("_", " ")}</Badge></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">v{o.version}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {o.status === "draft" && (
                          <button title="Approve" onClick={() => approve(o.id)} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"><CheckCircle2 size={15} /></button>
                        )}
                        {o.status === "approved" && (
                          <button title="Release to candidate" onClick={() => release(o.id)} className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"><Send size={15} /></button>
                        )}
                        {o.status === "released" && (
                          <>
                            <button title="Mark accepted" onClick={() => respond(o.id, "accepted")} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"><ThumbsUp size={15} /></button>
                            <button title="Mark rejected" onClick={() => respond(o.id, "rejected")} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><ThumbsDown size={15} /></button>
                          </>
                        )}
                        <button title="Offer letter PDF" onClick={() => downloadOfferLetter(o)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><FileDown size={15} /></button>
                        <button title="Version history" onClick={() => viewHistory(o)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><History size={15} /></button>
                        {!["accepted", "withdrawn"].includes(o.status) && (
                          <button title="Withdraw" onClick={() => withdraw(o.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={15} /></button>
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
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="New Offer" size="lg"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Create Offer"}</Button></div>}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Candidate" required full>
              <select className={inputClass} value={form.candidate_id} onChange={(e) => setForm({ ...form, candidate_id: e.target.value })}>
                <option value="">— Select candidate —</option>
                {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
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
