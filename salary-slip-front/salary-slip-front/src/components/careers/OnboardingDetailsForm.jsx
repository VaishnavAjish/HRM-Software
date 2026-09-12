import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  User,
  MapPin,
  Building2,
  FileText,
  Users,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Trash2,
  FileCheck,
  Save,
  Send,
  Loader2,
  Eye,
  Plus,
  ShieldCheck,
  Clock,
  Lock,
  X,
} from "lucide-react";
import { candidateApi } from "../../utils/api";
import { INDIA_STATES, getCitiesForState } from "../../utils/indiaStatesCities";
import {
  validateEmail,
  validateMobile,
  validatePan,
  validateAadhaar,
  validateIfsc,
  validateBankAccount,
  validatePinCode,
} from "../../utils/validation";

const NAME_REGEX = /^[A-Za-z\s.]*$/;


function validateField(field, value, formData) {
  switch (field) {
    case "first_name":
      if (!value?.trim()) return "First name is required";
      if (!NAME_REGEX.test(value)) return "Only letters and spaces are allowed";
      return "";
    case "middle_name":
    case "surname":
      if (value && !NAME_REGEX.test(value)) return "Only letters and spaces are allowed";
      return "";
    case "email":
      if (!value?.trim()) return "Email is required";
      if (!validateEmail(value)) return "Enter a valid email address";
      return "";
    case "mobile_number":
      if (!value?.trim()) return "Mobile number is required";
      if (!validateMobile(value)) return "Enter a valid 10-digit mobile number";
      return "";
    case "emp_whatsapp_no":
      if (value && !validateMobile(value)) return "Enter a valid 10-digit number";
      return "";
    case "dob": {
      if (!value) return "";
      const dobDate = new Date(value);
      if (dobDate > new Date()) return "Date of birth cannot be in the future";
      const age = (Date.now() - dobDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (age < 18) return "Candidate must be at least 18 years old";
      if (age > 80) return "Please check the date of birth";
      return "";
    }
    case "present_address":
      if (!value?.trim()) return "Address line is required";
      return "";
    case "present_state":
      if (!value) return "Please select a state";
      return "";
    case "present_district":
      if (!value) return "Please select a city / district";
      return "";
    case "present_pincode":
      if (!value?.trim()) return "Pincode is required";
      if (!validatePinCode(value)) return "Enter a valid 6-digit pincode";
      return "";
    case "permanent_address":
      if (!formData.same_as_present && !value?.trim()) return "Address line is required";
      return "";
    case "permanent_state":
      if (!formData.same_as_present && !value) return "Please select a state";
      return "";
    case "permanent_district":
      if (!formData.same_as_present && !value) return "Please select a city / district";
      return "";
    case "permanent_pincode":
      if (!formData.same_as_present) {
        if (!value?.trim()) return "Pincode is required";
        if (!validatePinCode(value)) return "Enter a valid 6-digit pincode";
      }
      return "";
    case "bank_name":
      if (!value?.trim()) return "Bank name is required";
      return "";
    case "account_number":
      if (!value?.trim()) return "Account number is required";
      if (!validateBankAccount(value)) return "Account number must be 9-18 digits";
      return "";
    case "ifsc_code":
      if (!value?.trim()) return "IFSC code is required";
      if (!validateIfsc(value)) return "Enter a valid IFSC code (e.g. HDFC0001234)";
      return "";
    case "aadhaar_number":
      if (!value?.trim()) return "Aadhaar number is required";
      if (!validateAadhaar(value) || String(value).replace(/\D/g, "").length !== 12) return "Enter a valid 12-digit Aadhaar number";
      return "";
    case "pan_number":
      if (!value?.trim()) return "PAN number is required";
      if (!validatePan(value)) return "Enter a valid PAN number (e.g. ABCDE1234F)";
      return "";
    default:
      return "";
  }
}

export default function OnboardingDetailsForm({ application, onRefresh, token }) {
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("personal");
  const [uploadingType, setUploadingType] = useState(null);
  const [errors, setErrors] = useState({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [requiredDocTypes, setRequiredDocTypes] = useState([]);
  const [docTypesLoading, setDocTypesLoading] = useState(true);

  const initialOnboarding = application?.candidate?.onboarding_details || application?.onboarding_details || {};
  const onboardingStatus = application?.candidate?.onboarding_status || application?.onboarding_status || "NOT_STARTED";
  const isSubmitted = onboardingStatus === "SUBMITTED" || onboardingStatus === "VERIFIED" || onboardingStatus === "COMPLETED";

  // Form State
  const [formData, setFormData] = useState({
    // Personal
    first_name: initialOnboarding.first_name || application?.candidate?.name?.split(" ")[0] || "",
    middle_name: initialOnboarding.middle_name || "",
    surname: initialOnboarding.surname || application?.candidate?.name?.split(" ").slice(1).join(" ") || "",
    email: initialOnboarding.email || application?.candidate?.email || "",
    mobile_number: initialOnboarding.mobile_number || application?.candidate?.phone || "",
    emp_whatsapp_no: initialOnboarding.emp_whatsapp_no || application?.candidate?.phone || "",
    dob: initialOnboarding.dob || "",
    birth_place: initialOnboarding.birth_place || "",
    gender: initialOnboarding.gender || "Male",
    cast: initialOnboarding.cast || "",
    marital_status: initialOnboarding.marital_status || "Single",
    blood_group: initialOnboarding.blood_group || "O+",

    // Address
    same_as_present: initialOnboarding.same_as_present ?? true,
    present_address: initialOnboarding.present_address || "",
    present_village: initialOnboarding.present_village || "",
    present_taluka: initialOnboarding.present_taluka || "",
    present_district: initialOnboarding.present_district || "",
    present_state: initialOnboarding.present_state || "",
    present_pincode: initialOnboarding.present_pincode || "",

    permanent_address: initialOnboarding.permanent_address || "",
    permanent_village: initialOnboarding.permanent_village || "",
    permanent_taluka: initialOnboarding.permanent_taluka || "",
    permanent_district: initialOnboarding.permanent_district || "",
    permanent_state: initialOnboarding.permanent_state || "",
    permanent_pincode: initialOnboarding.permanent_pincode || "",

    // Bank
    bank_name: initialOnboarding.bank_name || "",
    account_number: initialOnboarding.account_number || "",
    ifsc_code: initialOnboarding.ifsc_code || "",
    branch_name: initialOnboarding.branch_name || "",

    // Statutory
    aadhaar_number: initialOnboarding.aadhaar_number || "",
    pan_number: initialOnboarding.pan_number || "",

    // Emergency Contact
    emergency_name: initialOnboarding.emergency_name || "",
    emergency_relation: initialOnboarding.emergency_relation || "",
    emergency_phone: initialOnboarding.emergency_phone || "",
    emergency_address: initialOnboarding.emergency_address || "",

    // Family Members
    family_members: initialOnboarding.family_members || [
      { name: "", relation: "Father", dob: "", mobile: "", occupation: "" },
    ],
  });

  // Document types shown here are sourced from Settings > HR > Documents —
  // never hardcoded — so candidates are only ever asked for what HR
  // actually configured as required onboarding documents.
  useEffect(() => {
    let cancelled = false;
    candidateApi
      .getOnboardingDocumentTypes(token)
      .then((res) => {
        if (cancelled) return;
        if (res && (res.status === true || res.ok) && Array.isArray(res.data)) {
          setRequiredDocTypes(res.data);
        } else {
          setRequiredDocTypes([]);
        }
      })
      .catch((err) => {
        console.error("Failed to load document types:", err);
        if (!cancelled) setRequiredDocTypes([]);
      })
      .finally(() => {
        if (!cancelled) setDocTypesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: "" } : prev));
  };

  const handleStateChange = (field, value) => {
    const cityField = field === "present_state" ? "present_district" : "permanent_district";
    setFormData((prev) => ({ ...prev, [field]: value, [cityField]: "" }));
    setErrors((prev) => ({ ...prev, [field]: "", [cityField]: "" }));
  };

  const handleBlur = (field) => {
    const message = validateField(field, formData[field], formData);
    setErrors((prev) => ({ ...prev, [field]: message }));
  };

  const inputClass = (field) =>
    `mt-1.5 w-full rounded-xl border bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:outline-none focus:ring-1 transition-shadow placeholder-slate-400 disabled:bg-slate-50 disabled:text-slate-500 ${
      errors[field]
        ? "border-red-400 focus:border-red-500 focus:ring-red-500"
        : "border-slate-300 focus:border-blue-500 focus:ring-blue-500"
    }`;

  const renderFieldError = (field) =>
    errors[field] ? (
      <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-red-600">
        <AlertCircle size={11} /> {errors[field]}
      </p>
    ) : null;

  const handleFamilyChange = (index, field, value) => {
    setFormData((prev) => {
      const list = [...prev.family_members];
      list[index] = { ...list[index], [field]: value };
      return { ...prev, family_members: list };
    });
  };

  const addFamilyMember = () => {
    setFormData((prev) => ({
      ...prev,
      family_members: [
        ...prev.family_members,
        { name: "", relation: "Mother", dob: "", mobile: "", occupation: "" },
      ],
    }));
  };

  const removeFamilyMember = (index) => {
    setFormData((prev) => ({
      ...prev,
      family_members: prev.family_members.filter((_, idx) => idx !== index),
    }));
  };

  // Document Upload — locked once submitted, EXCEPT re-uploading a document
  // HR has rejected, which must always stay possible.
  const handleFileUpload = async (docType, file) => {
    if (!file) return;
    const existing = getDoc(docType);
    if (isSubmitted && existing?.status !== "REJECTED") {
      toast.error("Your onboarding is already submitted and locked. Contact HR to make changes.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10MB");
      return;
    }

    setUploadingType(docType);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("document_type", docType);

      const res = await candidateApi.uploadOnboardingDocument(application.id, fd, token);
      if (res && (res.status === true || res.ok)) {
        toast.success(`${docType} uploaded successfully!`);
        onRefresh?.();
      } else {
        toast.error(res?.message || "Failed to upload document");
      }
    } catch (err) {
      console.error("Upload error:", err);
      toast.error(err?.response?.data?.message || err?.message || "Failed to upload document");
    } finally {
      setUploadingType(null);
    }
  };

  const handleDeleteDoc = async (docId, docName, docStatus) => {
    if (isSubmitted && docStatus !== "REJECTED") {
      toast.error("Your onboarding is already submitted and locked. Contact HR to make changes.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete ${docName || "this document"}?`)) return;
    try {
      const res = await candidateApi.deleteOnboardingDocument(application.id, docId, token);
      if (res && (res.status === true || res.ok)) {
        toast.success("Document removed");
        onRefresh?.();
      } else {
        toast.error(res?.message || "Failed to delete document");
      }
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Failed to delete document");
    }
  };

  // Section -> mandatory fields, used to run full validation before final submit
  const SECTION_REQUIRED_FIELDS = {
    personal: ["first_name", "email", "mobile_number"],
    address: formData.same_as_present
      ? ["present_address", "present_state", "present_district", "present_pincode"]
      : [
          "present_address",
          "present_state",
          "present_district",
          "present_pincode",
          "permanent_address",
          "permanent_state",
          "permanent_district",
          "permanent_pincode",
        ],
    bank: ["bank_name", "account_number", "ifsc_code"],
    statutory: ["aadhaar_number", "pan_number"],
  };

  const validateAllFields = () => {
    const nextErrors = {};
    let firstInvalidSection = null;

    for (const [section, fields] of Object.entries(SECTION_REQUIRED_FIELDS)) {
      for (const field of fields) {
        const message = validateField(field, formData[field], formData);
        if (message) {
          nextErrors[field] = message;
          if (!firstInvalidSection) firstInvalidSection = section;
        }
      }
    }

    setErrors((prev) => ({ ...prev, ...nextErrors }));
    return { valid: Object.keys(nextErrors).length === 0, firstInvalidSection };
  };

  // Form Submit / Save
  const handleSave = async (submitFinal = false) => {
    if (submitFinal) {
      const { valid, firstInvalidSection } = validateAllFields();
      if (!valid) {
        toast.error("Please fix the highlighted fields before submitting");
        if (firstInvalidSection) setActiveSection(firstInvalidSection);
        return;
      }
    }

    setLoading(true);
    try {
      const res = await candidateApi.saveOnboarding(application.id, {
        ...formData,
        is_submitted: submitFinal,
      }, token);

      if (res && (res.status === true || res.ok)) {
        toast.success(
          submitFinal
            ? "Onboarding details & documents submitted successfully! Our HR team will review your profile."
            : "Onboarding draft saved successfully!"
        );
        onRefresh?.();
      } else {
        toast.error(res?.message || "Failed to save details");
      }
    } catch (err) {
      console.error("Save error:", err);
      toast.error(err?.response?.data?.message || err?.message || "Failed to save onboarding details");
    } finally {
      setLoading(false);
      setShowConfirmModal(false);
    }
  };

  const requestFinalSubmit = () => {
    const { valid, firstInvalidSection } = validateAllFields();
    if (!valid) {
      toast.error("Please fix the highlighted fields before submitting");
      if (firstInvalidSection) setActiveSection(firstInvalidSection);
      return;
    }
    setShowConfirmModal(true);
  };

  const documents = application?.candidate?.documents || application?.documents || [];

  const getDoc = (type) => documents.find((d) => d.document_type === type);

  const sections = [
    { id: "personal", label: "Personal Information", icon: User },
    { id: "address", label: "Address Details", icon: MapPin },
    { id: "bank", label: "Bank & Financial", icon: Building2 },
    { id: "statutory", label: "Statutory & KYC", icon: FileText },
    { id: "family", label: "Family / Nominees", icon: Users },
    { id: "documents", label: "Document Verification", icon: UploadCloud },
  ];

  return (
    <div className="space-y-6">
            {/* Header Banner */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600 border border-blue-100/50 shadow-sm">
              <ShieldCheck size={26} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
                  Appointment & Onboarding Form
                </h2>
                {isSubmitted ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-extrabold tracking-wide uppercase text-emerald-800 border border-emerald-200">
                    <CheckCircle2 size={13} /> Submitted for Verification
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-extrabold tracking-wide uppercase text-amber-800 border border-amber-200">
                    <Clock size={13} /> Draft / Action Required
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-slate-500 font-medium">
                {isSubmitted
                  ? "Your details have been submitted and are locked for editing. Our HR team will review your profile and reach out if anything needs correction."
                  : "Please complete your personal, banking, statutory details, and upload mandatory documents."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isSubmitted ? (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-bold text-slate-500">
                <Lock size={14} /> Locked after submission
              </span>
            ) : (
              <>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleSave(false)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50"
                >
                  <Save size={14} /> Save Draft
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={requestFinalSubmit}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 hover:shadow disabled:opacity-50"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Submit Details
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Submit Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-50 p-2.5 text-amber-600 border border-amber-100">
                <AlertCircle size={22} />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-extrabold text-slate-900">Submit Onboarding Details?</h3>
                <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-slate-600">
                  Once submitted, your personal, address, banking, statutory and family details{" "}
                  <span className="font-bold text-slate-900">cannot be edited or changed</span>{" "}
                  by you again. Uploaded documents also cannot be added or removed. Please review every
                  section carefully before confirming — if a correction is needed later you will have to
                  contact HR directly.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => setShowConfirmModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Go Back &amp; Review
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleSave(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Yes, Submit Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid Layout: Section Tabs & Active Form */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4 mt-6">
        {/* Navigation Sidebar */}
        <div className="space-y-1 lg:col-span-1">
          <nav className="rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-sm sticky top-6">
            <p className="px-3 pb-2 pt-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Form Sections
            </p>
            {sections.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(sec.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-200 mb-1 ${
                    isActive
                      ? "bg-slate-900 text-white shadow-md shadow-slate-900/10"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon size={16} className={isActive ? "text-slate-300" : "text-slate-400"} />
                  <span className="text-left leading-snug">{sec.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Form Container */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm lg:col-span-3">
          {isSubmitted && (
            <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-800">
              <Lock size={15} className="shrink-0" />
              This form is locked because it has already been submitted. Contact HR if you need to correct anything.
            </div>
          )}
          <fieldset disabled={isSubmitted} className="contents">
          {/* 1. PERSONAL INFORMATION */}
          {activeSection === "personal" && (
            <div className="space-y-5">
              <div className="border-b border-slate-100 mb-6 pb-3 dark:border-gray-800">
                <h3 className="text-lg font-bold tracking-tight text-slate-900">Personal Information</h3>
                <p className="text-[13px] font-medium text-slate-500">Basic details as per official government records</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wide">First Name *</label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => handleChange("first_name", e.target.value)}
                    onBlur={() => handleBlur("first_name")}
                    className={inputClass("first_name")}
                  />
                  {renderFieldError("first_name")}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wide">Middle Name</label>
                  <input
                    type="text"
                    value={formData.middle_name}
                    onChange={(e) => handleChange("middle_name", e.target.value)}
                    onBlur={() => handleBlur("middle_name")}
                    className={inputClass("middle_name")}
                  />
                  {renderFieldError("middle_name")}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wide">Surname</label>
                  <input
                    type="text"
                    value={formData.surname}
                    onChange={(e) => handleChange("surname", e.target.value)}
                    onBlur={() => handleBlur("surname")}
                    className={inputClass("surname")}
                  />
                  {renderFieldError("surname")}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wide">Email ID *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    onBlur={() => handleBlur("email")}
                    className={inputClass("email")}
                  />
                  {renderFieldError("email")}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wide">Mobile Number *</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={formData.mobile_number}
                    onChange={(e) => handleChange("mobile_number", e.target.value.replace(/\D/g, ""))}
                    onBlur={() => handleBlur("mobile_number")}
                    className={inputClass("mobile_number")}
                  />
                  {renderFieldError("mobile_number")}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wide">WhatsApp Number</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={formData.emp_whatsapp_no}
                    onChange={(e) => handleChange("emp_whatsapp_no", e.target.value.replace(/\D/g, ""))}
                    onBlur={() => handleBlur("emp_whatsapp_no")}
                    className={inputClass("emp_whatsapp_no")}
                  />
                  {renderFieldError("emp_whatsapp_no")}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wide">Date of Birth</label>
                  <input
                    type="date"
                    max={new Date().toISOString().split("T")[0]}
                    value={formData.dob}
                    onChange={(e) => handleChange("dob", e.target.value)}
                    onBlur={() => handleBlur("dob")}
                    className={inputClass("dob")}
                  />
                  {renderFieldError("dob")}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wide">Place of Birth</label>
                  <input
                    type="text"
                    value={formData.birth_place}
                    onChange={(e) => handleChange("birth_place", e.target.value)}
                    placeholder="City / Village"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow placeholder-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wide">Gender</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => handleChange("gender", e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow placeholder-slate-400"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wide">Caste / Category</label>
                  <input
                    type="text"
                    value={formData.cast}
                    onChange={(e) => handleChange("cast", e.target.value)}
                    placeholder="e.g. General, OBC, SC, ST"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow placeholder-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wide">Marital Status</label>
                  <select
                    value={formData.marital_status}
                    onChange={(e) => handleChange("marital_status", e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow placeholder-slate-400"
                  >
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Widowed">Widowed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wide">Blood Group</label>
                  <select
                    value={formData.blood_group}
                    onChange={(e) => handleChange("blood_group", e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow placeholder-slate-400"
                  >
                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 2. ADDRESS DETAILS */}
          {activeSection === "address" && (
            <div className="space-y-5">
              <div className="border-b border-slate-100 mb-6 pb-3 dark:border-gray-800">
                <h3 className="text-lg font-bold tracking-tight text-slate-900">Present & Permanent Address</h3>
                <p className="text-[13px] font-medium text-slate-500">Residential address for communication & verification</p>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Present Address</h4>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 tracking-wide">Address Line *</label>
                    <input
                      type="text"
                      value={formData.present_address}
                      onChange={(e) => handleChange("present_address", e.target.value)}
                      onBlur={() => handleBlur("present_address")}
                      placeholder="Flat, House no., Building, Street"
                      className={inputClass("present_address")}
                    />
                    {renderFieldError("present_address")}
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 tracking-wide">Village</label>
                      <input
                        type="text"
                        value={formData.present_village}
                        onChange={(e) => handleChange("present_village", e.target.value)}
                        className={inputClass("present_village")}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 tracking-wide">Taluka</label>
                      <input
                        type="text"
                        value={formData.present_taluka}
                        onChange={(e) => handleChange("present_taluka", e.target.value)}
                        className={inputClass("present_taluka")}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 tracking-wide">State *</label>
                      <select
                        value={formData.present_state}
                        onChange={(e) => handleStateChange("present_state", e.target.value)}
                        onBlur={() => handleBlur("present_state")}
                        className={inputClass("present_state")}
                      >
                        <option value="">Select State</option>
                        {INDIA_STATES.map((st) => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                      {renderFieldError("present_state")}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 tracking-wide">City / District *</label>
                      <select
                        value={formData.present_district}
                        onChange={(e) => handleChange("present_district", e.target.value)}
                        onBlur={() => handleBlur("present_district")}
                        disabled={isSubmitted || !formData.present_state}
                        className={inputClass("present_district")}
                      >
                        <option value="">{formData.present_state ? "Select City" : "Select state first"}</option>
                        {getCitiesForState(formData.present_state).map((city) => (
                          <option key={city} value={city}>{city}</option>
                        ))}
                      </select>
                      {renderFieldError("present_district")}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 tracking-wide">Pincode *</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={formData.present_pincode}
                        onChange={(e) => handleChange("present_pincode", e.target.value.replace(/\D/g, ""))}
                        onBlur={() => handleBlur("present_pincode")}
                        className={inputClass("present_pincode")}
                      />
                      {renderFieldError("present_pincode")}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Permanent Address</h4>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={formData.same_as_present}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData((prev) => ({
                          ...prev,
                          same_as_present: checked,
                          permanent_address: checked ? prev.present_address : prev.permanent_address,
                          permanent_village: checked ? prev.present_village : prev.permanent_village,
                          permanent_taluka: checked ? prev.present_taluka : prev.permanent_taluka,
                          permanent_district: checked ? prev.present_district : prev.permanent_district,
                          permanent_state: checked ? prev.present_state : prev.permanent_state,
                          permanent_pincode: checked ? prev.present_pincode : prev.permanent_pincode,
                        }));
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Same as present address
                  </label>
                </div>

                {!formData.same_as_present && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 tracking-wide">Address Line *</label>
                      <input
                        type="text"
                        value={formData.permanent_address}
                        onChange={(e) => handleChange("permanent_address", e.target.value)}
                        onBlur={() => handleBlur("permanent_address")}
                        placeholder="Flat, House no., Building, Street"
                        className={inputClass("permanent_address")}
                      />
                      {renderFieldError("permanent_address")}
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 tracking-wide">Village</label>
                        <input
                          type="text"
                          value={formData.permanent_village}
                          onChange={(e) => handleChange("permanent_village", e.target.value)}
                          className={inputClass("permanent_village")}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 tracking-wide">Taluka</label>
                        <input
                          type="text"
                          value={formData.permanent_taluka}
                          onChange={(e) => handleChange("permanent_taluka", e.target.value)}
                          className={inputClass("permanent_taluka")}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 tracking-wide">State *</label>
                        <select
                          value={formData.permanent_state}
                          onChange={(e) => handleStateChange("permanent_state", e.target.value)}
                          onBlur={() => handleBlur("permanent_state")}
                          className={inputClass("permanent_state")}
                        >
                          <option value="">Select State</option>
                          {INDIA_STATES.map((st) => (
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>
                        {renderFieldError("permanent_state")}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 tracking-wide">City / District *</label>
                        <select
                          value={formData.permanent_district}
                          onChange={(e) => handleChange("permanent_district", e.target.value)}
                          onBlur={() => handleBlur("permanent_district")}
                          disabled={isSubmitted || !formData.permanent_state}
                          className={inputClass("permanent_district")}
                        >
                          <option value="">{formData.permanent_state ? "Select City" : "Select state first"}</option>
                          {getCitiesForState(formData.permanent_state).map((city) => (
                            <option key={city} value={city}>{city}</option>
                          ))}
                        </select>
                        {renderFieldError("permanent_district")}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 tracking-wide">Pincode *</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={formData.permanent_pincode}
                          onChange={(e) => handleChange("permanent_pincode", e.target.value.replace(/\D/g, ""))}
                          onBlur={() => handleBlur("permanent_pincode")}
                          className={inputClass("permanent_pincode")}
                        />
                        {renderFieldError("permanent_pincode")}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. BANK DETAILS */}
          {activeSection === "bank" && (
            <div className="space-y-5">
              <div className="border-b border-slate-100 mb-6 pb-3 dark:border-gray-800">
                <h3 className="text-lg font-bold tracking-tight text-slate-900">Bank & Salary Account</h3>
                <p className="text-[13px] font-medium text-slate-500">Bank details for salary credit and payroll processing</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wide">Bank Name *</label>
                  <input
                    type="text"
                    value={formData.bank_name}
                    onChange={(e) => handleChange("bank_name", e.target.value)}
                    onBlur={() => handleBlur("bank_name")}
                    placeholder="e.g. HDFC Bank, SBI, ICICI"
                    className={inputClass("bank_name")}
                  />
                  {renderFieldError("bank_name")}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wide">Account Number *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={18}
                    value={formData.account_number}
                    onChange={(e) => handleChange("account_number", e.target.value.replace(/\D/g, ""))}
                    onBlur={() => handleBlur("account_number")}
                    placeholder="Enter full bank account number"
                    className={inputClass("account_number")}
                  />
                  {renderFieldError("account_number")}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wide">IFSC Code *</label>
                  <input
                    type="text"
                    maxLength={11}
                    value={formData.ifsc_code}
                    onChange={(e) => handleChange("ifsc_code", e.target.value.toUpperCase())}
                    onBlur={() => handleBlur("ifsc_code")}
                    placeholder="e.g. HDFC0001234"
                    className={inputClass("ifsc_code")}
                  />
                  {renderFieldError("ifsc_code")}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wide">Branch Name</label>
                  <input
                    type="text"
                    value={formData.branch_name}
                    onChange={(e) => handleChange("branch_name", e.target.value)}
                    placeholder="Branch location"
                    className={inputClass("branch_name")}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 4. STATUTORY & KYC */}
          {activeSection === "statutory" && (
            <div className="space-y-5">
              <div className="border-b border-slate-100 mb-6 pb-3 dark:border-gray-800">
                <h3 className="text-lg font-bold tracking-tight text-slate-900">Statutory & Identity (KYC)</h3>
                <p className="text-[13px] font-medium text-slate-500">Government identification numbers for PF, ESIC & tax filings</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wide">Aadhaar Card Number *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formData.aadhaar_number}
                    onChange={(e) => handleChange("aadhaar_number", e.target.value.replace(/\D/g, ""))}
                    onBlur={() => handleBlur("aadhaar_number")}
                    placeholder="12-digit Aadhaar Number"
                    maxLength={12}
                    className={inputClass("aadhaar_number")}
                  />
                  {renderFieldError("aadhaar_number")}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wide">PAN Card Number *</label>
                  <input
                    type="text"
                    value={formData.pan_number}
                    onChange={(e) => handleChange("pan_number", e.target.value.toUpperCase())}
                    onBlur={() => handleBlur("pan_number")}
                    placeholder="10-digit PAN (e.g. ABCDE1234F)"
                    maxLength={10}
                    className={inputClass("pan_number")}
                  />
                  {renderFieldError("pan_number")}
                </div>
              </div>
            </div>
          )}

          {/* 6. FAMILY / NOMINEES */}
          {activeSection === "family" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 mb-6 pb-3 dark:border-gray-800">
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-slate-900">Family Members & Nominees</h3>
                  <p className="text-[13px] font-medium text-slate-500">List of family members for insurance & statutory nominee records</p>
                </div>
                <button
                  type="button"
                  onClick={addFamilyMember}
                  className="inline-flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300"
                >
                  <Plus size={14} /> Add Member
                </button>
              </div>

              <div className="space-y-3">
                {formData.family_members?.map((member, idx) => (
                  <div key={idx} className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/40">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Member #{idx + 1}</span>
                      {formData.family_members.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeFamilyMember(idx)}
                          className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">Full Name</label>
                        <input
                          type="text"
                          value={member.name}
                          onChange={(e) => handleFamilyChange(idx, "name", e.target.value)}
                          placeholder="Name"
                          className="mt-0.5 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">Relation</label>
                        <select
                          value={member.relation}
                          onChange={(e) => handleFamilyChange(idx, "relation", e.target.value)}
                          className="mt-0.5 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                        >
                          {["Father", "Mother", "Spouse", "Son", "Daughter", "Brother", "Sister", "Other"].map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">Date of Birth</label>
                        <input
                          type="date"
                          value={member.dob}
                          onChange={(e) => handleFamilyChange(idx, "dob", e.target.value)}
                          className="mt-0.5 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">Mobile</label>
                        <input
                          type="tel"
                          inputMode="numeric"
                          maxLength={10}
                          value={member.mobile}
                          onChange={(e) => handleFamilyChange(idx, "mobile", e.target.value.replace(/\D/g, ""))}
                          placeholder="Phone"
                          className="mt-0.5 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400">Occupation</label>
                        <input
                          type="text"
                          value={member.occupation}
                          onChange={(e) => handleFamilyChange(idx, "occupation", e.target.value)}
                          placeholder="Occupation"
                          className="mt-0.5 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </fieldset>

          {/* 7. DOCUMENT UPLOADS — deliberately outside the fieldset above:
              a document HR rejects must stay re-uploadable even after the
              rest of the form is locked by final submission. */}
          {activeSection === "documents" && (
            <div className="space-y-5">
              <div className="border-b border-slate-100 mb-6 pb-3 dark:border-gray-800">
                <h3 className="text-lg font-bold tracking-tight text-slate-900">Document Verification & Uploads</h3>
                <p className="text-[13px] font-medium text-slate-500">Upload clear scanned copies or PDF/photos of your documents (Max 10MB each)</p>
              </div>

              {docTypesLoading ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 py-10 text-sm font-medium text-gray-500">
                  <Loader2 size={16} className="animate-spin" /> Loading required documents...
                </div>
              ) : requiredDocTypes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 py-10 text-center text-sm font-medium text-gray-500">
                  No documents have been configured for onboarding yet. Please check back later or contact HR.
                </div>
              ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {requiredDocTypes.map((req) => {
                  const uploaded = getDoc(req.type);
                  const isUploading = uploadingType === req.type;
                  const status = uploaded?.status || null; // PENDING | VERIFIED | REJECTED
                  const isRejected = status === "REJECTED";
                  const isVerified = status === "VERIFIED";
                  // Rejected documents stay actionable even after final
                  // submission locks everything else; anything else respects the lock.
                  const isLockedForThis = isSubmitted && !isRejected;

                  const cardBorderClass = isRejected
                    ? "border-red-300 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/20"
                    : uploaded
                      ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                      : "border-gray-200/90 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/30";

                  return (
                    <div key={req.id} className={`rounded-2xl border p-4 transition ${cardBorderClass}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-gray-900 dark:text-white">
                              {req.label}
                            </span>
                            {req.required && (
                              <span className="text-[10px] font-bold text-red-500">*</span>
                            )}
                          </div>
                          <span className="mt-0.5 inline-block text-[11px] text-gray-500 dark:text-gray-400">
                            Type: {req.type}
                          </span>
                        </div>

                        {isRejected ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/60 dark:text-red-300">
                            <AlertCircle size={12} /> Rejected
                          </span>
                        ) : isVerified ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                            <FileCheck size={12} /> Verified
                          </span>
                        ) : uploaded ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                            <Clock size={12} /> Under Review
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                            <AlertCircle size={12} /> Pending
                          </span>
                        )}
                      </div>

                      {isRejected && (
                        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-2.5 text-[11px] font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                          Rejected by HR{uploaded.review_notes ? `: ${uploaded.review_notes}` : " — please re-upload a corrected copy."}
                        </div>
                      )}

                      {uploaded ? (
                        <div className="mt-4 flex items-center justify-between rounded-xl border border-gray-200/80 bg-white p-2.5 text-xs dark:border-gray-800 dark:bg-gray-900">
                          <div className="flex items-center gap-2 truncate">
                            <FileText size={16} className={`shrink-0 ${isRejected ? "text-red-500" : "text-emerald-600"}`} />
                            <span className="truncate font-medium text-gray-700 dark:text-gray-300">
                              {uploaded.original_filename || `${req.type}.pdf`}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {uploaded.file_url && (
                              <a
                                href={uploaded.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600 dark:hover:bg-gray-800"
                                title="View Document"
                              >
                                <Eye size={14} />
                              </a>
                            )}
                            <button
                              type="button"
                              disabled={isLockedForThis}
                              onClick={() => handleDeleteDoc(uploaded.id, uploaded.original_filename, uploaded.status)}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-red-950/30"
                              title="Delete Document"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {/* Re-upload control: shown when nothing is uploaded yet, OR when
                          this specific document was rejected — even if the rest of the
                          form is locked after final submission. */}
                      {(!uploaded || isRejected) && (
                        <div className="mt-4">
                          <label
                            className={`flex flex-col items-center justify-center rounded-xl border border-dashed py-3.5 px-3 text-center transition dark:bg-gray-900 ${
                              isLockedForThis
                                ? "cursor-not-allowed border-gray-200 bg-gray-100 dark:border-gray-800"
                                : "cursor-pointer border-gray-300 bg-white hover:border-blue-500 hover:bg-blue-50/20 dark:border-gray-700 dark:hover:border-blue-400"
                            }`}
                          >
                            {isUploading ? (
                              <div className="flex items-center gap-2 text-xs text-blue-600 font-medium">
                                <Loader2 size={15} className="animate-spin" /> Uploading...
                              </div>
                            ) : (
                              <>
                                <UploadCloud size={18} className="text-gray-400" />
                                <span className="mt-1 text-[11px] font-medium text-gray-700 dark:text-gray-300">
                                  {isRejected ? "Click to re-upload corrected file" : "Click to upload file"}
                                </span>
                                <span className="text-[10px] text-gray-400">{req.allowed || "PDF, PNG, JPG"} (max {req.max_size || "10 MB"})</span>
                              </>
                            )}
                            <input
                              type="file"
                              accept=".pdf,.png,.jpg,.jpeg"
                              disabled={isUploading || isLockedForThis}
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(req.type, file);
                              }}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
