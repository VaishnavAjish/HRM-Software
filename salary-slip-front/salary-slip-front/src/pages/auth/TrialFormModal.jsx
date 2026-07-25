import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, FileSpreadsheet, X } from "lucide-react";
import toast from "react-hot-toast";
import { authApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { getCompanyUnits } from "../../config/companyConfig";

const getTodayDate = () => new Date().toISOString().split("T")[0];

const EMPTY_FORM = {
  form_no: "",
  trial_date: getTodayDate(),
  department: "",
  name: "",
  address: "",
  mobile_number: "",
  mobile_no_2: "",
  gender: "MALE",
  email: "",
  unit: "",
  last_company_name: "",
  last_company_address: "",
  experience: "",
  reason_for_leaving: "",
  hastak_name: "",
  hastak_code: "",
  hastak_mobile: "",
  contractor: "",
  manager_name: "",
  akar: "",
  emp_signature: "",
  manager_signature: "",
  hastak_signature: "",
  hr_signature: "",
};

// ─── Shared input class ────────────────────────────────────────────────────────
const inputCls =
  "w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-[13px] font-semibold uppercase text-black outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

// ─── Section header ────────────────────────────────────────────────────────────
const SectionHeader = ({ title }) => (
  <div className="col-span-1 sm:col-span-2 rounded-md bg-brand-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white">
    {title}
  </div>
);

// ─── Full-width field (spans both columns) ────────────────────────────────────
const FullField = ({ label, name, value, onChange, error, type = "text", textarea }) => (
  <div className="col-span-1 sm:col-span-2 flex flex-col gap-1">
    <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
      {label}
    </label>
    {textarea ? (
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        rows={2}
        className={`${inputCls} resize-none`}
      />
    ) : (
      <input type={type} name={name} value={value} onChange={onChange} className={inputCls} />
    )}
    {error && <p className="text-[10px] text-red-600">{error}</p>}
  </div>
);

// ─── Half-width field (one column) ────────────────────────────────────────────
const HalfField = ({
  label,
  name,
  value,
  onChange,
  error,
  type = "text",
  select,
  options,
  maxLength,
  inputMode,
}) => (
  <div className="flex flex-col gap-1">
    <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
      {label}
    </label>
    {select ? (
      <select name={name} value={value} onChange={onChange} className={inputCls}>
        {options.map((o) => (
          <option key={o.value ?? o} value={o.value ?? o}>
            {o.label ?? o}
          </option>
        ))}
      </select>
    ) : (
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        maxLength={maxLength}
        inputMode={inputMode}
        className={inputCls}
      />
    )}
    {error && <p className="text-[10px] text-red-600">{error}</p>}
  </div>
);

// ─── Signature field ──────────────────────────────────────────────────────────
const SignatureField = ({ label, name, value, onChange }) => (
  <div className="flex flex-col items-center gap-1 text-center">
    <input
      name={name}
      value={value}
      onChange={onChange}
      className="mb-1 h-8 w-full border-b-2 border-black bg-transparent px-1 text-center text-[13px] font-semibold uppercase outline-none focus:border-brand-500"
    />
    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-600">{label}</p>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
const TrialFormModal = ({ isOpen, onClose, initialData = null, onSuccess }) => {
  const { user } = useAuth();
  const isEditMode = Boolean(initialData);
  const originalSnapshot = useRef(null);

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const fieldValidators = [
    {
      path: "mobile_number",
      isValid: (v) => /^[6-9]\d{9}$/.test(v),
      message: "Must be a valid 10-digit mobile number.",
    },
    {
      path: "mobile_no_2",
      isValid: (v) => /^[6-9]\d{9}$/.test(v),
      message: "Must be a valid 10-digit mobile number.",
    },
    {
      path: "hastak_mobile",
      isValid: (v) => /^[6-9]\d{9}$/.test(v),
      message: "Must be a valid 10-digit mobile number.",
    },
    {
      path: "email",
      isValid: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: "Must be a valid email address.",
    },
  ];

  const validate = () => {
    const nextErrors = {};
    fieldValidators.forEach(({ path, isValid, message }) => {
      const value = String(formData[path] ?? "").trim();
      if (!nextErrors[path] && value !== "" && !isValid(value)) {
        nextErrors[path] = message;
      }
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const clearError = (path) => {
    setErrors((prev) => {
      if (!prev[path]) return prev;
      const updated = { ...prev };
      delete updated[path];
      return updated;
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    clearError(name);
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";

      if (isEditMode && initialData) {
        const raw = initialData.raw || {};
        const populated = {
          form_no: raw.form_no || "",
          trial_date: raw.trial_date || getTodayDate(),
          department: raw.department || "",
          name: raw.name || "",
          address: raw.address || "",
          mobile_number: raw.mobile_number || "",
          mobile_no_2: raw.mobile_no_2 || "",
          gender: raw.gender || "MALE",
          email: raw.email || "",
          unit: raw.unit || "",
          last_company_name: raw.last_company_name || "",
          last_company_address: raw.last_company_address || "",
          experience: raw.experience || "",
          reason_for_leaving: raw.reason_for_leaving || "",
          hastak_name: raw.hastak_name || "",
          hastak_code: raw.hastak_code || "",
          hastak_mobile: raw.hastak_mobile || "",
          contractor: raw.contractor || "",
          manager_name: raw.manager_name || "",
          akar: raw.akar || "",
          emp_signature: raw.emp_signature || "",
          manager_signature: raw.manager_signature || "",
          hastak_signature: raw.hastak_signature || "",
          hr_signature: raw.hr_signature || "",
        };
        setFormData(populated);
        originalSnapshot.current = populated;
      } else {
        setFormData(EMPTY_FORM);
      }
    } else {
      document.body.style.overflow = "";
      setErrors({});
    }
    return () => {
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      toast.error("Please check the highlighted fields.");
      return;
    }

    setLoading(true);
    try {
      const submitData = { ...formData, company_code: "nidhi-impex" };

      if (isEditMode) {
        const snap = originalSnapshot.current || {};
        const payload = new FormData();
        Object.entries(submitData).forEach(([key, value]) => {
          const curr = String(value ?? "");
          const orig = String(snap[key] ?? "");
          if (curr !== orig) payload.append(key, curr);
        });

        const res = await authApi.updateTrialForm(
          initialData.id,
          payload,
          user?.accessToken,
          user?.tokenType,
        );
        toast.success(res.message || "Trial form updated successfully.");
        if (onSuccess) onSuccess();
        else onClose();
      } else {
        const payload = new FormData();
        Object.entries(submitData).forEach(([key, value]) => {
          if (value !== null && value !== undefined) payload.append(key, value);
        });

        const res = await authApi.submitTrialForm(
          payload,
          user?.accessToken,
          user?.tokenType,
        );
        toast.success(res.message || "Trial form submitted successfully.");
        onClose();
      }
    } catch (error) {
      toast.error(error.message || "Failed to submit trial form.");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1001] overflow-y-auto bg-black/60 p-2 sm:p-4 text-[13px] backdrop-blur-sm">
      <div className="relative mx-auto my-2 sm:my-4 w-full max-w-[880px] overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Brand accent stripe */}
        <div className="h-1.5 w-full bg-gradient-to-r from-brand-600 to-brand-400" />

        {/* Top bar */}
        <div className="safe-top-bar flex items-center justify-between gap-2 border-b border-gray-100 bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <FileSpreadsheet size={16} />
            </div>
            {isEditMode ? (
              <span className="truncate text-sm font-bold text-gray-800">
                Editing Trial Form{" "}
                <span className="text-brand-600">#{initialData?.id}</span>
              </span>
            ) : (
              <span className="truncate text-sm font-bold text-gray-800">New Trial Form</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-500 hover:text-white"
          >
            <X size={13} />
            Close
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="max-h-[85vh] overflow-y-auto bg-gray-50 p-3 sm:p-6 lg:p-8"
        >
          <div className="rounded-xl border border-dashed border-gray-400 bg-white p-4 sm:p-6 shadow-sm">
            {/* Header */}
            <div className="text-center">
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-widest text-black">
                Nidhi Impex
              </h1>
              <div className="mt-2">
                <span className="inline-block rounded-full bg-gray-900 px-4 py-1 text-xs font-bold uppercase tracking-widest text-white">
                  Trial Form
                </span>
              </div>
            </div>
            <div className="mb-4 mt-3 border-t-2 border-black" />

            {/* Date & Form No row */}
            <div className="mb-5 flex flex-wrap items-center justify-end gap-3 sm:gap-8">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold uppercase">Date :</span>
                <input
                  type="date"
                  name="trial_date"
                  value={formData.trial_date}
                  onChange={handleChange}
                  className="rounded border-b border-black bg-transparent px-1 text-[12px] font-semibold outline-none focus:bg-brand-50/70"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold uppercase">Form No :</span>
                <input
                  name="form_no"
                  value={formData.form_no}
                  onChange={handleChange}
                  className="w-24 rounded border-b border-black bg-transparent px-1 text-[12px] font-semibold outline-none focus:bg-brand-50/70"
                />
              </div>
            </div>

            {/* ── Responsive grid form ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              {/* ── Candidate Details ── */}
              <SectionHeader title="Candidate Details" />

              <HalfField
                label="Branch"
                error={errors.unit}
                select
                name="unit"
                value={formData.unit}
                onChange={handleChange}
                options={[
                  { value: "", label: "Select Branch" },
                  ...getCompanyUnits("nidhi-impex").map((u) => ({
                    value: u,
                    label: u,
                  })),
                ]}
              />
              <HalfField
                label="Gender"
                select
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                options={["MALE", "FEMALE"]}
              />

              <FullField
                label="Department"
                name="department"
                value={formData.department}
                onChange={handleChange}
                error={errors.department}
              />
              <FullField
                label="Name of Employee"
                name="name"
                value={formData.name}
                onChange={handleChange}
                error={errors.name}
              />
              <FullField
                label="Address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                error={errors.address}
                textarea
              />

              <HalfField
                label="Mobile No 1"
                error={errors.mobile_number}
                name="mobile_number"
                value={formData.mobile_number}
                onChange={handleChange}
                inputMode="numeric"
                maxLength={10}
              />
              <HalfField
                label="Mobile No 2"
                error={errors.mobile_no_2}
                name="mobile_no_2"
                value={formData.mobile_no_2}
                onChange={handleChange}
                inputMode="numeric"
                maxLength={10}
              />

              <FullField
                label="Email Id"
                name="email"
                value={formData.email}
                onChange={handleChange}
                error={errors.email}
                type="email"
              />

              {/* ── Previous Employment ── */}
              <SectionHeader title="Previous Employment" />

              <FullField
                label="Last Company Name"
                name="last_company_name"
                value={formData.last_company_name}
                onChange={handleChange}
                error={errors.last_company_name}
              />
              <FullField
                label="Last Company Address"
                name="last_company_address"
                value={formData.last_company_address}
                onChange={handleChange}
              />

              <HalfField
                label="Experience"
                error={errors.experience}
                name="experience"
                value={formData.experience}
                onChange={handleChange}
              />
              <HalfField
                label="Reason for Leaving"
                error={errors.reason_for_leaving}
                name="reason_for_leaving"
                value={formData.reason_for_leaving}
                onChange={handleChange}
              />

              {/* ── Hastak / Reference Details ── */}
              <SectionHeader title="Hastak / Reference Details" />

              <HalfField
                label="Hastak Name"
                error={errors.hastak_name}
                name="hastak_name"
                value={formData.hastak_name}
                onChange={handleChange}
              />
              <HalfField
                label="Hastak Code No"
                error={errors.hastak_code}
                name="hastak_code"
                value={formData.hastak_code}
                onChange={handleChange}
              />

              <FullField
                label="Hastak Mobile No"
                name="hastak_mobile"
                value={formData.hastak_mobile}
                onChange={handleChange}
                error={errors.hastak_mobile}
                inputMode="numeric"
              />
              <FullField
                label="Department"
                name="department"
                value={formData.department}
                onChange={handleChange}
              />
              <FullField
                label="Contractor"
                name="contractor"
                value={formData.contractor}
                onChange={handleChange}
              />

              <HalfField
                label="Manager Name"
                error={errors.manager_name}
                name="manager_name"
                value={formData.manager_name}
                onChange={handleChange}
              />
              <HalfField
                label="Akar"
                name="akar"
                value={formData.akar}
                onChange={handleChange}
              />
            </div>

            {/* ── Signature row ─────────────────────────────────────────────── */}
            <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 sm:gap-x-6 text-[13px] font-bold text-black">
              <SignatureField
                label="Emp - Signature"
                name="emp_signature"
                value={formData.emp_signature}
                onChange={handleChange}
              />
              <SignatureField
                label="Manager"
                name="manager_signature"
                value={formData.manager_signature}
                onChange={handleChange}
              />
              <SignatureField
                label="Hastak Signature"
                name="hastak_signature"
                value={formData.hastak_signature}
                onChange={handleChange}
              />
              <SignatureField
                label="H R"
                name="hr_signature"
                value={formData.hr_signature}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/30 transition hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {isEditMode ? "Updating..." : "Submitting..."}
                </>
              ) : (
                <>
                  <Check size={15} />
                  {isEditMode ? "Update Trial Form" : "Submit Trial Form"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default TrialFormModal;
