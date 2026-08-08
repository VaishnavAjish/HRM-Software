import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, FileSpreadsheet, X, Upload, FileText } from "lucide-react";
import ModernDatePicker from "../../components/ModernDatePicker";
import toast from "react-hot-toast";
import { authApi, salaryApi, resolveWriteCompanyId } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyUnits } from "../../config/companyConfig";
import usePhotoCapture from "../../hooks/usePhotoCapture";
import { normaliseAadhaar, formatFullAadhaar } from "../../utils/aadhaar";

const getTodayDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const DEFAULT_DEPARTMENTS = ["4P DEPT", "Account", "BLOCKING DEPT", "cutting", "IT", "Polish-02 (MFG)"];

const EMPTY_FORM = {
  form_no: "",
  trial_date: getTodayDate(),
  department: "",
  designation: "",
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
  hastak_department: "",
  contractor: "",
  manager_name: "",
  akar: "",
  emp_signature: "",
  manager_signature: "",
  hastak_signature: "",
  hr_signature: "",
  photo: null,
  aadhar_card_no: "",
  adhar_image: null,
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
const FullField = ({ label, name, value, onChange, error, type = "text", textarea, select, options, disabled }) => (
  <div className="col-span-1 sm:col-span-2 flex flex-col gap-1">
    {/* htmlFor/id so the label actually names the control for screen readers. */}
    <label
      htmlFor={`trial-${name}`}
      className="text-[11px] font-bold uppercase tracking-wide text-gray-500"
    >
      {label}
    </label>
    {select ? (
      <select id={`trial-${name}`} name={name} value={value} onChange={onChange} disabled={disabled} className={`${inputCls} disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-200`}>
        {(options || []).map((o) => (
          <option key={o.value ?? o} value={o.value ?? o}>
            {o.label ?? o}
          </option>
        ))}
      </select>
    ) : textarea ? (
      <textarea
        id={`trial-${name}`}
        name={name}
        value={value}
        onChange={onChange}
        rows={2}
        disabled={disabled}
        className={`${inputCls} resize-none disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-200`}
      />
    ) : (
      <input
        id={`trial-${name}`}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`${inputCls} disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-200`}
      />
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
  disabled,
}) => (
  <div className="flex flex-col gap-1">
    <label
      htmlFor={`trial-${name}`}
      className="text-[11px] font-bold uppercase tracking-wide text-gray-500"
    >
      {label}
    </label>
    {select ? (
      <select id={`trial-${name}`} name={name} value={value} onChange={onChange} disabled={disabled} className={`${inputCls} disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-200`}>
        {options.map((o) => (
          <option key={o.value ?? o} value={o.value ?? o}>
            {o.label ?? o}
          </option>
        ))}
      </select>
    ) : (
      <input
        id={`trial-${name}`}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        maxLength={maxLength}
        inputMode={inputMode}
        disabled={disabled}
        className={`${inputCls} disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-200`}
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
  const { companyId } = useCompany();
  const isEditMode = Boolean(initialData);
  // The record as it was when the modal opened, so the update payload can send
  // only the fields that actually changed. State rather than a ref: it is
  // assigned during the open transition, and refs must not be written in render.
  const [originalSnapshot, setOriginalSnapshot] = useState(null);

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [departmentsList, setDepartmentsList] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function fetchDepartments() {
      try {
        const res = await salaryApi.getDepartments(
          user?.accessToken,
          user?.tokenType
        );
        if (!cancelled && res?.data) {
          const list = res.data.map((dept) => (typeof dept === "string" ? dept : dept.name)).filter(Boolean);
          setDepartmentsList(list);
        }
      } catch (err) {
        console.error("Failed to fetch departments in TrialFormModal:", err);
      }
    }
    fetchDepartments();
    return () => {
      cancelled = true;
    };
  }, [user?.accessToken, user?.tokenType]);

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
    {
      path: "aadhar_card_no",
      isValid: (v) => normaliseAadhaar(v).length === 12 || v.length === 0,
      message: "Must be 12 digits.",
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
    let nextValue = value;

    const numericLimits = {
      mobile_number: 10,
      mobile_no_2: 10,
      hastak_mobile: 10,
      aadhar_card_no: 12,
    };

    if (Object.keys(numericLimits).includes(name)) {
      nextValue = value.replace(/\D/g, "");
      if (numericLimits[name]) {
        nextValue = nextValue.slice(0, numericLimits[name]);
      }
    }

    if (name === "aadhar_card_no") {
      nextValue = nextValue.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
    }

    setFormData((prev) => ({ ...prev, [name]: nextValue }));
    clearError(name);
  };

  /**
   * The form state a freshly opened modal should show. Pure — it returns values
   * instead of assigning them — so the open transition can apply it during
   * render rather than from an effect, which renders the previous trial's
   * values and only then replaces them.
   */
  const buildOpenState = () => {
    if (isEditMode && initialData) {
      const raw = initialData.raw || {};
      const populated = {
        form_no: raw.form_no || "",
        trial_date: raw.trial_date || getTodayDate(),
        department: raw.department || initialData.department || "",
        designation: raw.designation || initialData.designation || "",
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
        hastak_department: raw.hastak_department || "",
        contractor: raw.contractor || "",
        manager_name: raw.manager_name || "",
        akar: raw.akar || "",
        emp_signature: raw.emp_signature || "",
        manager_signature: raw.manager_signature || "",
        hastak_signature: raw.hastak_signature || "",
        hr_signature: raw.hr_signature || "",
        photo: null,
        aadhar_card_no: isEditMode && formatFullAadhaar(raw.aadhaar_full) !== "-" ? formatFullAadhaar(raw.aadhaar_full) : "",
        adhar_image: raw.adhar_image || null,
      };

      return { formData: populated, snapshot: populated, photoPreview: initialData.photo || "" };
    }

    return { formData: EMPTY_FORM, snapshot: null, photoPreview: "" };
  };

  // Populate on open and clear the validation state on close. Assigning state
  // during render is the supported way to reset when a prop changes; from an
  // effect body it renders the stale values first.
  const [photoPreview, setPhotoPreview] = useState("");
  const [wasOpen, setWasOpen] = useState(false);

  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);

    if (isOpen) {
      const next = buildOpenState();
      setFormData(next.formData);
      setOriginalSnapshot(next.snapshot);
      setPhotoPreview(next.photoPreview);
    } else {
      setErrors({});
    }
  }

  // The scroll lock is a genuine external side effect, so it stays in an effect.
  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = "";
      return undefined;
    }

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handlePhotoChange = (file) => {
    if (!file) return;
    setFormData((prev) => ({ ...prev, photo: file }));
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const { requestCapture, cameraModal } = usePhotoCapture({
    onCapture: handlePhotoChange,
  });

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      toast.error("Please check the highlighted fields.");
      return;
    }

    setLoading(true);
    try {
      const submitData = {
        ...formData,
        company_code: resolveWriteCompanyId(companyId || "nidhi-impex")
      };

      if (submitData.aadhar_card_no) {
        submitData.aadhar_card_no = normaliseAadhaar(submitData.aadhar_card_no);
      }

      if (isEditMode) {
        const snap = originalSnapshot || {};
        const payload = new FormData();
        Object.entries(submitData).forEach(([key, value]) => {
          if (value instanceof File) {
            payload.append(key, value);
          } else {
            const curr = String(value ?? "");
            const orig = String(snap[key] ?? "");
            if (curr !== orig) payload.append(key, curr);
          }
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
                <span className="text-[12px] font-bold uppercase whitespace-nowrap flex-shrink-0">Date :</span>
                <div className="w-32">
                  <ModernDatePicker
                    value={formData.trial_date}
                    onChange={(e) => {
                      const event = { target: { name: "trial_date", value: e.target.value } };
                      handleChange(event);
                    }}
                    className="rounded border-b border-black bg-transparent px-1 text-[12px] font-semibold outline-none focus:bg-brand-50/70 w-full"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold uppercase whitespace-nowrap flex-shrink-0">Form No :</span>
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

              <div className="col-span-1 sm:col-span-2 flex flex-col md:flex-row gap-6 mb-2">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className="cursor-pointer group relative"
                    onClick={requestCapture}
                  >
                    <div className="w-32 h-40 border border-gray-400 flex items-center justify-center bg-gray-50 overflow-hidden">
                      {photoPreview ? (
                        <img
                          src={photoPreview}
                          alt="Profile"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center text-[10px]">
                          <p className="font-bold text-gray-400 group-hover:text-brand-500">
                            TAP TO TAKE PHOTO
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="text-[9px] text-gray-400 mt-1 text-center">
                      (Click box to take photo)
                    </p>
                  </div>
                  {cameraModal}
                </div>
                
                <div className="flex-1 flex flex-col gap-3 justify-center">
                  <FullField
                    label="Aadhaar Number"
                    name="aadhar_card_no"
                    value={formData.aadhar_card_no}
                    onChange={handleChange}
                    error={errors.aadhar_card_no}
                    disabled={isEditMode}
                  />
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                      Upload Aadhaar Card
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer inline-flex items-center gap-2 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                        <Upload size={14} />
                        {formData.adhar_image ? "Change File" : "Choose File"}
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              setFormData(prev => ({ ...prev, adhar_image: e.target.files[0] }));
                            }
                          }}
                        />
                      </label>
                      {formData.adhar_image && (
                        <div className="mt-2 w-full max-w-[150px] border rounded overflow-hidden shadow-sm bg-gray-50">
                          {typeof formData.adhar_image === "string" ? (
                            formData.adhar_image.toLowerCase().includes(".pdf") ? (
                              <a href={formData.adhar_image} target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center p-4 text-brand-600 hover:bg-brand-50 transition">
                                <FileText size={24} className="mb-1" />
                                <span className="text-[10px] font-semibold text-center">View PDF</span>
                              </a>
                            ) : (
                              <a href={formData.adhar_image} target="_blank" rel="noreferrer" className="block w-full">
                                <img src={formData.adhar_image} alt="Aadhaar" className="w-full h-auto object-cover max-h-[100px]" />
                              </a>
                            )
                          ) : formData.adhar_image.type === "application/pdf" ? (
                            <div className="flex flex-col items-center justify-center p-4 text-brand-600">
                              <FileText size={24} className="mb-1" />
                              <span className="text-[10px] font-semibold text-center">PDF Selected</span>
                            </div>
                          ) : (
                            <img src={URL.createObjectURL(formData.adhar_image)} alt="Aadhaar" className="w-full h-auto object-cover max-h-[100px]" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

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

              <HalfField
                label="Department"
                name="department"
                value={formData.department}
                onChange={handleChange}
                error={errors.department}
                select
                options={[
                  { value: "", label: "SELECT DEPARTMENT" },
                  ...(departmentsList.length > 0 ? departmentsList : DEFAULT_DEPARTMENTS).map((d) => ({
                    value: d,
                    label: d,
                  })),
                ]}
              />
              <HalfField
                label="Designation"
                name="designation"
                value={formData.designation}
                onChange={handleChange}
                error={errors.designation}
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
                label="Hastak Department [Designation]"
                name="hastak_department"
                value={formData.hastak_department}
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
