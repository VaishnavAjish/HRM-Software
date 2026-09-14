import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../../../../context/AuthContext";
import { useCompany } from "../../../../../context/CompanyContext";
import Drawer from "../../../../../components/ui/Drawer";
import Button from "../../../../../components/ui/Button";
import Badge from "../../../../../components/ui/Badge";
import { useMediclaimAuthorization } from "../../../hooks/useMediclaimAuthorization";
import { mediclaimApi } from "../../../services/mediclaimApi";
import HospitalDirectory from "../../../components/HospitalDirectory";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const EMPTY_FORM = {
  name: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  specialties: "",
  isNetworkHospital: true,
  cashlessAvailable: false,
  status: "ACTIVE",
};

/**
 * Wraps the existing, unmodified `HospitalDirectory` (read-only browse) with
 * a management table for create/update/delete — the admin-only actions the
 * plain directory intentionally doesn't expose. This tab fetches its own
 * `hospitals` list rather than reusing `useMediclaimLookups` (that hook also
 * preloads `myMembers`/`ruleBooks`, which this tab has no use for and which
 * would surface an unrelated permission failure as a misleading error here).
 */
export default function HospitalsTab() {
  const { user } = useAuth();
  const { companyScope } = useCompany();
  const { can } = useMediclaimAuthorization();

  const [state, setState] = useState({ loading: true, hospitals: [], error: null });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const canCreate = can("mediclaim.hospital.create");
  const canUpdate = can("mediclaim.hospital.update");
  const canDelete = can("mediclaim.hospital.delete");

  const load = () => {
    if (!user?.accessToken) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    mediclaimApi.hospitals({}, user.accessToken, user.tokenType)
      .then((res) => {
        const payload = res?.data;
        const hospitals = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setState({ loading: false, hospitals, error: null });
      })
      .catch((err) => {
        setState({ loading: false, hospitals: [], error: err?.message || "Failed to load hospitals." });
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setDrawerOpen(true);
  };

  const openEdit = (hospital) => {
    const specialties = hospital.specialties || hospital.specialities || [];
    setEditingId(hospital.id ?? hospital.hospitalId);
    setForm({
      name: hospital.name || "",
      address: hospital.address || "",
      city: hospital.city || "",
      state: hospital.state || "",
      pincode: hospital.pincode || hospital.pinCode || "",
      specialties: specialties.join(", "),
      isNetworkHospital: hospital.isNetworkHospital ?? hospital.is_network_hospital ?? true,
      cashlessAvailable: hospital.cashlessAvailable ?? hospital.cashless_available ?? false,
      status: hospital.status || "ACTIVE",
    });
    setFormError(null);
    setDrawerOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setFormError("Hospital name is required.");
      return;
    }

    setSaving(true);
    setFormError(null);
    const payload = {
      name: form.name.trim(),
      address: form.address || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      pincode: form.pincode || undefined,
      companyCode: companyScope?.companyId || undefined,
      specialties: form.specialties ? form.specialties.split(",").map((s) => s.trim()).filter(Boolean) : [],
      isNetworkHospital: Boolean(form.isNetworkHospital),
      cashlessAvailable: Boolean(form.cashlessAvailable),
      status: form.status,
    };

    try {
      if (editingId) {
        await mediclaimApi.updateHospital(editingId, payload, user?.accessToken, user?.tokenType);
        toast.success("Hospital updated");
      } else {
        await mediclaimApi.createHospital(payload, user?.accessToken, user?.tokenType);
        toast.success("Hospital added");
      }
      setDrawerOpen(false);
      load();
    } catch (err) {
      setFormError(err?.message || "Failed to save the hospital.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (hospital) => {
    const id = hospital.id ?? hospital.hospitalId;
    if (!window.confirm(`Remove "${hospital.name}" from the hospital directory?`)) return;
    setDeletingId(id);
    try {
      await mediclaimApi.deleteHospital(id, user?.accessToken, user?.tokenType);
      toast.success("Hospital removed");
      load();
    } catch (err) {
      toast.error(err?.message || "Failed to remove this hospital.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">Manage the hospital network — network status, cashless availability, and contact details.</p>
        {canCreate && <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>New Hospital</Button>}
      </div>

      {(canUpdate || canDelete) && (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {state.loading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
          ) : state.hospitals.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No hospitals have been added yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">City</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {state.hospitals.map((hospital) => {
                    const id = hospital.id ?? hospital.hospitalId;
                    return (
                      <tr key={id}>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{hospital.name}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{hospital.city || "—"}</td>
                        <td className="px-4 py-3"><Badge variant={String(hospital.status || "").toLowerCase() === "active" ? "green" : "gray"}>{hospital.status || "—"}</Badge></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-3">
                            {canUpdate && (
                              <button type="button" onClick={() => openEdit(hospital)} className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">Edit</button>
                            )}
                            {canDelete && (
                              <button type="button" disabled={deletingId === id} onClick={() => remove(hospital)} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50 dark:text-red-400">
                                {deletingId === id ? "Removing…" : "Delete"}
                              </button>
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
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Directory</p>
        <HospitalDirectory hospitals={state.hospitals} loading={state.loading} error={state.error} />
      </div>

      <Drawer
        isOpen={drawerOpen}
        onClose={() => !saving && setDrawerOpen(false)}
        title={editingId ? "Edit Hospital" : "New Hospital"}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            <input className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Address">
            <input className={inputClass} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-3 gap-4">
            <Field label="City"><input className={inputClass} value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} /></Field>
            <Field label="State"><input className={inputClass} value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} /></Field>
            <Field label="Pincode"><input className={inputClass} value={form.pincode} onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))} /></Field>
          </div>
          <Field label="Specialties (comma separated)">
            <input className={inputClass} value={form.specialties} onChange={(e) => setForm((f) => ({ ...f, specialties: e.target.value }))} placeholder="Cardiology, Orthopedics, …" />
          </Field>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input type="checkbox" checked={form.isNetworkHospital} onChange={(e) => setForm((f) => ({ ...f, isNetworkHospital: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600" />
              Network hospital
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input type="checkbox" checked={form.cashlessAvailable} onChange={(e) => setForm((f) => ({ ...f, cashlessAvailable: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600" />
              Cashless available
            </label>
          </div>
          <Field label="Status">
            <select className={inputClass} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </Field>
          {formError && <p className="text-xs text-red-500">{formError}</p>}
        </div>
      </Drawer>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
