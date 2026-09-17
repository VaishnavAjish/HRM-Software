import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../../../../context/AuthContext";
import { useCompany } from "../../../../../context/CompanyContext";
import Modal from "../../../../../components/ui/Modal";
import Button from "../../../../../components/ui/Button";
import Badge from "../../../../../components/ui/Badge";
import { useMediclaimAuthorization } from "../../../hooks/useMediclaimAuthorization";
import { mediclaimApi } from "../../../services/mediclaimApi";
import HospitalDirectory from "../../../components/HospitalDirectory";
import { getHospitalContactPhotoUrl } from "../../../utils/formatters";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const smallInputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const EMPTY_FORM = {
  name: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  latitude: "",
  longitude: "",
  googleMapsUrl: "",
  specialties: "",
  isNetworkHospital: true,
  cashlessAvailable: false,
  status: "ACTIVE",
};

const EMPTY_CONTACT_FORM = { name: "", designation: "", phone: "", email: "", availability: "" };

/**
 * Wraps the existing, unmodified `HospitalDirectory` (read-only browse) with
 * a management table for create/update/delete — the admin-only actions the
 * plain directory intentionally doesn't expose. This tab fetches its own
 * `hospitals` list rather than reusing `useMediclaimLookups` (that hook also
 * preloads `myMembers`/`ruleBooks`, which this tab has no use for and which
 * would surface an unrelated permission failure as a misleading error here).
 *
 * "Delete" never removes the row (the backend only status-flips it to
 * `inactive` — historical claims still need to resolve the hospital they
 * were treated at) — this management table defaults to hiding inactive rows
 * behind a "Show removed hospitals" toggle instead, which is what actually
 * satisfies "removed hospital disappears from the list" without touching
 * the retention behavior. `HospitalDirectory` itself always excludes
 * inactive hospitals regardless of this toggle, since that's the surface an
 * employee browses to decide where to go for treatment.
 *
 * The Edit drawer (only once a hospital already exists) also manages its
 * contact roster — a named "concern person" with phone + optional
 * designation/email/photo — via the new `hospitals/{id}/contacts` endpoints.
 */
export default function HospitalsTab() {
  const { user } = useAuth();
  const { companyScope } = useCompany();
  const { can } = useMediclaimAuthorization();

  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = `${accessToken ?? ""}|${tokenType ?? ""}|${reloadToken}`;
  const [result, setResult] = useState({ key: null, hospitals: [], error: null });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  // The hospital's contact roster, tracked separately from `form` so an
  // add/edit/delete inside the drawer can update the list immediately
  // (each contact endpoint returns the hospital with a fresh `contacts`
  // relation) without waiting for the outer `load()` refetch.
  const [drawerContacts, setDrawerContacts] = useState([]);
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT_FORM);
  const [editingContactId, setEditingContactId] = useState(null);
  const [contactPhotoFile, setContactPhotoFile] = useState(null);
  const [savingContact, setSavingContact] = useState(false);
  const [contactFormError, setContactFormError] = useState(null);

  const canCreate = can("mediclaim.hospital.create");
  const canUpdate = can("mediclaim.hospital.update");
  const canDelete = can("mediclaim.hospital.delete");

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    mediclaimApi.hospitals({}, accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const hospitals = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setResult({ key: requestKey, hospitals, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key: requestKey, hospitals: [], error: err?.message || "Failed to load hospitals." });
      });
    return () => { cancelled = true; };
  }, [accessToken, tokenType, requestKey]);

  const loading = result.key !== requestKey;
  const state = { loading, hospitals: result.hospitals, error: loading ? null : result.error };

  const load = () => setReloadToken((n) => n + 1);

  const resetContactForm = () => {
    setContactForm(EMPTY_CONTACT_FORM);
    setEditingContactId(null);
    setContactPhotoFile(null);
    setContactFormError(null);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setDrawerContacts([]);
    resetContactForm();
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
      latitude: hospital.latitude ?? "",
      longitude: hospital.longitude ?? "",
      googleMapsUrl: hospital.googleMapsUrl || hospital.google_maps_url || "",
      specialties: specialties.join(", "),
      isNetworkHospital: hospital.isNetworkHospital ?? hospital.is_network_hospital ?? true,
      cashlessAvailable: hospital.cashlessAvailable ?? hospital.cashless_available ?? false,
      status: hospital.status || "ACTIVE",
    });
    setFormError(null);
    setDrawerContacts(hospital.contacts || hospital.hospitalContacts || []);
    resetContactForm();
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
      latitude: form.latitude !== "" ? Number(form.latitude) : null,
      longitude: form.longitude !== "" ? Number(form.longitude) : null,
      googleMapsUrl: form.googleMapsUrl.trim() || null,
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

  const startEditContact = (contact) => {
    setEditingContactId(contact.id);
    setContactForm({
      name: contact.name || "",
      designation: contact.designation || "",
      phone: contact.phone || "",
      email: contact.email || "",
      availability: contact.availability || "",
    });
    setContactPhotoFile(null);
    setContactFormError(null);
  };

  const submitContact = async () => {
    if (!contactForm.name.trim() || !contactForm.phone.trim()) {
      setContactFormError("Name and phone number are required.");
      return;
    }

    setSavingContact(true);
    setContactFormError(null);
    const payload = { ...contactForm, photo: contactPhotoFile || undefined };

    try {
      const res = editingContactId
        ? await mediclaimApi.updateHospitalContact(editingId, editingContactId, payload, user?.accessToken, user?.tokenType)
        : await mediclaimApi.createHospitalContact(editingId, payload, user?.accessToken, user?.tokenType);
      setDrawerContacts(res?.data?.contacts || []);
      toast.success(editingContactId ? "Contact updated" : "Contact added");
      resetContactForm();
      load();
    } catch (err) {
      setContactFormError(err?.message || "Failed to save this contact.");
    } finally {
      setSavingContact(false);
    }
  };

  const removeContact = async (contact) => {
    if (!window.confirm(`Remove "${contact.name || contact.designation || "this contact"}"?`)) return;
    try {
      const res = await mediclaimApi.deleteHospitalContact(editingId, contact.id, user?.accessToken, user?.tokenType);
      setDrawerContacts(res?.data?.contacts || []);
      if (editingContactId === contact.id) resetContactForm();
      toast.success("Contact removed");
      load();
    } catch (err) {
      toast.error(err?.message || "Failed to remove this contact.");
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

  const visibleHospitals = showInactive
    ? state.hospitals
    : state.hospitals.filter((h) => String(h.status || "").toLowerCase() !== "inactive");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">Manage the hospital network — network status, cashless availability, and contact details.</p>
        {canCreate && <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>New Hospital</Button>}
      </div>

      {(canUpdate || canDelete) && (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 dark:border-gray-700">
            <p className="text-xs font-semibold uppercase text-gray-400">Management</p>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show removed hospitals
            </label>
          </div>
          {state.loading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
          ) : visibleHospitals.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {state.hospitals.length === 0 ? "No hospitals have been added yet." : "No removed hospitals to show."}
            </p>
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
                  {visibleHospitals.map((hospital) => {
                    const id = hospital.id ?? hospital.hospitalId;
                    const isInactive = String(hospital.status || "").toLowerCase() === "inactive";
                    return (
                      <tr key={id}>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{hospital.name}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{hospital.city || "—"}</td>
                        <td className="px-4 py-3"><Badge variant={isInactive ? "gray" : "green"}>{isInactive ? "Removed" : "Active"}</Badge></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-3">
                            {canUpdate && (
                              <button type="button" onClick={() => openEdit(hospital)} className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
                                {isInactive ? "Edit / Restore" : "Edit"}
                              </button>
                            )}
                            {canDelete && !isInactive && (
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

      <Modal
        isOpen={drawerOpen}
        onClose={() => !saving && setDrawerOpen(false)}
        title={editingId ? "Edit Hospital" : "New Hospital"}
        size="lg"
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
          <div className="grid grid-cols-2 gap-4">
            <Field label="Latitude">
              <input
                type="number" step="any" className={inputClass} placeholder="e.g. 21.170240"
                value={form.latitude} onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
              />
            </Field>
            <Field label="Longitude">
              <input
                type="number" step="any" className={inputClass} placeholder="e.g. 72.831061"
                value={form.longitude} onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
              />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-gray-400">
            Optional — pins the exact spot on the employee-facing map. Right-click the hospital on Google Maps and copy the coordinates shown there. Left blank, the map falls back to searching the address above.
          </p>
          <Field label="Google Maps Link">
            <input
              type="url" className={inputClass} placeholder="https://maps.app.goo.gl/…"
              value={form.googleMapsUrl} onChange={(e) => setForm((f) => ({ ...f, googleMapsUrl: e.target.value }))}
            />
          </Field>
          <p className="-mt-2 text-xs text-gray-400">
            Optional — open the hospital in the Google Maps app or site, tap Share, and paste the link here. When set, this is exactly what opens for the employee when they click the hospital's location — takes priority over the coordinates above.
          </p>
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

          {editingId && (
            <div className="border-t border-gray-100 pt-4 dark:border-gray-700">
              <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Concern Person / Contacts</p>

              {drawerContacts.length === 0 ? (
                <p className="mb-3 text-xs text-gray-400">No contact added yet.</p>
              ) : (
                <div className="mb-3 space-y-2">
                  {drawerContacts.map((contact) => {
                    const photoUrl = getHospitalContactPhotoUrl(contact.photo);
                    return (
                      <div key={contact.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700">
                        <div className="flex items-center gap-2">
                          {photoUrl ? (
                            <img src={photoUrl} alt={contact.name || "Contact"} className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                              {(contact.name || contact.designation || "?").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-100">{contact.name || "—"}</p>
                            <p className="text-xs text-gray-400">{[contact.designation, contact.phone].filter(Boolean).join(" · ") || "—"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="button" title="Edit" onClick={() => startEditContact(contact)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                            <Pencil size={13} />
                          </button>
                          <button type="button" title="Remove" onClick={() => removeContact(contact)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-2 rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-600">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{editingContactId ? "Edit contact" : "Add contact"}</p>
                <div className="grid grid-cols-2 gap-2">
                  <input className={smallInputClass} placeholder="Name *" value={contactForm.name} onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))} />
                  <input className={smallInputClass} placeholder="Phone *" value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className={smallInputClass} placeholder="Designation" value={contactForm.designation} onChange={(e) => setContactForm((f) => ({ ...f, designation: e.target.value }))} />
                  <input className={smallInputClass} placeholder="Email" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <input
                  type="file" accept="image/png,image/jpeg,image/webp" className="text-xs text-gray-500 dark:text-gray-400"
                  onChange={(e) => setContactPhotoFile(e.target.files?.[0] || null)}
                />
                {contactFormError && <p className="text-xs text-red-500">{contactFormError}</p>}
                <div className="flex justify-end gap-2">
                  {editingContactId && (
                    <button type="button" onClick={resetContactForm} className="text-xs font-semibold text-gray-500 hover:underline">Cancel</button>
                  )}
                  <Button size="sm" onClick={submitContact} disabled={savingContact}>
                    {savingContact ? "Saving…" : editingContactId ? "Save Contact" : "Add Contact"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
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
