import { useState, useCallback, useEffect, useMemo } from "react";
import toast from "react-hot-toast";
import {
  FileText, Plus, RefreshCw, Search, Loader2, Pencil, Trash2, Power, PowerOff, Shield,
  Building2, MapPin, Users, CreditCard, FolderOpen,
} from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import { organizationApi } from "../../../features/organization/services/organizationApi";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function Th({ children, className = "" }) {
  return <th scope="col" className={`px-4 py-3 whitespace-nowrap ${className}`}>{children}</th>;
}

const TABS = [
  { id: "profile", label: "Profile", icon: FileText },
  { id: "registrations", label: "Registrations", icon: FolderOpen },
  { id: "addresses", label: "Addresses", icon: MapPin },
  { id: "representatives", label: "Representatives", icon: Users },
  { id: "bankAccounts", label: "Bank Accounts", icon: CreditCard },
  { id: "documents", label: "Documents", icon: FileText },
];

function LegalEntityProfileModal({ profile, companies, busy, onSave, onClose }) {
  const isEdit = Boolean(profile);
  const [form, setForm] = useState({
    companyId: profile?.companyId ?? "",
    legalName: profile?.legalName ?? "",
    tradingName: profile?.tradingName ?? "",
    corporateIdentificationNumber: profile?.corporateIdentificationNumber ?? "",
    incorporationDate: profile?.incorporationDate ?? "",
    countryCode: profile?.countryCode ?? "IN",
    registeredAddress: profile?.registeredAddress ?? "",
    correspondenceAddress: profile?.correspondenceAddress ?? "",
    contactEmail: profile?.contactEmail ?? "",
    contactPhone: profile?.contactPhone ?? "",
    website: profile?.website ?? "",
    isActive: profile?.isActive ?? true,
    effectiveFrom: profile?.effectiveFrom ?? "",
    effectiveTo: profile?.effectiveTo ?? "",
  });
  const [codeTouched, setCodeTouched] = useState(isEdit);

  const lockedCompany = companies.length <= 1;
  const canSave = form.legalName.trim() && form.companyId;

  const change = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? `Edit ${profile.legalName}` : "Add Legal Entity Profile"} size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !canSave} onClick={() => onSave({ ...form, companyId: Number(form.companyId) })}>
            {busy && <Loader2 size={16} className="animate-spin" />} Save
          </Button>
        </div>
      }>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Company *</span>
            <select className={inputClass} value={form.companyId} disabled={lockedCompany} onChange={(e) => change("companyId")(e.target.value)}>
              <option value="">Select company</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {lockedCompany && <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Your account is scoped to this company.</span>}
          </label>
          <label className="block"><span className={labelClass}>Legal Name *</span><input className={inputClass} value={form.legalName} onChange={(e) => change("legalName")(e.target.value)} /></label>
          <label className="block"><span className={labelClass}>Trading Name</span><input className={inputClass} value={form.tradingName} onChange={(e) => change("tradingName")(e.target.value)} /></label>
          <label className="block"><span className={labelClass}>CIN / Registration No</span><input className={inputClass} value={form.corporateIdentificationNumber} onChange={(e) => change("corporateIdentificationNumber")(e.target.value)} /></label>
          <label className="block"><span className={labelClass}>Incorporation Date</span><input type="date" className={inputClass} value={form.incorporationDate} onChange={(e) => change("incorporationDate")(e.target.value)} /></label>
          <label className="block"><span className={labelClass}>Country Code</span><input className={inputClass} value={form.countryCode} maxLength={2} onChange={(e) => change("countryCode")(e.target.value.toUpperCase())} /></label>
          <label className="block"><span className={labelClass}>Contact Email</span><input type="email" className={inputClass} value={form.contactEmail} onChange={(e) => change("contactEmail")(e.target.value)} /></label>
          <label className="block"><span className={labelClass}>Contact Phone</span><input className={inputClass} value={form.contactPhone} onChange={(e) => change("contactPhone")(e.target.value)} /></label>
          <label className="block"><span className={labelClass}>Website</span><input type="url" className={inputClass} value={form.website} onChange={(e) => change("website")(e.target.value)} /></label>
          <label className="block"><span className={labelClass}>Effective From</span><input type="date" className={inputClass} value={form.effectiveFrom} onChange={(e) => change("effectiveFrom")(e.target.value)} /></label>
          <label className="block"><span className={labelClass}>Effective To</span><input type="date" className={inputClass} value={form.effectiveTo} onChange={(e) => change("effectiveTo")(e.target.value)} /></label>
        </div>
        <label className="block"><span className={labelClass}>Registered Address</span><textarea className={inputClass} rows={2} value={form.registeredAddress} onChange={(e) => change("registeredAddress")(e.target.value)} /></label>
        <label className="block"><span className={labelClass}>Correspondence Address</span><textarea className={inputClass} rows={2} value={form.correspondenceAddress} onChange={(e) => change("correspondenceAddress")(e.target.value)} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" checked={form.isActive} onChange={(e) => change("isActive")(e.target.checked)} /><span className="text-sm text-gray-700 dark:text-gray-200">Active</span></label>
      </div>
    </Modal>
  );
}

function RegistrationModal({ registration, profileId, busy, onSave, onClose }) {
  const isEdit = Boolean(registration);
  const [form, setForm] = useState({
    type: registration?.type ?? "",
    jurisdiction: registration?.jurisdiction ?? "",
    registrationNumber: registration?.registrationNumber ?? "",
    registrationDate: registration?.registrationDate ?? "",
    expiryDate: registration?.expiryDate ?? "",
    isActive: registration?.isActive ?? true,
    notes: registration?.notes ?? "",
  });

  const canSave = form.type.trim() && form.registrationNumber.trim();

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? `Edit Registration` : "Add Registration"} size="md"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy || !canSave} onClick={() => onSave(form)}>{busy && <Loader2 size={16} className="animate-spin" />} Save</Button></div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block"><span className={labelClass}>Type *</span><input className={inputClass} value={form.type} onChange={(e) => setForm({...form, type: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>Jurisdiction</span><input className={inputClass} value={form.jurisdiction} onChange={(e) => setForm({...form, jurisdiction: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>Registration Number *</span><input className={inputClass} value={form.registrationNumber} onChange={(e) => setForm({...form, registrationNumber: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>Registration Date</span><input type="date" className={inputClass} value={form.registrationDate} onChange={(e) => setForm({...form, registrationDate: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>Expiry Date</span><input type="date" className={inputClass} value={form.expiryDate} onChange={(e) => setForm({...form, expiryDate: e.target.value})} /></label>
        </div>
        <label className="block"><span className={labelClass}>Notes</span><textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" checked={form.isActive} onChange={(e) => setForm({...form, isActive: e.target.checked})} /><span className="text-sm text-gray-700 dark:text-gray-200">Active</span></label>
      </div>
    </Modal>
  );
}

function AddressModal({ address, profileId, busy, onSave, onClose }) {
  const isEdit = Boolean(address);
  const [form, setForm] = useState({
    type: address?.type ?? "",
    addressLine1: address?.addressLine1 ?? "",
    addressLine2: address?.addressLine2 ?? "",
    city: address?.city ?? "",
    state: address?.state ?? "",
    countryCode: address?.countryCode ?? "IN",
    postalCode: address?.postalCode ?? "",
    isPrimary: address?.isPrimary ?? false,
    isActive: address?.isActive ?? true,
  });

  const canSave = form.type.trim() && form.addressLine1.trim();

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? `Edit Address` : "Add Address"} size="md"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy || !canSave} onClick={() => onSave(form)}>{busy && <Loader2 size={16} className="animate-spin" />} Save</Button></div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block"><span className={labelClass}>Type *</span><input className={inputClass} value={form.type} onChange={(e) => setForm({...form, type: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>Country Code</span><input className={inputClass} value={form.countryCode} maxLength={2} onChange={(e) => setForm({...form, countryCode: e.target.value.toUpperCase()})} /></label>
          <label className="block"><span className={labelClass}>Address Line 1 *</span><input className={inputClass} value={form.addressLine1} onChange={(e) => setForm({...form, addressLine1: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>Address Line 2</span><input className={inputClass} value={form.addressLine2} onChange={(e) => setForm({...form, addressLine2: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>City</span><input className={inputClass} value={form.city} onChange={(e) => setForm({...form, city: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>State</span><input className={inputClass} value={form.state} onChange={(e) => setForm({...form, state: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>Postal Code</span><input className={inputClass} value={form.postalCode} onChange={(e) => setForm({...form, postalCode: e.target.value})} /></label>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" checked={form.isPrimary} onChange={(e) => setForm({...form, isPrimary: e.target.checked})} /><span className="text-sm text-gray-700 dark:text-gray-200">Primary</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" checked={form.isActive} onChange={(e) => setForm({...form, isActive: e.target.checked})} /><span className="text-sm text-gray-700 dark:text-gray-200">Active</span></label>
        </div>
      </div>
    </Modal>
  );
}

function RepresentativeModal({ representative, profileId, busy, onSave, onClose }) {
  const isEdit = Boolean(representative);
  const [form, setForm] = useState({
    name: representative?.name ?? "",
    designation: representative?.designation ?? "",
    email: representative?.email ?? "",
    phone: representative?.phone ?? "",
    pan: representative?.pan ?? "",
    din: representative?.din ?? "",
    type: representative?.type ?? "",
    isPrimary: representative?.isPrimary ?? false,
    isActive: representative?.isActive ?? true,
    appointmentDate: representative?.appointmentDate ?? "",
    cessationDate: representative?.cessationDate ?? "",
  });

  const canSave = form.name.trim() && form.type.trim();

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? `Edit Representative` : "Add Representative"} size="md"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy || !canSave} onClick={() => onSave(form)}>{busy && <Loader2 size={16} className="animate-spin" />} Save</Button></div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block"><span className={labelClass}>Name *</span><input className={inputClass} value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>Type *</span><input className={inputClass} value={form.type} onChange={(e) => setForm({...form, type: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>Designation</span><input className={inputClass} value={form.designation} onChange={(e) => setForm({...form, designation: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>Email</span><input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>Phone</span><input className={inputClass} value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>PAN</span><input className={inputClass} value={form.pan} onChange={(e) => setForm({...form, pan: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>DIN</span><input className={inputClass} value={form.din} onChange={(e) => setForm({...form, din: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>Appointment Date</span><input type="date" className={inputClass} value={form.appointmentDate} onChange={(e) => setForm({...form, appointmentDate: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>Cessation Date</span><input type="date" className={inputClass} value={form.cessationDate} onChange={(e) => setForm({...form, cessationDate: e.target.value})} /></label>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" checked={form.isPrimary} onChange={(e) => setForm({...form, isPrimary: e.target.checked})} /><span className="text-sm text-gray-700 dark:text-gray-200">Primary</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" checked={form.isActive} onChange={(e) => setForm({...form, isActive: e.target.checked})} /><span className="text-sm text-gray-700 dark:text-gray-200">Active</span></label>
        </div>
      </div>
    </Modal>
  );
}

function BankAccountModal({ account, profileId, busy, onSave, onClose }) {
  const isEdit = Boolean(account);
  const [form, setForm] = useState({
    bankName: account?.bankName ?? "",
    branchName: account?.branchName ?? "",
    ifscCode: account?.ifscCode ?? "",
    accountType: account?.accountType ?? "",
    accountNumber: account?.accountNumber ?? "",
    isPrimary: account?.isPrimary ?? false,
    isActive: account?.isActive ?? true,
    effectiveFrom: account?.effectiveFrom ?? "",
    effectiveTo: account?.effectiveTo ?? "",
  });

  const canSave = form.bankName.trim() && form.accountType.trim() && form.accountNumber.trim();

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? `Edit Bank Account` : "Add Bank Account"} size="md"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy || !canSave} onClick={() => onSave(form)}>{busy && <Loader2 size={16} className="animate-spin" />} Save</Button></div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block"><span className={labelClass}>Bank Name *</span><input className={inputClass} value={form.bankName} onChange={(e) => setForm({...form, bankName: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>Branch Name</span><input className={inputClass} value={form.branchName} onChange={(e) => setForm({...form, branchName: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>IFSC Code</span><input className={inputClass} value={form.ifscCode} onChange={(e) => setForm({...form, ifscCode: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>Account Type *</span><input className={inputClass} value={form.accountType} onChange={(e) => setForm({...form, accountType: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>Account Number *</span><input className={inputClass} value={form.accountNumber} minLength={6} maxLength={40} onChange={(e) => setForm({...form, accountNumber: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>Effective From</span><input type="date" className={inputClass} value={form.effectiveFrom} onChange={(e) => setForm({...form, effectiveFrom: e.target.value})} /></label>
          <label className="block"><span className={labelClass}>Effective To</span><input type="date" className={inputClass} value={form.effectiveTo} onChange={(e) => setForm({...form, effectiveTo: e.target.value})} /></label>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" checked={form.isPrimary} onChange={(e) => setForm({...form, isPrimary: e.target.checked})} /><span className="text-sm text-gray-700 dark:text-gray-200">Primary</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" checked={form.isActive} onChange={(e) => setForm({...form, isActive: e.target.checked})} /><span className="text-sm text-gray-700 dark:text-gray-200">Active</span></label>
        </div>
      </div>
    </Modal>
  );
}

export default function LegalEntityProfiles() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [profiles, setProfiles] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [companyFilter, setCompanyFilter] = useState("");

  const [activeTab, setActiveTab] = useState("profile");
  const [dialog, setDialog] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);

  const [childData, setChildData] = useState({
    registrations: [],
    addresses: [],
    representatives: [],
    bankAccounts: [],
    documents: [],
  });

  const reload = useCallback(() => {
    setLoading(true);
    setRefreshKey((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    Promise.all([
      organizationApi.legalEntityProfiles({ search, status, company_id: companyFilter }, token, tokenType),
      organizationApi.legalEntityProfileCompanies(token, tokenType).catch(() => ({ data: [] })),
    ]).then(([profilesRes, companiesRes]) => {
      if (!active) return;
      setProfiles(profilesRes?.data ?? []);
      setCompanies(companiesRes?.data ?? []);
    }).catch((err) => toast.error(err.message || "Could not load profiles")).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, tokenType, search, status, companyFilter, refreshKey]);

  useEffect(() => {
    if (!selectedProfile) return;
    let active = true;
    Promise.all([
      organizationApi.legalEntityRegistrations(selectedProfile.id, {}, token, tokenType),
      organizationApi.legalEntityAddresses(selectedProfile.id, {}, token, tokenType),
      organizationApi.legalEntityRepresentatives(selectedProfile.id, {}, token, tokenType),
      organizationApi.legalEntityBankAccounts(selectedProfile.id, {}, token, tokenType),
      organizationApi.legalEntityProfileDocuments(selectedProfile.id, token, tokenType),
    ]).then(([regs, addrs, reps, banks, docs]) => {
      if (!active) return;
      setChildData({
        registrations: regs?.data ?? [],
        addresses: addrs?.data ?? [],
        representatives: reps?.data ?? [],
        bankAccounts: banks?.data ?? [],
        documents: docs?.data ?? [],
      });
    });
    return () => { active = false; };
  }, [selectedProfile, token, tokenType]);

  const changeFilter = (setter) => (value) => { setLoading(true); setter(value); };

  const run = async (work, message, after = () => {}) => {
    setBusy(true);
    try { await work(); toast.success(message); after(); reload(); } catch (err) { toast.error(err.message || "That did not work"); } finally { setBusy(false); }
  };

  const saveProfile = (payload) => run(
    () => dialog?.id ? organizationApi.updateLegalEntityProfile(dialog.id, payload, token, tokenType) : organizationApi.createLegalEntityProfile(payload, token, tokenType),
    dialog?.id ? "Profile updated" : "Profile created",
  );

  const saveChild = (apiFn, message) => run(() => apiFn(), message);

  const companyOptions = useMemo(() => companies.map((c) => ({ id: c.id, name: c.name })), [companies]);
  const canManage = can("org.legal_entity.create") || can("org.legal_entity.update");

  if (selectedProfile && activeTab !== "profile") {
    const tabsToRender = TABS.slice(1).map((tab) => ({
      ...tab,
      content: (
        <div className="p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">{tab.label}</h3>
            {canManage && (
              <Button onClick={() => setDialog({ type: tab.id, profileId: selectedProfile.id })}>
                <Plus size={14} /> Add {tab.label.slice(0, -1)}
              </Button>
            )}
          </div>
          {tab.id === "registrations" && <ChildTable items={childData.registrations} columns={[
            { key: "type", header: "Type" },
            { key: "jurisdiction", header: "Jurisdiction" },
            { key: "registrationNumber", header: "Registration No" },
            { key: "registrationDate", header: "Reg Date" },
            { key: "expiryDate", header: "Expiry Date" },
            { key: "isActive", header: "Status", render: (i) => i.isActive ? "Active" : "Inactive" },
          ]} onEdit={(r) => setDialog({ type: "registrations", profileId: selectedProfile.id, data: r })} onDelete={(r) => saveChild(() => organizationApi.deleteLegalEntityRegistration(selectedProfile.id, r.id, token, tokenType), "Registration deleted")} />}
          {tab.id === "addresses" && <ChildTable items={childData.addresses} columns={[
            { key: "type", header: "Type" },
            { key: "addressLine1", header: "Address Line 1" },
            { key: "city", header: "City" },
            { key: "state", header: "State" },
            { key: "countryCode", header: "Country" },
            { key: "isPrimary", header: "Primary", render: (i) => i.isPrimary ? "Yes" : "No" },
            { key: "isActive", header: "Status", render: (i) => i.isActive ? "Active" : "Inactive" },
          ]} onEdit={(a) => setDialog({ type: "addresses", profileId: selectedProfile.id, data: a })} onDelete={(a) => saveChild(() => organizationApi.deleteLegalEntityAddress(selectedProfile.id, a.id, token, tokenType), "Address deleted")} />}
          {tab.id === "representatives" && <ChildTable items={childData.representatives} columns={[
            { key: "name", header: "Name" },
            { key: "type", header: "Type" },
            { key: "designation", header: "Designation" },
            { key: "email", header: "Email" },
            { key: "phone", header: "Phone" },
            { key: "isPrimary", header: "Primary", render: (i) => i.isPrimary ? "Yes" : "No" },
            { key: "isActive", header: "Status", render: (i) => i.isActive ? "Active" : "Inactive" },
          ]} onEdit={(r) => setDialog({ type: "representatives", profileId: selectedProfile.id, data: r })} onDelete={(r) => saveChild(() => organizationApi.deleteLegalEntityRepresentative(selectedProfile.id, r.id, token, tokenType), "Representative deleted")} />}
          {tab.id === "bankAccounts" && <ChildTable items={childData.bankAccounts} columns={[
            { key: "bankName", header: "Bank" },
            { key: "branchName", header: "Branch" },
            { key: "accountType", header: "Type" },
            { key: "accountNumber", header: "Account No", render: (i) => `****${i.accountNumber?.slice(-4)}` },
            { key: "ifscCode", header: "IFSC" },
            { key: "isPrimary", header: "Primary", render: (i) => i.isPrimary ? "Yes" : "No" },
            { key: "isActive", header: "Status", render: (i) => i.isActive ? "Active" : "Inactive" },
          ]} onEdit={(b) => setDialog({ type: "bankAccounts", profileId: selectedProfile.id, data: b })} onDelete={(b) => saveChild(() => organizationApi.deleteLegalEntityBankAccount(selectedProfile.id, b.id, token, tokenType), "Bank account deleted")} />}
          {tab.id === "documents" && <ChildTable items={childData.documents} columns={[
            { key: "kind", header: "Kind" },
            { key: "documentName", header: "Document" },
            { key: "createdAt", header: "Uploaded" },
          ]} />}
        </div>
      ),
    }));
    return (
      <div className="min-w-0 max-w-full space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setSelectedProfile(null)}><Back size={16} /> Back to Profiles</Button>
          <h1 className="min-w-0 text-xl font-bold">{selectedProfile.legalName}</h1>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-2 mb-4">
          {tabsToRender.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "primary" : "secondary"}
              className="text-sm"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon && <tab.icon size={14} className="mr-1" />} {tab.label}
            </Button>
          ))}
        </div>
        <div className="space-y-4">
          {tabsToRender.find((t) => t.id === activeTab)?.content}
        </div>
        {dialog && renderChildModal()}
      </div>
    );
  }

  function ChildTable({ items, columns, onEdit, onDelete }) {
    return (
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              <tr>{columns.map((c) => <Th key={c.key}>{c.header}</Th>)}<Th className="text-right">Actions</Th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {items.map((item) => <tr key={item.id}><td colSpan={columns.length + 1} className="px-4 py-3">{columns.map((c) => <span key={c.key} className="mr-4">{c.render ? c.render(item) : item[c.key]}</span>)}<div className="flex justify-end gap-1">{onEdit && <Button size="sm" variant="ghost" onClick={() => onEdit(item)}><Pencil size={14} /></Button>}{onDelete && <Button size="sm" variant="ghost" onClick={() => onDelete(item)}><Trash2 size={14} className="text-red-600" /></Button>}</div></td></tr>)}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  function renderChildModal() {
    const { type, profileId, data } = dialog;
    if (type === "registrations") return <RegistrationModal registration={data} profileId={profileId} busy={busy} onSave={(f) => saveChild(data ? () => organizationApi.updateLegalEntityRegistration(profileId, data.id, f, token, tokenType) : () => organizationApi.createLegalEntityRegistration(profileId, f, token, tokenType), "Registration saved")} onClose={() => setDialog(null)} />;
    if (type === "addresses") return <AddressModal address={data} profileId={profileId} busy={busy} onSave={(f) => saveChild(data ? () => organizationApi.updateLegalEntityAddress(profileId, data.id, f, token, tokenType) : () => organizationApi.createLegalEntityAddress(profileId, f, token, tokenType), "Address saved")} onClose={() => setDialog(null)} />;
    if (type === "representatives") return <RepresentativeModal representative={data} profileId={profileId} busy={busy} onSave={(f) => saveChild(data ? () => organizationApi.updateLegalEntityRepresentative(profileId, data.id, f, token, tokenType) : () => organizationApi.createLegalEntityRepresentative(profileId, f, token, tokenType), "Representative saved")} onClose={() => setDialog(null)} />;
    if (type === "bankAccounts") return <BankAccountModal account={data} profileId={profileId} busy={busy} onSave={(f) => saveChild(data ? () => organizationApi.updateLegalEntityBankAccount(profileId, data.id, f, token, tokenType) : () => organizationApi.createLegalEntityBankAccount(profileId, f, token, tokenType), "Bank account saved")} onClose={() => setDialog(null)} />;
    return null;
  }

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div><h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white"><FileText size={20} /> Legal Entity Profiles</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Detailed legal entity profiles with registrations, addresses, representatives, and bank accounts.</p></div>
      <Card><div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" /><input aria-label="Search profiles" className={`${inputClass} w-64 pl-8`} placeholder="Search legal name or CIN…" value={search} onChange={(e) => changeFilter(setSearch)(e.target.value)} /></div>
        <select className={`${inputClass} w-48`} value={companyFilter} onChange={(e) => changeFilter(setCompanyFilter)(e.target.value)}><option value="">All companies</option>{companyOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className={`${inputClass} w-36`} value={status} onChange={(e) => changeFilter(setStatus)(e.target.value)}>{STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        <div className="ml-auto flex items-center gap-2"><Button variant="secondary" onClick={reload}><RefreshCw size={16} /> Refresh</Button>{can("org.legal_entity.create") && <Button onClick={() => setDialog({})}><Plus size={16} /> Add Profile</Button>}</div>
      </div></Card>
      <Card padding={false}>{loading && <div className="p-4"><SkeletonTable rows={5} /></div>}{!loading && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"><tr><Th>Legal Name</Th><Th>Trading Name</Th><Th>CIN</Th><Th>Company</Th><Th>Country</Th><Th>Active</Th><Th>Registrations</Th><Th>Addresses</Th><Th>Reps</Th><Th>Bank Accts</Th><Th className="text-right">Actions</Th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">{profiles.map((p) => <tr key={p.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40"><td className="px-4 py-3 font-semibold">{p.legalName}</td><td className="px-4 py-3">{p.tradingName || "—"}</td><td className="px-4 py-3 font-mono text-xs">{p.corporateIdentificationNumber || "—"}</td><td className="px-4 py-3">{p.companyName}</td><td className="px-4 py-3">{p.countryCode}</td><td className="px-4 py-3"><Badge variant={p.isActive ? "green" : "yellow"}>{p.isActive ? "Yes" : "No"}</Badge></td><td className="px-4 py-3">{p.registrationCount ?? 0}</td><td className="px-4 py-3">{p.addressCount ?? 0}</td><td className="px-4 py-3">{p.representativeCount ?? 0}</td><td className="px-4 py-3">{p.bankAccountCount ?? 0}</td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-1">{can("org.legal_entity.update") && <Button size="sm" variant="ghost" onClick={() => { setSelectedProfile(p); setActiveTab("profile"); }}><Pencil size={14} /></Button>}{can("org.legal_entity.status") && <Button size="sm" variant="ghost" onClick={() => run(() => organizationApi.setLegalEntityProfileStatus(p.id, !p.isActive, token, tokenType), p.isActive ? "Profile deactivated" : "Profile activated")}><PowerOff size={14} /></Button>}{can("org.legal_entity.delete") && <Button size="sm" variant="ghost" onClick={() => run(() => organizationApi.deleteLegalEntityProfile(p.id, token, tokenType), "Profile deleted")}><Trash2 size={14} className="text-red-600" /></Button>}{can("org.legal_entity.read") && <Button size="sm" variant="ghost" onClick={() => { setSelectedProfile(p); setActiveTab("registrations"); }}><FolderOpen size={14} /></Button>}</div></td></tr>)}</tbody></table></div>}</Card>
      {!canManage && !loading && <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><Shield size={13} className="text-gray-400" /> You have read access. Creating and changing profiles is restricted to administrators.</p>}
      {dialog && !selectedProfile && <LegalEntityProfileModal profile={dialog.id ? dialog : null} companies={companyOptions} busy={busy} onSave={saveProfile} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Back({ children, ...props }) {
  return <span className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white cursor-pointer" {...props}>{children}</span>;
}