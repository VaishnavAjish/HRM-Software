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

const cellInputCls =
  "w-full bg-transparent px-3 py-2.5 text-[13px] font-semibold uppercase text-black outline-none transition-colors focus:bg-brand-50/70";

// ─── Table row helpers ─────────────────────────────────────────────────────
const SectionHeaderRow = ({ title }) => (
  <tr>
    <td
      colSpan={4}
      className="border border-black bg-brand-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white"
    >
      {title}
    </td>
  </tr>
);

const FullRow = ({
  label,
  name,
  value,
  onChange,
  error,
  type = "text",
  textarea,
}) => (
  <tr>
    <td className="w-1/5 border border-black bg-gray-50 px-3 py-2.5 align-top text-[12px] font-bold uppercase text-black">
      {label}
    </td>
    <td className="border border-black p-0" colSpan={3}>
      {textarea ? (
        <textarea
          name={name}
          value={value}
          onChange={onChange}
          rows={2}
          className={`${cellInputCls} resize-none`}
        />
      ) : (
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          className={cellInputCls}
        />
      )}
      {error && <p className="px-3 pb-1.5 text-[10px] text-red-600">{error}</p>}
    </td>
  </tr>
);

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
  <>
    <td className="w-1/6 border border-black bg-gray-50 px-3 py-2.5 align-top text-[12px] font-bold uppercase text-black">
      {label}
    </td>
    <td className="border border-black p-0">
      {select ? (
        <select
          name={name}
          value={value}
          onChange={onChange}
          className={cellInputCls}
        >
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
          className={cellInputCls}
        />
      )}
      {error && <p className="px-3 pb-1.5 text-[10px] text-red-600">{error}</p>}
    </td>
  </>
);

const SignatureField = ({ label, name, value, onChange }) => (
  <div className="text-center">
    <input
      name={name}
      value={value}
      onChange={onChange}
      className="mb-1 h-8 w-full border-b border-black bg-transparent px-1 text-center text-[13px] font-semibold uppercase outline-none focus:bg-brand-50/70"
    />
    <p>{label}</p>
  </div>
);

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
    <div className="fixed inset-0 z-[1001] overflow-y-auto bg-black/60 p-4 text-[13px] backdrop-blur-sm">
      <div className="relative mx-auto my-4 w-full max-w-[880px] overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Brand accent stripe */}
        <div className="h-1.5 w-full bg-gradient-to-r from-brand-600 to-brand-400" />

        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-white px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <FileSpreadsheet size={16} />
            </div>
            {isEditMode ? (
              <span className="text-sm font-bold text-gray-800">
                Editing Trial Form{" "}
                <span className="text-brand-600">#{initialData?.id}</span>
              </span>
            ) : (
              <span className="text-sm font-bold text-gray-800">
                New Trial Form
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-500 hover:text-white"
          >
            <X size={13} />
            Close
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="max-h-[80vh] overflow-y-auto bg-gray-100 p-8"
        >
          <div className="rounded-lg border border-dotted border-gray-600 bg-white p-6 shadow-sm">
            <div className="text-center">
              <h1 className="text-2xl font-black uppercase tracking-widest text-black">
                Nidhi Impex
              </h1>
              <div className="mt-2">
                <span className="inline-block rounded-full bg-gray-900 px-4 py-1 text-xs font-bold uppercase tracking-widest text-white">
                  Trial Form
                </span>
              </div>
            </div>
            <div className="mb-3 mt-3 border-t-2 border-black" />

            <div className="mb-4 flex items-center justify-end gap-8 text-[13px] font-bold text-black">
              <div className="flex items-center gap-2">
                <span className="uppercase">Date :</span>
                <input
                  type="date"
                  name="trial_date"
                  value={formData.trial_date}
                  onChange={handleChange}
                  className="rounded border-b border-black bg-transparent px-1 text-[13px] font-semibold outline-none focus:bg-brand-50/70"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="uppercase">Form No :</span>
                <input
                  name="form_no"
                  value={formData.form_no}
                  onChange={handleChange}
                  className="w-28 rounded border-b border-black bg-transparent px-1 text-[13px] font-semibold outline-none focus:bg-brand-50/70"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-black">
              <table className="w-full border-collapse text-[13px]">
                <tbody>
                  <SectionHeaderRow title="Candidate Details" />
                  <tr>
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
                  </tr>
                  <FullRow
                    label="Department"
                    name="department"
                    value={formData.department}
                    onChange={handleChange}
                    error={errors.department}
                  />
                  <FullRow
                    label="Name of Employee"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    error={errors.name}
                  />
                  <FullRow
                    label="Address"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    error={errors.address}
                    textarea
                  />
                  <tr>
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
                  </tr>
                  <FullRow
                    label="Email Id"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    error={errors.email}
                    type="email"
                  />

                  <SectionHeaderRow title="Previous Employment" />
                  <FullRow
                    label="Last Company Name"
                    name="last_company_name"
                    value={formData.last_company_name}
                    onChange={handleChange}
                    error={errors.last_company_name}
                  />
                  <FullRow
                    label="Last Company Address"
                    name="last_company_address"
                    value={formData.last_company_address}
                    onChange={handleChange}
                  />
                  <tr>
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
                  </tr>

                  <SectionHeaderRow title="Hastak / Reference Details" />
                  <tr>
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
                  </tr>
                  <FullRow
                    label="Hastak Mobile No"
                    name="hastak_mobile"
                    value={formData.hastak_mobile}
                    onChange={handleChange}
                    error={errors.hastak_mobile}
                    inputMode="numeric"
                  />
                  <FullRow
                    label="Department"
                    name="department"
                    value={formData.department}
                    onChange={handleChange}
                  />
                  <FullRow
                    label="Contractor"
                    name="contractor"
                    value={formData.contractor}
                    onChange={handleChange}
                  />
                  <tr>
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
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signature row */}
            <div className="mt-8 grid grid-cols-2 gap-x-16 gap-y-8 text-[13px] font-bold text-black">
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

          <div className="mt-5 flex justify-end gap-3">
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
