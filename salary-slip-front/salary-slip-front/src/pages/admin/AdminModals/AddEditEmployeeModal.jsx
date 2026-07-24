import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  X,
  Edit2,
  User,
  MapPin,
  Briefcase,
  CreditCard,
  Lock,
  Shield,
  Eye,
  EyeOff,
  Plus,
  Check,
  CheckCircle2,
} from "lucide-react";
import Button from "../../../components/ui/Button";
import { salaryApi } from "../../../utils/api";
import { useAuth } from "../../../context/AuthContext";
import { formatDateInputValue, PasswordStrength } from "./EmployeeHelpers";

const SECTIONS = [
  { key: "basic", label: "Basic Info", subtitle: "Personal particulars", icon: User },
  { key: "address", label: "Address Details", subtitle: "Location records", icon: MapPin },
  { key: "employment", label: "Employment Info", subtitle: "Role & placement", icon: Briefcase },
  {
    key: "identity",
    label: "Identity & Bank",
    subtitle: "Direct deposits",
    icon: CreditCard,
  },
  {
    key: "security",
    label: "Account Security",
    subtitle: "Portal credentialing",
    icon: Lock,
  },
];

const fieldCls =
  "w-full rounded-xl border border-gray-200 bg-gray-100 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:text-white";

function Label({ children, required }) {
  return (
    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  );
}

function SectionCard({ icon: Icon, title, index, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">
          <Icon size={13} />
          {title}
        </div>
        <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">
          Section {index} of {SECTIONS.length}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

export default function AddEditEmployeeModal({
  modal,
  setModal,
  form,
  setForm,
  handleSave,
  saveLoading,
  viewLoading,
  showPassword,
  setShowPassword,
  unitOptions,
  departmentsList,
  setDepartmentsList,
  setIsDeptModalOpen,
}) {
  const { user } = useAuth();
  const isOpen = modal === "add" || modal === "edit";
  const [activeSection, setActiveSection] = useState(SECTIONS[0].key);
  const contentRef = useRef(null);
  const sectionRefs = useRef({});

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const res = await salaryApi.getDepartments(
          user?.accessToken,
          user?.tokenType,
        );

        const departments = res?.data?.map((dept) => dept.name) || [];

        setDepartmentsList(departments);
      } catch (error) {
        console.error("Failed to fetch departments:", error);
        toast.error("Failed to fetch departments");
      }
    };

    if (modal) {
      fetchDepartments();
    }
  }, [modal, user, setDepartmentsList]);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    setActiveSection(SECTIONS[0].key);

    const root = contentRef.current;
    if (!root) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.dataset.section);
          }
        });
      },
      { root, rootMargin: "0px 0px -65% 0px", threshold: 0 },
    );

    Object.values(sectionRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [isOpen]);

  if (!isOpen) return null;

  const update = (key) => (e) =>
    setForm((prev) => ({
      ...prev,
      [key]:
        key === "mobileNo" ? e.target.value.replace(/\D/g, "") : e.target.value,
    }));

  const scrollToSection = (key) => {
    setActiveSection(key);
    sectionRefs.current[key]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const input = ({ label, key, placeholder, type = "text", required }) => (
    <div key={key}>
      <Label required={required}>{label}</Label>
      <input
        type={type}
        inputMode={key === "mobileNo" ? "numeric" : undefined}
        maxLength={key === "mobileNo" ? 10 : undefined}
        value={
          type === "date" ? formatDateInputValue(form[key]) : form[key] || ""
        }
        onChange={update(key)}
        placeholder={placeholder}
        className={fieldCls}
      />
    </div>
  );

  const sectionComplete = {
    basic: Boolean(form.empCode && form.name && form.email),
    address: Boolean(form.address || form.city),
    employment: Boolean(form.department || form.designation || form.unit),
    identity: Boolean(form.aadharCardNo || form.bankName),
    security: modal === "edit" || Boolean(form.password),
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className="absolute inset-0"
        onClick={() => !saveLoading && setModal(null)}
      />

      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0b0f1a]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5 dark:border-white/10">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400">
              <Edit2 size={17} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  {modal === "add" ? "Add Employee File" : "Edit Employee File"}
                </h2>
                {modal === "edit" && form.empCode && (
                  <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-bold text-brand-700 dark:bg-brand-900/20 dark:text-brand-400">
                    ID: #{form.empCode}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Configure corporate identity, payroll registers, and password
                configurations
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModal(null)}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body: sidebar + scrollable content */}
        <div className="flex min-h-0 flex-1">
          <div className="w-72 flex-shrink-0 space-y-2 overflow-y-auto border-r border-gray-200 p-4 dark:border-white/10">
            {SECTIONS.map(({ key, label, subtitle, icon: Icon }) => {
              const active = activeSection === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => scrollToSection(key)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                    active
                      ? "bg-brand-600 text-white shadow-md shadow-brand-600/20"
                      : "text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-white/5"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                      active
                        ? "bg-white/20"
                        : "bg-gray-200 dark:bg-white/10"
                    }`}
                  >
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-tight">
                      {label}
                    </span>
                    <span
                      className={`block text-[11px] leading-tight ${
                        active
                          ? "text-white/70"
                          : "text-gray-400 dark:text-slate-500"
                      }`}
                    >
                      {subtitle}
                    </span>
                  </span>
                  {sectionComplete[key] && (
                    <CheckCircle2
                      size={16}
                      className={active ? "text-white" : "text-green-500"}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div ref={contentRef} className="flex-1 space-y-5 overflow-y-auto p-6">
            <div
              data-section="basic"
              ref={(el) => (sectionRefs.current.basic = el)}
            >
              <SectionCard icon={User} title="Basic Information" index={1}>
                {input({
                  label: "Employee Code",
                  key: "empCode",
                  placeholder: "8026",
                  required: true,
                })}
                {input({
                  label: "Full Name",
                  key: "name",
                  placeholder: "Rahul Sharma",
                  required: true,
                })}

                <div>
                  <Label>Gender</Label>
                  <select
                    value={form.gender || ""}
                    onChange={update("gender")}
                    className={fieldCls}
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {input({
                  label: "Email Address",
                  key: "email",
                  placeholder: "emp@gmail.com",
                  type: "email",
                  required: true,
                })}
                {input({
                  label: "Mobile Number",
                  key: "mobileNo",
                  placeholder: "9876543210",
                  type: "tel",
                })}
                {input({ label: "Date of Birth", key: "dob", type: "date" })}
              </SectionCard>
            </div>

            <div
              data-section="address"
              ref={(el) => (sectionRefs.current.address = el)}
            >
              <SectionCard icon={MapPin} title="Address Details" index={2}>
                <div className="sm:col-span-2">
                  <Label>Street Address</Label>
                  <input
                    value={form.address || ""}
                    onChange={update("address")}
                    placeholder="Employee residential address"
                    className={fieldCls}
                  />
                </div>
                {input({ label: "City", key: "city", placeholder: "City" })}
                {input({
                  label: "District",
                  key: "district",
                  placeholder: "District",
                })}
                {input({ label: "State", key: "state", placeholder: "State" })}
                {input({ label: "PIN Code", key: "pin", placeholder: "PIN Code" })}
              </SectionCard>
            </div>

            <div
              data-section="employment"
              ref={(el) => (sectionRefs.current.employment = el)}
            >
              <SectionCard icon={Briefcase} title="Employment Information" index={3}>
                <div>
                  <Label>Department</Label>
                  <div className="flex gap-2">
                    <select
                      value={form.department || ""}
                      onChange={update("department")}
                      className={fieldCls}
                    >
                      <option value="">Select Department</option>
                      {departmentsList.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      title="Add New Department"
                      onClick={() => setIsDeptModalOpen(true)}
                      className="flex-shrink-0 rounded-xl bg-brand-600 p-2.5 text-white transition hover:bg-brand-700"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                {input({
                  label: "Designation",
                  key: "designation",
                  placeholder: "e.g. Senior Executive",
                })}

                <div>
                  <Label>Working Unit</Label>
                  <select
                    value={form.unit || ""}
                    onChange={update("unit")}
                    className={fieldCls}
                  >
                    <option value="">Select Unit</option>
                    {unitOptions.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label>System Role</Label>
                  <select
                    value={form.loginRole || "employee"}
                    onChange={update("loginRole")}
                    className={fieldCls}
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="superadmin">Super Admin</option>
                  </select>
                </div>

                <div>
                  <Label>Active Status</Label>
                  <select
                    value={form.status}
                    onChange={update("status")}
                    className={fieldCls}
                  >
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </div>

                {input({ label: "Joining Date", key: "joiningDate", type: "date" })}

                <div className="sm:col-span-2">
                  {input({
                    label: "Resignation Date (leave blank if active)",
                    key: "resignationDate",
                    type: "date",
                  })}
                </div>
              </SectionCard>
            </div>

            <div
              data-section="identity"
              ref={(el) => (sectionRefs.current.identity = el)}
            >
              <SectionCard icon={CreditCard} title="Identity & Bank Details" index={4}>
                {input({
                  label: "Aadhar Card No",
                  key: "aadharCardNo",
                  placeholder: "XXXX XXXX XXXX",
                })}
                {input({
                  label: "PAN Card No",
                  key: "panCardNo",
                  placeholder: "ABCDE1234F",
                })}
                {input({
                  label: "Bank Name",
                  key: "bankName",
                  placeholder: "Bank Name",
                })}
                {input({
                  label: "Bank IFSC Code",
                  key: "bankIfscCode",
                  placeholder: "IFSC Code",
                })}
                {input({
                  label: "Bank Account No",
                  key: "bankAccountNo",
                  placeholder: "Bank Account Number",
                })}
                {input({
                  label: "PF Account No",
                  key: "pfNo",
                  placeholder: "PF Number",
                })}
                {input({ label: "ESI ID No", key: "esiNo", placeholder: "ESI Number" })}
              </SectionCard>
            </div>

            <div
              data-section="security"
              ref={(el) => (sectionRefs.current.security = el)}
            >
              <SectionCard icon={Lock} title="Account Security" index={5}>
                <div className="sm:col-span-2">
                  <Label>
                    {modal === "edit"
                      ? "New Password (leave blank to keep)"
                      : "Password"}
                  </Label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={form.password || ""}
                      onChange={update("password")}
                      placeholder="••••••••"
                      className={`${fieldCls} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      tabIndex={-1}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 transition hover:text-gray-700 dark:hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {(modal === "add" || form.password) && (
                    <PasswordStrength
                      password={form.password || ""}
                      isEdit={modal === "edit"}
                    />
                  )}
                </div>
              </SectionCard>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
          <div className="hidden items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500 sm:flex">
            <Shield size={13} />
            System records are saved securely inside decentralized directory
            services.
          </div>

          <div className="ml-auto flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setModal(null)}
              disabled={saveLoading}
            >
              Discard Changes
            </Button>

            <Button
              icon={<Check size={14} />}
              onClick={handleSave}
              disabled={saveLoading || viewLoading}
            >
              {saveLoading
                ? "Saving..."
                : viewLoading
                  ? "Loading..."
                  : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
