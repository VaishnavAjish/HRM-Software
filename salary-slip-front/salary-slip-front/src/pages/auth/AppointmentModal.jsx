import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Upload,
  ChevronRight,
  ChevronLeft,
  Check,
  RefreshCw,
  Trash2,
  AlertCircle,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { authApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyUnits, COMPANY_OPTIONS } from "../../config/companyConfig";

const DOC_FIELDS = [
  { key: "adhar_image", label: "Aadhar Card" },
  { key: "pan_image", label: "PAN Card" },
  { key: "check_image", label: "Cheque" },
];

const AppointmentModal = ({
  isOpen,
  onClose,
  initialData = null,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { companyId, isAllCompanies } = useCompany();
  const getTodayDate = () => new Date().toISOString().split("T")[0];

  const isEditMode = Boolean(initialData);
  const originalSnapshot = useRef(null);

  const [step, setStep] = useState(1);

  const [selectedCompanyId, setSelectedCompanyId] = useState(
    isAllCompanies ? "" : companyId,
  );

  const unitOptions = selectedCompanyId
    ? getCompanyUnits(selectedCompanyId)
    : [];

  const [formData, setFormData] = useState({
    photo: null,
    emp_code: "",
    joining_date: getTodayDate(),
    department: "",
    designation: "",
    manager_name: "",
    salary: "",
    mobile_number: "",
    emp_whatsapp_no: "",
    punching_no: "",
    name: { first: "", mid: "", surname: "" },
    email: "",
    address: "",
    village: "",
    taluka: "",
    district: "",
    dob: "",
    birth_place: "",
    gender: "",
    cast: "",
    marital_status: "",
    blood_group: "",
    reference_name: "",
    reference_mobile_no: "",
    aadhar_card_no: "",
    bank_name: "",
    pan_card_no: "",
    bank_ifsc_code: "",
    education: "",
    bank_account_no: "",
    company_code: isAllCompanies ? "" : companyId,
    unit: "",
    emp_signature: "",
    members: Array(4).fill({
      name: "",
      relation: "",
      dob: "",
      mobile: "",
      occupation: "",
    }),
  });

  const [documents, setDocuments] = useState({
    adhar_image: null,
    pan_image: null,
    check_image: null,
  });
  const [docPreviews, setDocPreviews] = useState({
    adhar_image: "",
    pan_image: "",
    check_image: "",
  });

  const [existingDocs, setExistingDocs] = useState({
    adhar_image: null,
    pan_image: null,
    check_image: null,
  });

  const [loading, setLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  const [errors, setErrors] = useState({});
  const [docErrors, setDocErrors] = useState({});

  const requiredFields = [
    { path: "joining_date", label: "Joining Date" },
    { path: "department", label: "Department" },
    { path: "designation", label: "Designation" },
    { path: "manager_name", label: "Manager Name" },
    { path: "salary", label: "Salary" },
    { path: "mobile_number", label: "Emp. Mobile No" },
    { path: "emp_whatsapp_no", label: "Emp. Whatsapp No" },
    { path: "punching_no", label: "Punching No" },
    { path: "name.first", label: "First Name" },
    { path: "name.mid", label: "Mid Name" },
    { path: "name.surname", label: "Surname" },
    { path: "email", label: "Email" },
    { path: "address", label: "Resident Add" },
    { path: "village", label: "Village" },
    { path: "taluka", label: "Taluka" },
    { path: "district", label: "District" },
    { path: "dob", label: "Birth Date" },
    { path: "reference_name", label: "Reference Name" },
    { path: "reference_mobile_no", label: "Reference Mobile" },
    { path: "aadhar_card_no", label: "Aadhar Card No" },
    { path: "bank_name", label: "Bank Name" },
    { path: "pan_card_no", label: "PAN Card No" },
    { path: "bank_ifsc_code", label: "Bank IFSC Code" },
    { path: "bank_account_no", label: "Bank Account No" },
    ...(isAllCompanies ? [{ path: "company_code", label: "Company" }] : []),
    { path: "unit", label: "Unit Name" },
    { path: "emp_signature", label: "Emp. Signature" },
  ];

  const fieldValidators = [
    {
      path: "mobile_number",
      isValid: (v) => /^[6-9]\d{9}$/.test(v),
      message: "Must be a valid 10-digit mobile number.",
    },
    {
      path: "emp_whatsapp_no",
      isValid: (v) => /^[6-9]\d{9}$/.test(v),
      message: "Must be a valid 10-digit mobile number.",
    },
    {
      path: "punching_no",
      isValid: (v) => /^\d+$/.test(v),
      message: "Must contain digits only.",
    },
    {
      path: "reference_mobile_no",
      isValid: (v) => /^[6-9]\d{9}$/.test(v),
      message: "Must be a valid 10-digit mobile number.",
    },
    {
      path: "aadhar_card_no",
      isValid: (v) => /^\d{12}$/.test(v),
      message: "Must be 12 digits.",
    },
    {
      path: "pan_card_no",
      isValid: (v) => /^[A-Z]{5}\d{4}[A-Z]$/.test(v),
      message: "Must be in valid format, e.g. ABCDE1234F.",
    },
    {
      path: "bank_ifsc_code",
      isValid: (v) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v),
      message: "Must be in valid format, e.g. SBIN0001234.",
    },
    {
      path: "bank_account_no",
      isValid: (v) => /^\d{9,18}$/.test(v),
      message: "Must be 9 to 18 digits.",
    },
    {
      path: "email",
      isValid: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: "Must be a valid email address.",
    },
  ];

  const getFieldValue = (path) =>
    path.split(".").reduce((val, key) => val?.[key], formData);

  const validateStep1 = () => {
    const nextErrors = {};
    requiredFields.forEach(({ path, label }) => {
      const value = getFieldValue(path);
      if (value == null || String(value).trim() === "") {
        nextErrors[path] = `${label} is required.`;
      }
    });
    fieldValidators.forEach(({ path, isValid, message }) => {
      const value = String(getFieldValue(path) ?? "")
        .trim()
        .toUpperCase();
      if (!nextErrors[path] && value !== "" && !isValid(value)) {
        nextErrors[path] = message;
      }
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateStep2 = () => true;

  const clearError = (path) => {
    setErrors((prev) => {
      if (!prev[path]) return prev;
      const updated = { ...prev };
      delete updated[path];
      return updated;
    });
  };

  const handleNext = () => {
    if (validateStep1()) {
      setStep(2);
      window.scrollTo(0, 0);
    } else {
      toast.error("Please fill all required fields.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateStep2()) {
      toast.error("Please upload all required documents.");
      return;
    }

    setLoading(true);
    try {
      if (isEditMode) {
        const snap = originalSnapshot.current || {};
        const payload = new FormData();
        payload.append("id", initialData.id);

        // Only append text fields that changed
        const TEXT_FIELDS = [
          "emp_code",
          "joining_date",
          "department",
          "designation",
          "manager_name",
          "salary",
          "mobile_number",
          "emp_whatsapp_no",
          "punching_no",
          "email",
          "address",
          "village",
          "taluka",
          "district",
          "dob",
          "birth_place",
          "gender",
          "cast",
          "marital_status",
          "blood_group",
          "reference_name",
          "reference_mobile_no",
          "aadhar_card_no",
          "bank_name",
          "pan_card_no",
          "bank_ifsc_code",
          "education",
          "bank_account_no",
          "company_code",
          "unit",
          "emp_signature",
        ];
        TEXT_FIELDS.forEach((key) => {
          const curr = String(formData[key] ?? "");
          const orig = String(snap[key] ?? "");
          if (curr !== orig) payload.append(key, curr);
        });

        // Name
        const currentName =
          `${formData.name.first} ${formData.name.mid} ${formData.name.surname}`
            .replace(/\s+/g, " ")
            .trim();
        if (currentName !== (snap.nameStr || ""))
          payload.append("name", currentName);

        // Members
        const currentMembersJson = JSON.stringify(formData.members);
        if (currentMembersJson !== snap.membersJson)
          payload.append("members", currentMembersJson);

        // Photo only if a new file was selected
        if (formData.photo instanceof File)
          payload.append("photo", formData.photo);

        // Documents only if new files selected
        DOC_FIELDS.forEach(({ key }) => {
          if (documents[key] instanceof File)
            payload.append(key, documents[key]);
        });

        const res = await authApi.updateAppointment(
          payload,
          user?.accessToken,
          user?.tokenType,
        );
        toast.success(res.message || "Appointment updated successfully.");
        if (onSuccess) onSuccess();
        else onClose();
      } else {
        const submitData = {
          ...formData,
          name: `${formData.name.first} ${formData.name.mid} ${formData.name.surname}`
            .replace(/\s+/g, " ")
            .trim(),
        };

        const payload = new FormData();
        Object.entries(submitData).forEach(([key, value]) => {
          if (key === "members") {
            payload.append(key, JSON.stringify(value));
          } else if (value !== null && value !== undefined) {
            payload.append(key, value);
          }
        });

        DOC_FIELDS.forEach(({ key }) => {
          if (documents[key]) payload.append(key, documents[key]);
        });

        const res = await authApi.submitAppointmentForm(
          payload,
          user?.accessToken,
          user?.tokenType,
        );
        toast.success(res.message);
        onClose();
      }
    } catch (error) {
      toast.error(error.message || "Failed to submit appointment form.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";

      if (isEditMode && initialData) {
        const raw = initialData.raw || {};

        // Split "First Mid Surname" back into parts
        const nameStr = String(raw.name || "").trim();
        const parts = nameStr.split(/\s+/).filter(Boolean);
        let nameObj = { first: "", mid: "", surname: "" };
        if (parts.length === 1)
          nameObj = { first: parts[0], mid: "", surname: "" };
        else if (parts.length === 2)
          nameObj = { first: parts[0], mid: "", surname: parts[1] };
        else if (parts.length >= 3)
          nameObj = {
            first: parts[0],
            mid: parts.slice(1, -1).join(" "),
            surname: parts[parts.length - 1],
          };

        // Parse members array
        let parsedMembers = Array(4).fill({
          name: "",
          relation: "",
          dob: "",
          mobile: "",
          occupation: "",
        });
        try {
          let m = raw.members;
          if (typeof m === "string" && m.trim()) {
            const p = JSON.parse(m);
            m = typeof p === "string" ? JSON.parse(p) : p;
          }
          if (Array.isArray(m)) {
            parsedMembers = [...m, ...Array(Math.max(0, 4 - m.length)).fill({})]
              .slice(0, 4)
              .map((mem) => ({
                name: mem?.name || "",
                relation: mem?.relation || "",
                dob: mem?.dob || "",
                mobile: mem?.mobile || "",
                occupation: mem?.occupation || "",
              }));
          }
        } catch (_) {}

        const codeId = raw.company_code || "";
        setSelectedCompanyId(codeId);

        const populated = {
          photo: null,
          emp_code: raw.emp_code || "",
          joining_date: raw.joining_date || getTodayDate(),
          department: raw.department || "",
          designation: raw.designation || "",
          manager_name: raw.manager_name || "",
          salary: String(raw.salary || ""),
          mobile_number: raw.mobile_number || "",
          emp_whatsapp_no: raw.emp_whatsapp_no || "",
          punching_no: String(raw.punching_no || ""),
          name: nameObj,
          email: raw.email || "",
          address: raw.address || "",
          village: raw.village || "",
          taluka: raw.taluka || "",
          district: raw.district || "",
          dob: raw.dob || "",
          birth_place: raw.birth_place || "",
          gender: raw.gender || "",
          cast: raw.cast || "",
          marital_status: raw.marital_status || "",
          blood_group: raw.blood_group || "",
          reference_name: raw.reference_name || "",
          reference_mobile_no: raw.reference_mobile_no || "",
          aadhar_card_no: raw.aadhar_card_no || "",
          bank_name: raw.bank_name || "",
          pan_card_no: raw.pan_card_no || "",
          bank_ifsc_code: raw.bank_ifsc_code || "",
          education: raw.education || "",
          bank_account_no: raw.bank_account_no || "",
          company_code: codeId,
          unit: raw.unit || raw.unit_name || "",
          emp_signature: raw.emp_signature || "",
          members: parsedMembers,
        };

        setFormData(populated);
        originalSnapshot.current = {
          ...populated,
          nameStr,
          membersJson: JSON.stringify(parsedMembers),
        };

        setPhotoPreview(initialData.photo || "");
        setDocuments({
          aadhar_card: null,
          pan_card: null,
          cheque: null,
          account_book: null,
        });
        setDocPreviews({
          aadhar_card: "",
          pan_card: "",
          cheque: "",
          account_book: "",
        });
        setExistingDocs({
          adhar_image: initialData.documents?.adhar_image || null,
          pan_image: initialData.documents?.pan_image || null,
          check_image: initialData.documents?.check_image || null,
        });
      } else {
        const newCompanyId = isAllCompanies ? "" : companyId;
        setSelectedCompanyId(newCompanyId);
        setFormData((prev) => ({
          ...prev,
          company_code: newCompanyId,
          unit: "",
        }));
      }
    } else {
      document.body.style.overflow = "";
      setStep(1);
      setErrors({});
      setDocErrors({});
    }
    return () => {
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    const nextValue =
      name === "pan_card_no" || name === "bank_ifsc_code"
        ? value.toUpperCase()
        : value;
    setFormData((prev) => ({ ...prev, [name]: nextValue }));
    clearError(name);
  };

  const handleCompanyChange = (e) => {
    const newCompanyId = e.target.value;
    setSelectedCompanyId(newCompanyId);
    setFormData((prev) => ({ ...prev, company_code: newCompanyId, unit: "" }));
    clearError("company_code");
    clearError("unit");
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFormData((prev) => ({ ...prev, photo: file }));
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleNameChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, name: { ...prev.name, [name]: value } }));
    clearError(`name.${name}`);
  };

  const handleFamilyChange = (index, field, value) => {
    const updatedFamily = [...formData.members];
    updatedFamily[index] = { ...updatedFamily[index], [field]: value };
    setFormData((prev) => ({ ...prev, members: updatedFamily }));
  };

  const handleDocChange = (key, e) => {
    const file = e.target.files[0];
    if (!file) return;
    setDocuments((prev) => ({ ...prev, [key]: file }));
    setDocErrors((prev) => {
      const n = { ...prev };
      delete n[key];
      return n;
    });
    const reader = new FileReader();
    reader.onloadend = () =>
      setDocPreviews((prev) => ({ ...prev, [key]: reader.result }));
    reader.readAsDataURL(file);
  };

  const handleDocRemove = (key) => {
    setDocuments((prev) => ({ ...prev, [key]: null }));
    setDocPreviews((prev) => ({ ...prev, [key]: "" }));
  };

  const uploadedCount = DOC_FIELDS.filter(
    ({ key }) => documents[key] || existingDocs[key],
  ).length;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm overflow-y-auto z-[1001] p-4 text-[13px]">
      <div className="relative mx-auto my-4 w-full max-w-[850px] bg-white shadow-2xl rounded-xl overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white">
          {isEditMode ? (
            <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2.5 py-1 rounded-lg">
              Editing Appointment #{initialData?.id}
            </span>
          ) : (
            <span />
          )}
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-500 hover:text-white text-xs font-semibold transition"
          >
            <X size={13} />
            Close
          </button>
        </div>

        {/* ─── STEP 1: Form ─── */}
        {step === 1 && (
          <div className="p-8">
            <div className="border border-dotted border-gray-600 p-6">
              <div className="text-center mb-0">
                <h1 className="inline-block text-xl font-black tracking-widest uppercase">
                  APPOINTMENT FORM
                </h1>
              </div>
              <div className="border-t-2 border-black mt-2 mb-6" />

              <div className="grid grid-cols-12 gap-8 items-start">
                {/* Photo */}
                <div className="col-span-5 flex flex-col items-center">
                  <label className="cursor-pointer group relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoChange}
                      className="hidden"
                    />
                    <div className="w-48 h-56 border border-gray-400 flex items-center justify-center bg-gray-50 overflow-hidden">
                      {photoPreview ? (
                        <img
                          src={photoPreview}
                          alt="Profile"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center">
                          <p className="font-bold text-gray-400 group-hover:text-brand-500">
                            CLICK TO ADD PHOTO
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 text-center">
                      (Click box to change image)
                    </p>
                  </label>
                </div>

                {/* Top Right Fields */}
                <div className="col-span-7 space-y-3">
                  <RowField
                    label="Emp. Code"
                    name="emp_code"
                    value={formData.emp_code}
                    onChange={handleChange}
                  />
                  <RowField
                    label="Joining Date"
                    name="joining_date"
                    value={formData.joining_date}
                    onChange={handleChange}
                    required
                    error={errors.joining_date}
                    type="date"
                  />
                  <RowField
                    label="Department"
                    name="department"
                    value={formData.department}
                    onChange={handleChange}
                    required
                    error={errors.department}
                  />
                  <RowField
                    label="Designation"
                    name="designation"
                    value={formData.designation}
                    onChange={handleChange}
                    required
                    error={errors.designation}
                  />
                  <RowField
                    label="Manager Name"
                    name="manager_name"
                    value={formData.manager_name}
                    onChange={handleChange}
                    required
                    error={errors.manager_name}
                  />
                  <RowField
                    label="Salary"
                    name="salary"
                    value={formData.salary}
                    onChange={handleChange}
                    required
                    error={errors.salary}
                  />
                  <RowField
                    label="Emp. Mobile No"
                    name="mobile_number"
                    value={formData.mobile_number}
                    onChange={handleChange}
                    required
                    error={errors.mobile_number}
                    inputMode="numeric"
                    maxLength={10}
                  />
                  <RowField
                    label="Emp. Whatsapp No"
                    name="emp_whatsapp_no"
                    value={formData.emp_whatsapp_no}
                    onChange={handleChange}
                    required
                    error={errors.emp_whatsapp_no}
                    inputMode="numeric"
                    maxLength={10}
                  />
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {/* Punching No */}
                <div className="flex items-center gap-2">
                  <label className="font-bold w-[130px] shrink-0 text-[13px]">
                    Punching No <span className="text-red-600">*</span>
                  </label>
                  <span className="font-bold">:</span>
                  <input
                    name="punching_no"
                    value={formData.punching_no}
                    onChange={handleChange}
                    inputMode="numeric"
                    className={`border w-48 h-7 px-2 outline-none text-[13px] ${
                      errors.punching_no ? "border-red-500" : "border-gray-400"
                    }`}
                  />
                  {errors.punching_no && (
                    <p className="text-[11px] text-red-600">
                      {errors.punching_no}
                    </p>
                  )}
                </div>

                {/* Name */}
                <div className="flex items-start gap-2">
                  <label className="font-bold w-[130px] shrink-0 pt-1 text-[13px]">
                    Name <span className="text-red-600">*</span>
                  </label>
                  <span className="font-bold pt-1">:</span>
                  <div className="flex-grow grid grid-cols-3 gap-4">
                    <NameInput
                      label="(FIRST NAME)"
                      name="first"
                      value={formData.name.first}
                      onChange={handleNameChange}
                      error={errors["name.first"]}
                    />
                    <NameInput
                      label="(MID NAME)"
                      name="mid"
                      value={formData.name.mid}
                      onChange={handleNameChange}
                      error={errors["name.mid"]}
                    />
                    <NameInput
                      label="(SURNAME)"
                      name="surname"
                      value={formData.name.surname}
                      onChange={handleNameChange}
                      error={errors["name.surname"]}
                    />
                  </div>
                </div>

                <RowField
                  label="Email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  error={errors.email}
                  type="email"
                />

                <RowField
                  label="Resident Add"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  required
                  error={errors.address}
                />

                <div className="grid grid-cols-3 gap-6 w-full">
                  <InlineField
                    label="Village"
                    name="village"
                    value={formData.village}
                    onChange={handleChange}
                    error={errors.village}
                    required
                  />
                  <InlineField
                    label="Taluka"
                    name="taluka"
                    value={formData.taluka}
                    onChange={handleChange}
                    error={errors.taluka}
                    required
                  />
                  <InlineField
                    label="District"
                    name="district"
                    value={formData.district}
                    onChange={handleChange}
                    error={errors.district}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-x-12 gap-y-3">
                  <RowField
                    label="Birth Date"
                    name="dob"
                    value={formData.dob}
                    onChange={handleChange}
                    required
                    error={errors.dob}
                    type="date"
                  />
                  <RowField
                    label="Birth Place"
                    name="birth_place"
                    value={formData.birth_place}
                    onChange={handleChange}
                  />
                  <RowField
                    label="Gender"
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                  />
                  <RowField
                    label="Cast"
                    name="cast"
                    value={formData.cast}
                    onChange={handleChange}
                  />
                  <RowField
                    label="Marital Status"
                    name="marital_status"
                    value={formData.marital_status}
                    onChange={handleChange}
                  />
                  <RowField
                    label="Blood Group"
                    name="blood_group"
                    value={formData.blood_group}
                    onChange={handleChange}
                  />
                  <RowField
                    label="Reference Name"
                    name="reference_name"
                    value={formData.reference_name}
                    onChange={handleChange}
                    required
                    error={errors.reference_name}
                  />
                  <RowField
                    label="Reference Mobile"
                    name="reference_mobile_no"
                    value={formData.reference_mobile_no}
                    onChange={handleChange}
                    required
                    error={errors.reference_mobile_no}
                    inputMode="numeric"
                    maxLength={10}
                  />
                  <RowField
                    label="Aadhar Card No"
                    name="aadhar_card_no"
                    value={formData.aadhar_card_no}
                    onChange={handleChange}
                    required
                    error={errors.aadhar_card_no}
                    inputMode="numeric"
                    maxLength={12}
                  />
                  <RowField
                    label="Bank Name"
                    name="bank_name"
                    value={formData.bank_name}
                    onChange={handleChange}
                    required
                    error={errors.bank_name}
                  />
                  <RowField
                    label="PAN Card No"
                    name="pan_card_no"
                    value={formData.pan_card_no}
                    onChange={handleChange}
                    required
                    error={errors.pan_card_no}
                    maxLength={10}
                  />
                  <RowField
                    label="Bank IFSC Code"
                    name="bank_ifsc_code"
                    value={formData.bank_ifsc_code}
                    onChange={handleChange}
                    required
                    error={errors.bank_ifsc_code}
                    maxLength={11}
                  />
                  <RowField
                    label="Education"
                    name="education"
                    value={formData.education}
                    onChange={handleChange}
                  />
                  <RowField
                    label="Bank Account No"
                    name="bank_account_no"
                    value={formData.bank_account_no}
                    onChange={handleChange}
                    required
                    error={errors.bank_account_no}
                    inputMode="numeric"
                    maxLength={18}
                  />
                </div>
              </div>

              {/* Family Members Table */}
              <div className="mt-6">
                <table className="w-full border-collapse border border-black text-[13px]">
                  <thead>
                    <tr className="font-bold bg-gray-50">
                      <th className="border border-black p-1 w-12 text-center">
                        Sr No
                      </th>
                      <th className="border border-black p-1">
                        Family Members Name
                      </th>
                      <th className="border border-black p-1">Relation</th>
                      <th className="border border-black p-1">D.O.B.</th>
                      <th className="border border-black p-1">Mobile No</th>
                      <th className="border border-black p-1">Occupation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.members.map((member, index) => (
                      <tr key={index} className="h-8">
                        <td className="border border-black text-center font-bold">
                          {index + 1}
                        </td>
                        <td className="border border-black px-1">
                          <input
                            className="w-full outline-none text-[13px]"
                            value={member.name}
                            onChange={(e) =>
                              handleFamilyChange(index, "name", e.target.value)
                            }
                          />
                        </td>
                        <td className="border border-black px-1">
                          <input
                            className="w-full outline-none text-[13px]"
                            value={member.relation}
                            onChange={(e) =>
                              handleFamilyChange(
                                index,
                                "relation",
                                e.target.value,
                              )
                            }
                          />
                        </td>
                        <td className="border border-black px-1">
                          <input
                            type="date"
                            className="w-full outline-none text-[13px] bg-transparent"
                            value={member.dob}
                            onChange={(e) =>
                              handleFamilyChange(index, "dob", e.target.value)
                            }
                          />
                        </td>
                        <td className="border border-black px-1">
                          <input
                            className="w-full outline-none text-[13px]"
                            value={member.mobile}
                            onChange={(e) =>
                              handleFamilyChange(
                                index,
                                "mobile",
                                e.target.value,
                              )
                            }
                          />
                        </td>
                        <td className="border border-black px-1">
                          <input
                            className="w-full outline-none text-[13px]"
                            value={member.occupation}
                            onChange={(e) =>
                              handleFamilyChange(
                                index,
                                "occupation",
                                e.target.value,
                              )
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Signature Row */}
              <div className="mt-10 grid grid-cols-3 gap-12 font-bold text-[13px]">
                <div>
                  <p className="mb-1">Check By, Manager</p>
                  <div className="border-b border-black w-full h-8" />
                </div>
                <div className="text-center">
                  <p className="mb-1">Confirm By,</p>
                  <div className="border-b border-black w-full h-8" />
                  <p className="mt-1 font-normal">(Ketanbhai)</p>
                </div>
                <div className="text-center">
                  <p className="mb-1">Auth. By,</p>
                  <div className="border-b border-black w-full h-8" />
                  <p className="mt-1 font-normal">HR Dept</p>
                </div>
              </div>

              <div className="mt-6 flex justify-between items-end gap-10">
                <div className="flex flex-col gap-2 flex-1">
                  {isAllCompanies && (
                    <div className="flex gap-2 items-center">
                      <span className="font-bold whitespace-nowrap uppercase">
                        Company <span className="text-red-600">*</span> :
                      </span>
                      <select
                        value={selectedCompanyId}
                        onChange={handleCompanyChange}
                        className={`border-b flex-grow h-6 outline-none text-[13px] bg-transparent ${errors.company_code ? "border-red-500" : "border-black"}`}
                      >
                        <option value="">Select Company</option>
                        {COMPANY_OPTIONS.map((co) => (
                          <option key={co.id} value={co.id}>
                            {co.label}
                          </option>
                        ))}
                      </select>
                      {errors.company_code && (
                        <p className="text-[11px] text-red-600">
                          {errors.company_code}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 items-center">
                    <span className="font-bold whitespace-nowrap uppercase">
                      UNIT NAME <span className="text-red-600">*</span> :
                    </span>
                    <select
                      name="unit"
                      value={formData.unit}
                      onChange={handleChange}
                      disabled={!selectedCompanyId}
                      className={`border-b flex-grow h-6 outline-none text-[13px] bg-transparent ${errors.unit ? "border-red-500" : "border-black"} ${!selectedCompanyId ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <option value="">Select Unit</option>
                      {unitOptions.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                    {errors.unit && (
                      <p className="text-[11px] text-red-600">{errors.unit}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 items-end flex-1">
                  <span className="font-bold whitespace-nowrap uppercase">
                    Emp. Signature <span className="text-red-600">*</span> :
                  </span>
                  <input
                    name="emp_signature"
                    value={formData.emp_signature}
                    onChange={handleChange}
                    className={`border-b flex-grow h-6 outline-none text-[13px] bg-transparent ${errors.emp_signature ? "border-red-500" : "border-black"}`}
                  />
                  {errors.emp_signature && (
                    <p className="text-[11px] text-red-600">
                      {errors.emp_signature}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Step 1 Footer */}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition"
              >
                Next : Upload Documents
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 2: Documents ─── */}
        {step === 2 && (
          <form onSubmit={handleSubmit} className="p-8">
            {/* Progress header */}
            <div className="mb-7">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-bold text-gray-800">
                    Upload Documents
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Upload any documents you have — all are optional
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-brand-600 leading-none">
                    {uploadedCount}
                    <span className="text-sm text-gray-400 font-semibold">
                      {" "}
                      / 3
                    </span>
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">uploaded</p>
                </div>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full transition-all duration-500"
                  style={{ width: `${(uploadedCount / 3) * 100}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-5">
              {DOC_FIELDS.map(({ key, label }, index) => (
                <DocUpload
                  key={key}
                  index={index}
                  label={label}
                  preview={docPreviews[key]}
                  existingUrl={existingDocs[key]}
                  file={documents[key]}
                  error={docErrors[key]}
                  onChange={(e) => handleDocChange(key, e)}
                  onRemove={() => handleDocRemove(key)}
                />
              ))}
            </div>

            {/* Step 2 Footer */}
            <div className="mt-8 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition"
              >
                <ChevronLeft size={16} />
                Back
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition shadow-sm shadow-brand-600/30"
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {isEditMode ? "Updating..." : "Submitting..."}
                    </>
                  ) : (
                    <>
                      <Check size={15} />
                      {isEditMode ? "Update Appointment" : "Submit Appointment"}
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Document Upload Card ─────────────────────────────────────────────────────
const DocUpload = ({
  index,
  label,
  preview,
  existingUrl,
  file,
  error,
  onChange,
  onRemove,
}) => {
  const uploaded = Boolean(file || existingUrl);
  const displayPreview = preview || existingUrl || "";

  return (
    <div
      className={`rounded-2xl border-2 overflow-hidden transition-all duration-200 ${
        error
          ? "border-red-300 shadow-sm shadow-red-100"
          : uploaded
            ? "border-brand-300 shadow-sm shadow-brand-100"
            : "border-gray-200 hover:border-gray-300"
      }`}
    >
      {/* Card Header */}
      <div
        className={`px-4 py-3 flex items-center justify-between border-b ${
          uploaded
            ? "bg-brand-50 border-brand-100"
            : error
              ? "bg-red-50 border-red-100"
              : "bg-gray-50 border-gray-100"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
              uploaded ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-500"
            }`}
          >
            {uploaded ? <Check size={12} /> : index + 1}
          </span>
          <span className="text-sm font-bold text-gray-800">{label}</span>
        </div>
        {uploaded ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 bg-brand-100 px-2 py-0.5 rounded-full">
            <Check size={10} /> Uploaded
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-gray-400 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
            Optional
          </span>
        )}
      </div>

      {/* Upload Zone */}
      {uploaded && displayPreview ? (
        <div className="relative h-44 bg-gray-50 group">
          <img
            src={displayPreview}
            alt={label}
            className="w-full h-full object-contain p-3"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-200 flex items-center justify-center gap-2.5 opacity-0 group-hover:opacity-100">
            <label className="cursor-pointer inline-flex items-center gap-1.5 bg-white text-gray-800 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md hover:bg-gray-100 transition">
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={onChange}
                className="hidden"
              />
              <RefreshCw size={11} /> Change
            </label>
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1.5 bg-red-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md hover:bg-red-600 transition"
            >
              <Trash2 size={11} /> Remove
            </button>
          </div>
        </div>
      ) : (
        <label className="cursor-pointer block">
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={onChange}
            className="hidden"
          />
          <div
            className={`h-44 flex flex-col items-center justify-center gap-3 transition-colors ${
              error ? "bg-red-50 hover:bg-red-100" : "bg-white hover:bg-gray-50"
            }`}
          >
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                error ? "bg-red-100" : "bg-gray-100"
              }`}
            >
              <Upload
                size={22}
                className={error ? "text-red-400" : "text-gray-400"}
              />
            </div>
            <div className="text-center px-4">
              <p className="text-sm font-semibold text-gray-600">
                Click to upload
              </p>
              <p className="text-xs text-gray-400 mt-0.5">JPG, PNG or PDF</p>
            </div>
          </div>
        </label>
      )}

      {/* Card Footer */}
      <div
        className={`px-4 py-2.5 border-t ${
          error
            ? "border-red-100 bg-red-50"
            : uploaded
              ? "border-brand-100 bg-brand-50/60"
              : "border-gray-100 bg-gray-50"
        }`}
      >
        {error ? (
          <p className="text-[11px] text-red-600 font-medium flex items-center gap-1">
            <AlertCircle size={11} /> {error}
          </p>
        ) : uploaded && file ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-600 font-medium truncate">
              {file.name}
            </span>
            <span className="text-[11px] text-brand-600 font-bold flex-shrink-0">
              {formatSize(file.size)}
            </span>
          </div>
        ) : (
          <p className="text-[11px] text-gray-400">No file selected</p>
        )}
      </div>
    </div>
  );
};

// ─── Form Helpers ─────────────────────────────────────────────────────────────
const RowField = ({
  label,
  required,
  name,
  value,
  onChange,
  error,
  type = "text",
  inputMode,
  maxLength,
}) => (
  <div className="w-full">
    <div className="flex items-end gap-2 w-full">
      <label className="text-[13px] font-bold whitespace-nowrap w-[130px] shrink-0">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      <span className="font-bold">:</span>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        inputMode={inputMode}
        maxLength={maxLength}
        className={`border-b flex-grow h-5 focus:outline-none px-1 text-[13px] bg-transparent ${error ? "border-red-500" : "border-black"}`}
      />
    </div>
    {error && (
      <p className="ml-[138px] mt-1 text-[11px] text-red-600">{error}</p>
    )}
  </div>
);

const InlineField = ({ label, required, name, value, onChange, error }) => (
  <div className="min-w-0">
    <div className="flex items-end gap-2">
      <label className="font-bold whitespace-nowrap">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      <span className="font-bold">:</span>
      <input
        name={name}
        value={value}
        onChange={onChange}
        className={`border-b min-w-0 flex-1 h-5 outline-none px-1 bg-transparent text-[13px] ${error ? "border-red-500" : "border-black"}`}
      />
    </div>
    {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
  </div>
);

const NameInput = ({ label, name, value, onChange, error }) => (
  <div className="text-center">
    <input
      name={name}
      value={value}
      onChange={onChange}
      className={`w-full border-b h-7 text-[13px] focus:outline-none text-center bg-transparent uppercase ${error ? "border-red-500" : "border-black"}`}
    />
    <span className="text-[10px] text-gray-700 font-bold">{label}</span>
    {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
  </div>
);

export default AppointmentModal;
