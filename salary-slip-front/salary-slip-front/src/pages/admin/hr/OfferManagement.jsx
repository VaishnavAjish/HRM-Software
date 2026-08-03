import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, CheckCircle2, Send, ThumbsUp, ThumbsDown, History, FileDown, Trash2 } from "lucide-react";
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

const EMPTY_FORM = { candidate_id: "", designation: "", ctc_annual: "", joining_date: "", expiry_date: "", notes: "" };
const EMPTY_BREAKUP = [{ label: "Basic", amount: "" }, { label: "HRA", amount: "" }, { label: "Allowances", amount: "" }];

export default function OfferManagement() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [breakup, setBreakup] = useState(EMPTY_BREAKUP);
  const [saving, setSaving] = useState(false);
  const [historyTarget, setHistoryTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await hrApi.getOffers(user?.accessToken, user?.tokenType, { per_page: 100 });
      if (res.status) setOffers(res.data?.data || res.data || []);
    } catch (err) {
      toast.error(err.message || "Failed to load offers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.accessToken) return;
    load();
    hrApi.getCandidates(user.accessToken, user.tokenType, { per_page: 100, stage: "selected,offer_sent" })
      .then((res) => res.status && setCandidates(res.data?.data || res.data || []))
      .catch(() => {});
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const addBreakupRow = () => setBreakup([...breakup, { label: "", amount: "" }]);
  const removeBreakupRow = (i) => setBreakup(breakup.filter((_, idx) => idx !== i));
  const breakupTotal = breakup.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const save = async () => {
    if (!form.candidate_id || !form.designation || !form.ctc_annual) { toast.error("Candidate, designation and CTC are required"); return; }
    setSaving(true);
    try {
      const salary_breakup = Object.fromEntries(breakup.filter((r) => r.label).map((r) => [r.label, Number(r.amount) || 0]));
      const res = await hrApi.storeOffer({ ...form, salary_breakup }, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Offer created"); setModalOpen(false); setForm(EMPTY_FORM); setBreakup(EMPTY_BREAKUP); load(); }
    } catch (err) {
      toast.error(err.message || "Failed to create offer");
    } finally {
      setSaving(false);
    }
  };

  const approve = async (id) => {
    try { const res = await hrApi.approveOffer(id, user?.accessToken, user?.tokenType); if (res.status) { toast.success("Offer approved"); load(); } }
    catch (err) { toast.error(err.message || "Failed to approve"); }
  };
  const release = async (id) => {
    try { const res = await hrApi.releaseOffer(id, user?.accessToken, user?.tokenType); if (res.status) { toast.success("Offer released"); load(); } }
    catch (err) { toast.error(err.message || "Failed to release"); }
  };
  const respond = async (id, status) => {
    try { const res = await hrApi.respondOffer(id, { status }, user?.accessToken, user?.tokenType); if (res.status) { toast.success(`Offer ${status}`); load(); } }
    catch (err) { toast.error(err.message || "Failed to record response"); }
  };
  const withdraw = async (id) => {
    if (!window.confirm("Withdraw this offer?")) return;
    try { const res = await hrApi.deleteOffer(id, user?.accessToken, user?.tokenType); if (res.status) { toast.success("Offer withdrawn"); load(); } }
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
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Offer Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Draft, approve, release and track offers</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setModalOpen(true)}>New Offer</Button>
      </div>

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
