import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Edit2,
  User,
  Mail,
  Briefcase,
  MapPin,
  CreditCard,
  Shield,
  ShieldCheck,
  Clock,
  FileText,
} from "lucide-react";

import Button from "../../../components/ui/Button";
import EmployeeDocuments from "../../../components/documents/EmployeeDocuments";
import ModernDatePicker from "../../../components/ModernDatePicker";
import { EmployeeAvatar } from "./EmployeeHelpers";
import { formatDateInputValue, formatDisplayDate } from "./employee-helpers";

const TABS = [
  { key: "profile", label: "Profile & Contact", icon: User },
  { key: "employment", label: "Employment Details", icon: Briefcase },
  { key: "address", label: "Address & Location", icon: MapPin },
  { key: "financials", label: "Financials & Identity", icon: CreditCard },
  { key: "documents", label: "Documents", icon: FileText },
];

const fieldCls =
  "w-full rounded-xl border border-gray-200 bg-gray-100 px-3.5 py-2.5 text-sm text-gray-900 outline-none dark:border-white/10 dark:bg-slate-950/60 dark:text-white";

function Label({ children }) {
  return (
    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">
      {children}
    </label>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">
        <Icon size={13} />
        {title}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({ label, value, type = "text", className = "" }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {type === "date" ? (
        <ModernDatePicker
          value={formatDateInputValue(value) || ""}
          disabled={true}
          className={fieldCls}
        />
      ) : (
        <input
          type={type}
          readOnly
          tabIndex={-1}
          value={value || "—"}
          className={fieldCls}
        />
      )}
    </div>
  );
}

export default function EmployeeDetailsModal({
  isOpen,
  onClose,
  selected,
  viewLoading,
  openEdit,
}) {
  const [activeTab, setActiveTab] = useState("profile");

  // Each open starts on the Profile tab. Assigned during render — the supported
  // way to reset state when an input changes — rather than from an effect,
  // which showed the previous tab for one frame before switching back.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) setActiveTab("profile");
  }

  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !selected) return null;

  const isActive = selected.status === "Active";
  const roleLabel =
    selected.loginRole === "superadmin"
      ? "Super Admin"
      : selected.loginRole === "manager"
        ? "Manager"
        : "Employee";

  return createPortal(
    <div className="modal-overlay fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0b0f1a]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5 dark:border-white/10">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">
              <User size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Employee Profile
              </h2>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                View system details for {selected.name || "this employee"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close employee details"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {viewLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent dark:border-violet-400" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* Summary bar */}
            <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <EmployeeAvatar employee={selected} size="lg" />
                  {isActive && (
                    <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-gray-50 bg-green-400 dark:border-[#0b0f1a]" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-base font-bold text-gray-900 dark:text-white">
                      {selected.name || "-"}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        isActive
                          ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
                          : "bg-gray-200 text-gray-500 dark:bg-slate-500/15 dark:text-slate-400"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-green-500 dark:bg-green-400" : "bg-gray-400 dark:bg-slate-400"}`}
                      />
                      {selected.status || "Inactive"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                    ID: #{selected.empCode || "—"} &middot; {roleLabel} &middot;{" "}
                    {selected.gender || "—"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4 sm:mt-0">
                {[
                  { label: "Department", value: selected.department },
                  { label: "Unit", value: selected.unit },
                  {
                    label: "Joining Date",
                    value: formatDisplayDate(selected.joiningDate),
                  },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-center dark:border-white/10 dark:bg-black/20"
                  >
                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500">
                      {label}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-bold text-gray-900 dark:text-white">
                      {value || "—"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabs — 2×2 grid on mobile, horizontal strip on sm+ */}
            <div className="mt-5 sm:hidden grid grid-cols-2 gap-2">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${
                    activeTab === key
                      ? "border-violet-500 bg-violet-50 text-violet-600 dark:border-violet-400 dark:bg-violet-500/10 dark:text-violet-300"
                      : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400 dark:hover:bg-white/[0.06]"
                  }`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-5 hidden sm:flex gap-5 overflow-x-auto scrollbar-hide whitespace-nowrap border-b border-gray-200 dark:border-white/10">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`flex flex-shrink-0 items-center gap-1.5 border-b-2 pb-2.5 text-sm font-semibold transition ${
                    activeTab === key
                      ? "border-violet-500 text-violet-600 dark:border-violet-400 dark:text-violet-300"
                      : "border-transparent text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="mt-5 space-y-4">
              {activeTab === "profile" && (
                <>
                  <Section icon={User} title="Primary Identity">
                    <Field label="Full Name" value={selected.name} />
                    <Field label="Gender" value={selected.gender} />
                    <Field
                      label="Date of Birth"
                      value={selected.dob}
                      type="date"
                    />
                  </Section>

                  <Section icon={Mail} title="Contact Information">
                    <Field label="Email Address" value={selected.email} />
                    <Field label="Mobile Number" value={selected.mobileNo} />
                  </Section>
                </>
              )}

              {activeTab === "employment" && (
                <>
                  <Section icon={Briefcase} title="Job Placement">
                    <Field label="Employee ID" value={selected.empCode} />
                    <Field label="Department" value={selected.department} />
                    <Field label="Designation" value={selected.designation} />
                    <Field label="Working Unit" value={selected.unit} />
                    <Field label="Role" value={roleLabel} />
                    <Field label="Status" value={selected.status} />
                  </Section>

                  <Section icon={Clock} title="Tenureship Timeline">
                    <Field
                      label="Joining Date"
                      value={selected.joiningDate}
                      type="date"
                    />
                    <Field
                      label="Resignation Date"
                      value={selected.resignationDate}
                      type="date"
                    />
                  </Section>
                </>
              )}

              {activeTab === "address" && (
                <Section icon={MapPin} title="Residential Address">
                  <Field
                    label="Permanent Address"
                    value={selected.address}
                    className="sm:col-span-2"
                  />
                  <Field label="City" value={selected.city} />
                  <Field label="District" value={selected.district} />
                  <Field label="State" value={selected.state} />
                  <Field label="PIN Code" value={selected.pin} />
                </Section>
              )}

              {activeTab === "financials" && (
                <>
                  <Section icon={ShieldCheck} title="Government IDs">
                    <Field
                      label="Aadhaar Card No"
                      value={selected.aadharCardNo}
                    />
                    <Field label="PAN Card No" value={selected.panCardNo} />
                  </Section>

                  <Section
                    icon={CreditCard}
                    title="Direct Deposit Banking & Funds"
                  >
                    <Field label="Bank Name" value={selected.bankName} />
                    <Field
                      label="Bank IFSC Code"
                      value={selected.bankIfscCode}
                    />
                    <Field
                      label="Bank Account No"
                      value={selected.bankAccountNo}
                    />
                    <Field label="PF Account No" value={selected.pfNo} />
                    <Field label="ESI ID No" value={selected.esiNo} />
                  </Section>
                </>
              )}

              {activeTab === "documents" && (
                <EmployeeDocuments
                  employeeId={selected.id}
                  employeeLabel={selected.name}
                  readOnly={true}
                />
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
          <div className="hidden items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500 sm:flex">
            <Shield size={13} />
            Encrypted data safe keeping
          </div>

          <div className="ml-auto flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>

            <Button
              icon={<Edit2 size={14} />}
              onClick={() => {
                onClose();
                openEdit(selected);
              }}
              disabled={viewLoading}
            >
              Edit
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
