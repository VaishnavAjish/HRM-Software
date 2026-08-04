import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { QRCodeSVG } from "qrcode.react";
import {
  Plus, UserPlus, RotateCcw, ArrowRightLeft, QrCode, Laptop, PackageCheck, PackageX,
  AlertTriangle, Search, Pencil, Trash2, History, Clock,
} from "lucide-react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import Drawer, { CollapsibleSection } from "../../../components/ui/Drawer";
import Pagination from "../../../components/ui/Pagination";
import { StatCard } from "../../../components/ui/Card";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { hrApi, salaryApi } from "../../../utils/api";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const smallInputClass = "rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STATUS_VARIANT = { available: "green", assigned: "blue", returned: "gray", damaged: "red", lost: "red", retired: "gray" };
const CATEGORIES = ["Laptop", "Desktop", "Monitor", "Keyboard", "Mouse", "Mobile", "SIM Card", "Headset", "ID Card", "Access Card", "Vehicle", "Uniform", "Software License"];
const EXPIRY_WARNING_DAYS = 30;

const EMPTY_FORM = { asset_tag: "", category: "Laptop", brand: "", model: "", serial_number: "", purchase_date: "", purchase_cost: "", warranty_expiry: "", amc_expiry: "", condition: "new", notes: "" };

/** null if no expiry set, "expired" | "soon" | "ok" otherwise. */
function expiryState(dateStr) {
  if (!dateStr) return null;
  const days = Math.round((new Date(dateStr) - new Date()) / 86400000);
  if (days < 0) return "expired";
  if (days <= EXPIRY_WARNING_DAYS) return "soon";
  return "ok";
}

export default function AssetAllocation() {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [dashboard, setDashboard] = useState({});
  const [employees, setEmployees] = useState([]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [allocateTarget, setAllocateTarget] = useState(null);
  const [allocateUserId, setAllocateUserId] = useState("");
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferUserId, setTransferUserId] = useState("");
  const [qrTarget, setQrTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [debouncedSearch, category, status, scopeKey]);

  const loadAssets = useCallback(() => {
    setLoading(true);
    return hrApi.getAssets(user?.accessToken, user?.tokenType, {
      ...companyScope, page, per_page: perPage,
      search: debouncedSearch || undefined, category: category || undefined, status: status || undefined,
    })
      .then((res) => {
        if (!res.status) return;
        const payload = res.data;
        setAssets(payload?.data || []);
        setTotal(payload?.total ?? (payload?.data?.length || 0));
      })
      .catch((err) => toast.error(err.message || "Failed to load assets"))
      .finally(() => setLoading(false));
  }, [user, companyScope, page, perPage, debouncedSearch, category, status]);

  const loadDashboard = useCallback(() => {
    hrApi.getAssetDashboard(user?.accessToken, user?.tokenType, companyScope)
      .then((res) => { if (res.status) setDashboard(res.data || {}); })
      .catch(() => {});
  }, [user, companyScope]);

  useEffect(() => { if (user?.accessToken) loadAssets(); }, [loadAssets]);
  useEffect(() => { if (user?.accessToken) loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    if (!user?.accessToken) return;
    salaryApi.getAllEmployees(user.accessToken, user.tokenType, { status: "Active", limit: 1000 }, companyScope?.companyId)
      .then((res) => setEmployees(res?.data?.users?.data ?? res?.data?.users ?? []))
      .catch(() => {});
  }, [user, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = () => { loadAssets(); loadDashboard(); };

  const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM); setModalOpen(true); };
  const openEdit = (asset) => {
    setEditingId(asset.id);
    setForm({
      asset_tag: asset.asset_tag, category: asset.category, brand: asset.brand || "", model: asset.model || "",
      serial_number: asset.serial_number || "", purchase_date: asset.purchase_date || "", purchase_cost: asset.purchase_cost || "",
      warranty_expiry: asset.warranty_expiry || "", amc_expiry: asset.amc_expiry || "", condition: asset.condition || "new", notes: asset.notes || "",
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.asset_tag.trim() || !form.category) { toast.error("Asset tag and category are required"); return; }
    setSaving(true);
    try {
      const res = editingId
        ? await hrApi.updateAsset(editingId, form, user?.accessToken, user?.tokenType)
        : await hrApi.storeAsset(form, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success(editingId ? "Asset updated" : "Asset added"); setModalOpen(false); setForm(EMPTY_FORM); setEditingId(null); reload(); }
    } catch (err) {
      toast.error(err.message || "Failed to save asset");
    } finally {
      setSaving(false);
    }
  };

  const removeAsset = async (asset) => {
    if (!window.confirm(`Delete asset ${asset.asset_tag}?`)) return;
    try {
      const res = await hrApi.deleteAsset(asset.id, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Asset deleted"); setDetailTarget(null); reload(); }
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    }
  };

  const submitAllocate = async () => {
    if (!allocateUserId) { toast.error("Select an employee"); return; }
    try {
      const res = await hrApi.allocateAsset(allocateTarget.id, { user_id: allocateUserId }, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Asset allocated"); setAllocateTarget(null); setAllocateUserId(""); reload(); openDetail({ id: allocateTarget.id }); }
    } catch (err) {
      toast.error(err.message || "Failed to allocate");
    }
  };

  const doReturn = async (asset) => {
    try {
      const res = await hrApi.returnAsset(asset.id, {}, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Asset returned"); reload(); if (detailTarget) openDetail({ id: asset.id }); }
    } catch (err) {
      toast.error(err.message || "Failed to return asset");
    }
  };

  const submitTransfer = async () => {
    if (!transferUserId) { toast.error("Select an employee"); return; }
    try {
      const res = await hrApi.transferAsset(transferTarget.id, { user_id: transferUserId }, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Asset transferred"); setTransferTarget(null); setTransferUserId(""); reload(); openDetail({ id: transferTarget.id }); }
    } catch (err) {
      toast.error(err.message || "Failed to transfer");
    }
  };

  const openDetail = (asset) => {
    setDetailTarget(asset);
    setDetailLoading(true);
    hrApi.getAsset(asset.id, user?.accessToken, user?.tokenType)
      .then((res) => { if (res.status) setDetailTarget(res.data); })
      .catch((err) => toast.error(err.message || "Failed to load asset"))
      .finally(() => setDetailLoading(false));
  };

  // Scanning an asset's QR code lands here with ?asset=<id> — open that
  // asset's detail drawer directly instead of making someone hunt for it
  // in the table.
  useEffect(() => {
    const assetId = searchParams.get("asset");
    if (!assetId || !user?.accessToken) return;
    openDetail({ id: assetId });
    const next = new URLSearchParams(searchParams);
    next.delete("asset");
    setSearchParams(next, { replace: true });
  }, [user, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasFilters = search || category || status;
  const clearFilters = () => { setSearch(""); setCategory(""); setStatus(""); };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Register, allocate, transfer and recover every company asset</p>
        <Button icon={<Plus size={16} />} onClick={openAdd}>Add Asset</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard title="Assigned" value={dashboard.assigned ?? "—"} icon={<Laptop size={20} />} color="blue" />
        <StatCard title="Available" value={dashboard.available ?? "—"} icon={<PackageCheck size={20} />} color="green" />
        <StatCard title="Returned" value={dashboard.returned ?? "—"} icon={<RotateCcw size={20} />} color="gray" compact />
        <StatCard title="Damaged" value={dashboard.damaged ?? "—"} icon={<AlertTriangle size={20} />} color="yellow" />
        <StatCard title="Lost" value={dashboard.lost ?? "—"} icon={<PackageX size={20} />} color="red" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tag, serial, brand, model…" className={`${smallInputClass} w-full pl-9`} />
        </div>
        <select className={smallInputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={smallInputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {Object.keys(STATUS_VARIANT).map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs font-semibold text-gray-500 hover:text-brand-600 dark:text-gray-400">Clear filters</button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6"><SkeletonTable rows={6} /></div>
        ) : assets.length === 0 ? (
          <p className="text-center py-16 text-sm text-gray-500 dark:text-gray-400">No assets match these filters</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left px-4 py-3">Asset Tag</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">Brand / Model</th>
                  <th className="text-left px-4 py-3">Assigned To</th>
                  <th className="text-left px-4 py-3">Warranty / AMC</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {assets.map((a) => {
                  const warrantyState = expiryState(a.warranty_expiry);
                  const amcState = expiryState(a.amc_expiry);
                  const worstExpiry = [warrantyState, amcState].includes("expired") ? "expired" : [warrantyState, amcState].includes("soon") ? "soon" : null;
                  return (
                    <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => openDetail(a)}>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{a.asset_tag}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.category}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{[a.brand, a.model].filter(Boolean).join(" / ") || "—"}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.active_allocation?.user?.name || "—"}</td>
                      <td className="px-4 py-3">
                        {worstExpiry && (
                          <span className={`flex items-center gap-1 text-xs font-semibold ${worstExpiry === "expired" ? "text-red-500" : "text-yellow-600"}`}>
                            <Clock size={12} /> {worstExpiry === "expired" ? "Expired" : "Expiring soon"}
                          </span>
                        )}
                        {!worstExpiry && <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[a.status] || "gray"}>{a.status}</Badge></td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button title="QR code" onClick={() => setQrTarget(a)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><QrCode size={15} /></button>
                          {a.status === "available" && (
                            <button title="Allocate" onClick={() => setAllocateTarget(a)} className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"><UserPlus size={15} /></button>
                          )}
                          {a.status === "assigned" && (
                            <>
                              <button title="Return" onClick={() => doReturn(a)} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"><RotateCcw size={15} /></button>
                              <button title="Transfer" onClick={() => setTransferTarget(a)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><ArrowRightLeft size={15} /></button>
                            </>
                          )}
                          <button title="Edit" onClick={() => openEdit(a)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4">
          <Pagination current={page} total={total} pageSize={perPage} onChange={setPage} onPageSizeChange={setPerPage} />
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit Asset" : "Add Asset"} size="lg"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving..." : editingId ? "Save Changes" : "Add Asset"}</Button></div>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Asset Tag" required><input className={inputClass} value={form.asset_tag} disabled={!!editingId} onChange={(e) => setForm({ ...form, asset_tag: e.target.value })} /></Field>
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
          <Field label="AMC Expiry"><input type="date" className={inputClass} value={form.amc_expiry} onChange={(e) => setForm({ ...form, amc_expiry: e.target.value })} /></Field>
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
          {/* Encodes a link straight to this asset's detail drawer — scanning
              it used to just show the bare asset tag as text, which opened
              nothing. Whoever scans it needs to be signed in, same as any
              other admin page. */}
          {qrTarget && <QRCodeSVG value={`${window.location.origin}/admin/hr/assets?asset=${qrTarget.id}`} size={180} />}
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            {qrTarget?.asset_tag}
            <br />Scan to open this asset in the admin app
          </p>
        </div>
      </Modal>

      {/* ── Asset detail drawer: full allocation history ── */}
      <Drawer isOpen={!!detailTarget} onClose={() => setDetailTarget(null)} title={detailTarget?.asset_tag} subtitle={detailTarget?.category} size="md">
        {detailTarget && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANT[detailTarget.status] || "gray"}>{detailTarget.status}</Badge>
              {detailTarget.condition && <Badge variant="gray">{detailTarget.condition}</Badge>}
            </div>

            <CollapsibleSection title="Details" icon={<Laptop size={15} />}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <InfoRow label="Brand / Model" value={[detailTarget.brand, detailTarget.model].filter(Boolean).join(" / ") || "—"} />
                <InfoRow label="Serial Number" value={detailTarget.serial_number || "—"} />
                <InfoRow label="Purchase Date" value={detailTarget.purchase_date || "—"} />
                <InfoRow label="Purchase Cost" value={detailTarget.purchase_cost ? `₹${Number(detailTarget.purchase_cost).toLocaleString("en-IN")}` : "—"} />
                <InfoRow label="Warranty Expiry" value={detailTarget.warranty_expiry || "—"} warn={expiryState(detailTarget.warranty_expiry)} />
                <InfoRow label="AMC Expiry" value={detailTarget.amc_expiry || "—"} warn={expiryState(detailTarget.amc_expiry)} />
              </div>
              {detailTarget.notes && <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 whitespace-pre-line">{detailTarget.notes}</p>}
            </CollapsibleSection>

            <CollapsibleSection title="Allocation History" icon={<History size={15} />} count={detailTarget.allocations?.length}>
              {detailLoading ? (
                <p className="text-xs text-gray-400 text-center py-2">Loading…</p>
              ) : !detailTarget.allocations || detailTarget.allocations.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">Never allocated</p>
              ) : (
                <div className="space-y-2">
                  {detailTarget.allocations.map((al) => (
                    <div key={al.id} className="rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{al.user?.name || "—"}</span>
                        <Badge variant={al.status === "active" ? "blue" : "gray"}>{al.status}</Badge>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Allocated {al.allocated_at ? new Date(al.allocated_at).toLocaleDateString() : "—"}
                        {al.allocated_by?.name && ` by ${al.allocated_by.name}`}
                        {al.returned_at && ` · Returned ${new Date(al.returned_at).toLocaleDateString()}`}
                        {al.return_condition && ` (${al.return_condition})`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleSection>

            <div className="flex flex-wrap gap-2 pt-2">
              {detailTarget.status === "available" && (
                <Button size="sm" icon={<UserPlus size={14} />} onClick={() => setAllocateTarget(detailTarget)}>Allocate</Button>
              )}
              {detailTarget.status === "assigned" && (
                <>
                  <Button size="sm" variant="secondary" icon={<RotateCcw size={14} />} onClick={() => doReturn(detailTarget)}>Return</Button>
                  <Button size="sm" variant="secondary" icon={<ArrowRightLeft size={14} />} onClick={() => setTransferTarget(detailTarget)}>Transfer</Button>
                </>
              )}
              <Button size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={() => { setDetailTarget(null); openEdit(detailTarget); }}>Edit</Button>
              <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => removeAsset(detailTarget)}>Delete</Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function InfoRow({ label, value, warn }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className={`text-sm ${warn === "expired" ? "text-red-500 font-semibold" : warn === "soon" ? "text-yellow-600 font-semibold" : "text-gray-700 dark:text-gray-200"}`}>{value}</p>
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
