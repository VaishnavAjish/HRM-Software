import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { QRCodeSVG } from "qrcode.react";
import { Plus, UserPlus, RotateCcw, ArrowRightLeft, QrCode, Laptop, PackageCheck, PackageX, AlertTriangle } from "lucide-react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import { StatCard } from "../../../components/ui/Card";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { hrApi, salaryApi } from "../../../utils/api";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STATUS_VARIANT = { available: "green", assigned: "blue", returned: "gray", damaged: "red", lost: "red", retired: "gray" };
const CATEGORIES = ["Laptop", "Desktop", "Monitor", "Keyboard", "Mouse", "Mobile", "SIM Card", "Headset", "ID Card", "Access Card", "Vehicle", "Uniform", "Software License"];

const EMPTY_FORM = { asset_tag: "", category: "Laptop", brand: "", model: "", serial_number: "", purchase_date: "", purchase_cost: "", warranty_expiry: "", condition: "new", notes: "" };

export default function AssetAllocation() {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState([]);
  const [dashboard, setDashboard] = useState({});
  const [employees, setEmployees] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [allocateTarget, setAllocateTarget] = useState(null);
  const [allocateUserId, setAllocateUserId] = useState("");
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferUserId, setTransferUserId] = useState("");
  const [qrTarget, setQrTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [assetsRes, dashRes] = await Promise.all([
        hrApi.getAssets(user?.accessToken, user?.tokenType, { ...companyScope, per_page: 100 }),
        hrApi.getAssetDashboard(user?.accessToken, user?.tokenType, companyScope),
      ]);
      if (assetsRes.status) setAssets(assetsRes.data?.data || assetsRes.data || []);
      if (dashRes.status) setDashboard(dashRes.data || {});
    } catch (err) {
      toast.error(err.message || "Failed to load assets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.accessToken) return;
    load();
    salaryApi.getAllEmployees(user.accessToken, user.tokenType, { limit: 1000 }, companyScope)
      .then((res) => setEmployees(res?.data?.users?.data ?? res?.data?.users ?? []))
      .catch(() => {});
  }, [user, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!form.asset_tag.trim() || !form.category) { toast.error("Asset tag and category are required"); return; }
    setSaving(true);
    try {
      const res = await hrApi.storeAsset(form, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Asset added"); setModalOpen(false); setForm(EMPTY_FORM); load(); }
    } catch (err) {
      toast.error(err.message || "Failed to add asset");
    } finally {
      setSaving(false);
    }
  };

  const submitAllocate = async () => {
    if (!allocateUserId) { toast.error("Select an employee"); return; }
    try {
      const res = await hrApi.allocateAsset(allocateTarget.id, { user_id: allocateUserId }, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Asset allocated"); setAllocateTarget(null); setAllocateUserId(""); load(); }
    } catch (err) {
      toast.error(err.message || "Failed to allocate");
    }
  };

  const returnAsset = async (asset) => {
    try {
      const res = await hrApi.returnAsset(asset.id, {}, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Asset returned"); load(); }
    } catch (err) {
      toast.error(err.message || "Failed to return asset");
    }
  };

  const submitTransfer = async () => {
    if (!transferUserId) { toast.error("Select an employee"); return; }
    try {
      const res = await hrApi.transferAsset(transferTarget.id, { user_id: transferUserId }, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Asset transferred"); setTransferTarget(null); setTransferUserId(""); load(); }
    } catch (err) {
      toast.error(err.message || "Failed to transfer");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Asset Allocation</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Track, allocate and recover company assets</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setModalOpen(true)}>Add Asset</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard title="Assigned" value={dashboard.assigned ?? "—"} icon={<Laptop size={20} />} color="blue" />
        <StatCard title="Available" value={dashboard.available ?? "—"} icon={<PackageCheck size={20} />} color="green" />
        <StatCard title="Returned" value={dashboard.returned ?? "—"} icon={<RotateCcw size={20} />} color="gray" compact />
        <StatCard title="Damaged" value={dashboard.damaged ?? "—"} icon={<AlertTriangle size={20} />} color="yellow" />
        <StatCard title="Lost" value={dashboard.lost ?? "—"} icon={<PackageX size={20} />} color="red" />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6"><SkeletonTable rows={6} /></div>
        ) : assets.length === 0 ? (
          <p className="text-center py-16 text-sm text-gray-500 dark:text-gray-400">No assets registered yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left px-4 py-3">Asset Tag</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">Brand / Model</th>
                  <th className="text-left px-4 py-3">Assigned To</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {assets.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{a.asset_tag}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.category}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{[a.brand, a.model].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.active_allocation?.user?.name || "—"}</td>
                    <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[a.status] || "gray"}>{a.status}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button title="QR code" onClick={() => setQrTarget(a)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><QrCode size={15} /></button>
                        {a.status === "available" && (
                          <button title="Allocate" onClick={() => setAllocateTarget(a)} className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"><UserPlus size={15} /></button>
                        )}
                        {a.status === "assigned" && (
                          <>
                            <button title="Return" onClick={() => returnAsset(a)} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"><RotateCcw size={15} /></button>
                            <button title="Transfer" onClick={() => setTransferTarget(a)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><ArrowRightLeft size={15} /></button>
                          </>
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

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Add Asset" size="lg"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Add Asset"}</Button></div>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Asset Tag" required><input className={inputClass} value={form.asset_tag} onChange={(e) => setForm({ ...form, asset_tag: e.target.value })} /></Field>
          <Field label="Category" required>
            <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Brand"><input className={inputClass} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
          <Field label="Model"><input className={inputClass} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
          <Field label="Serial Number"><input className={inputClass} value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} /></Field>
          <Field label="Condition">
            <select className={inputClass} value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
              <option value="new">New</option><option value="good">Good</option><option value="fair">Fair</option><option value="damaged">Damaged</option>
            </select>
          </Field>
          <Field label="Purchase Date"><input type="date" className={inputClass} value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></Field>
          <Field label="Purchase Cost"><input type="number" className={inputClass} value={form.purchase_cost} onChange={(e) => setForm({ ...form, purchase_cost: e.target.value })} /></Field>
          <Field label="Warranty Expiry"><input type="date" className={inputClass} value={form.warranty_expiry} onChange={(e) => setForm({ ...form, warranty_expiry: e.target.value })} /></Field>
          <Field label="Notes" full><textarea rows={2} className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal isOpen={!!allocateTarget} onClose={() => setAllocateTarget(null)} title={`Allocate — ${allocateTarget?.asset_tag || ""}`}
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAllocateTarget(null)}>Cancel</Button><Button onClick={submitAllocate}>Allocate</Button></div>}>
        <Field label="Employee" required>
          <select className={inputClass} value={allocateUserId} onChange={(e) => setAllocateUserId(e.target.value)}>
            <option value="">— Select employee —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name} {e.emp_code ? `(${e.emp_code})` : ""}</option>)}
          </select>
        </Field>
      </Modal>

      <Modal isOpen={!!transferTarget} onClose={() => setTransferTarget(null)} title={`Transfer — ${transferTarget?.asset_tag || ""}`}
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setTransferTarget(null)}>Cancel</Button><Button onClick={submitTransfer}>Transfer</Button></div>}>
        <Field label="New Employee" required>
          <select className={inputClass} value={transferUserId} onChange={(e) => setTransferUserId(e.target.value)}>
            <option value="">— Select employee —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name} {e.emp_code ? `(${e.emp_code})` : ""}</option>)}
          </select>
        </Field>
      </Modal>

      <Modal isOpen={!!qrTarget} onClose={() => setQrTarget(null)} title={`QR Code — ${qrTarget?.asset_tag || ""}`} size="sm">
        <div className="flex flex-col items-center gap-4 py-4">
          {qrTarget && <QRCodeSVG value={qrTarget.qr_code_value || qrTarget.asset_tag} size={180} />}
          <p className="text-xs text-gray-500 dark:text-gray-400">{qrTarget?.qr_code_value || qrTarget?.asset_tag}</p>
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
