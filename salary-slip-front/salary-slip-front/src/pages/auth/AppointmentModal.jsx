import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight,
  RefreshCw,
  AlertCircle,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import ModernDatePicker from "../../components/ModernDatePicker";
import { authApi, salaryApi, appointmentV1Api } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyUnits, COMPANY_OPTIONS } from "../../config/companyConfig";
import useIsMobile from "../../hooks/useIsMobile";
import usePhotoCapture from "../../hooks/usePhotoCapture";
import AppointmentDocumentsStep from "./AppointmentDocumentsStep";
import { PHOTO_DOCUMENT_TYPE } from "./documentTypes";
import { readAppointmentRouteState, STEP_DOCUMENTS } from "./appointmentRouteState";
import { maskAadhaar, normaliseAadhaar } from "../../utils/aadhaar";

const DOC_FIELDS = [
  { key: "adhar_image", label: "Aadhar Card" },
  { key: "pan_image", label: "PAN Card" },
  { key: "check_image", label: "Cheque" },
  { key: "account_book", label: "Bank Passbook" },
];

const getBlankFormData = (companyCode = "") => ({
  photo: null,
  emp_code: "",
  joining_date: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
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
  company_code: companyCode,
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

const MobileCard = ({ title, children, isMobile }) => {
  if (!isMobile) return <>{children}</>;
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex flex-col gap-4 shadow-sm mb-5">
      {title && (
        <div className="border-b border-gray-200 pb-2 mb-1">
          <h3 className="text-[15px] font-bold text-gray-800">{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
};

const AppointmentModal = ({
  isOpen,
  onClose,
  initialData = null,
  isPrefillFromTrial = false,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { isAllCompanies } = useCompany();
  const { companyId } = useCompany();
  const [departmentsList, setDepartmentsList] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(
    isAllCompanies ? "" : companyId,
  );

  // Depend on the credentials themselves, not the `user` object. AuthProvider
  // passes an inline object literal as its context value, so `user` is a new
  // reference on every provider render — depending on it re-fetched departments,
  // which set new state, which re-rendered, which re-fetched. In tests that mock
  // useAuth the loop is unbounded (84 fetches in 300ms of idle), and it is what
  // stopped React's act() from ever draining.
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;

  useEffect(() => {
    if (!isOpen || !accessToken) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const res = await salaryApi.getDepartments(
          accessToken,
          tokenType,
          selectedCompanyId || companyId
        );
        if (cancelled) return;
        setDepartmentsList(res?.data?.map((dept) => dept.name) || []);
      } catch {
        // Suppress expected 403s for Agents so it gracefully falls back to text input
        // without panicking the console.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, accessToken, tokenType, selectedCompanyId, companyId]);

  const getTodayDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const isEditMode = Boolean(initialData?.id) && !isPrefillFromTrial;
  // The record as it was when the modal opened, used to tell whether the
  // employee code actually changed. State rather than a ref: it is assigned
  // during the open transition, and refs must not be written during render.
  const [originalSnapshot, setOriginalSnapshot] = useState(null);

  const isMobile = useIsMobile();
  const [step, setStep] = useState(1);

  // The appointment's real database id. Step 2 is gated on this, so documents
  // can never be uploaded against an unsaved record. Seeded from initialData so
  // editing an existing appointment updates rather than creating a duplicate.
  const [savedAppointmentId, setSavedAppointmentId] = useState(
    initialData?.id && !isPrefillFromTrial ? initialData.id : null,
  );
  const [isSaving, setIsSaving] = useState(false);
  // idle | validating | creating | updating | opening
  const [savePhase, setSavePhase] = useState("idle");
  const [appointmentSummary, setAppointmentSummary] = useState({});
  // Held back from the appointment payload and uploaded as a PHOTOGRAPH
  // the record has an id. Kept on failure so it can be retried.
  const [pendingPhoto, setPendingPhoto] = useState(null);
  // The URL is an external source of truth for which appointment to restore.
  // It is read during render rather than synced in from an effect: assigning
  // route-derived state in an effect body is a cascading render, and it would
  // flash the empty create form before the restore begins. Back/Forward pushes
  // a fresh request in through the popstate handler below.
  const [routeRequest, setRouteRequest] = useState(readAppointmentRouteState);
  // idle | loading | success | error — drives the rehydration spinner.
  const [rehydrateState, setRehydrateState] = useState(
    routeRequest.appointmentId ? "loading" : "idle",
  );

  // "XXXX XXXX 9012" for a record that already has an Aadhaar on file. The full
  // number is hidden from every API response, so there is nothing to put in the
  // input; this drives the "on file" hint and lets a blank input mean
  // "unchanged" instead of "clear it".
  const [storedAadhaarMasked, setStoredAadhaarMasked] = useState("");

  // Belt and braces: if anything else moves the form to step 2 without a saved
  // record, fall back to step 1 rather than showing an upload form that cannot
  // work. Adjusting state during render avoids a cascading re-render.
  if (step === 2 && !savedAppointmentId) {
    setStep(1);
  }

  /**
   * Step state lives in the URL as well as React state so a refresh mid-flow
   * recovers instead of dropping the user back to an empty form. This is a
   * modal rather than a route page, so search params are used on whatever
   * route it was opened from — no route restructuring.
   */
  const syncRoute = (appointmentId, which) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (appointmentId) {
      url.searchParams.set("appointmentId", String(appointmentId));
      url.searchParams.set("step", which);
    } else {
      url.searchParams.delete("appointmentId");
      url.searchParams.delete("step");
    }
    window.history.replaceState({}, "", url);
  };

  /**
   * Browser Back/Forward. syncRoute uses replaceState, so popstate only fires
   * for real history moves — each one re-reads the URL and asks for that record.
   * A fresh object is pushed even when the id is unchanged, so returning to the
   * same appointment still re-fetches rather than trusting stale state.
   */
  useEffect(() => {
    if (!isOpen) return undefined;

    const onPop = () => {
      const next = readAppointmentRouteState();
      setRouteRequest(next);
      setRehydrateState(next.appointmentId ? "loading" : "idle");
      if (!next.appointmentId) setStep(1);
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [isOpen]);

  /**
   * Restore the workflow from ?appointmentId=&step= so a refresh mid-flow does
   * not drop the user back onto an empty create form. Never creates a record —
   * it only ever loads an existing one.
   */
  useEffect(() => {
    if (!isOpen || !routeRequest.appointmentId) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const res = await appointmentV1Api.get(
          routeRequest.appointmentId,
          accessToken,
          tokenType,
        );
        if (cancelled) return;

        const record = res?.data?.appointment;
        if (!record?.id) throw new Error("Appointment not found.");

        setSavedAppointmentId(record.id);
        // Restoring mid-flow: the record's Aadhaar is on file even though the
        // form cannot show it, so a blank input must not read as "clear it".
        setStoredAadhaarMasked(record.aadhaar_masked || "");
        setAppointmentSummary({
          appointmentNumber: res?.data?.appointmentNumber,
          name: record.name,
          aadhaarMasked: record.aadhaar_masked,
          company: record.company_code,
          unit: record.unit,
        });
        setRehydrateState("success");
        // Documents only open once the record actually loaded.
        setStep(routeRequest.step === STEP_DOCUMENTS ? 2 : 1);
      } catch (err) {
        if (cancelled) return;

        setRehydrateState("error");
        // Do not silently fall back to create mode — that is how duplicates get
        // made. Clear the bad params and stay on step 1.
        syncRoute(null);
        setStep(1);
        toast.error(err?.message || "Appointment not found.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, routeRequest, accessToken, tokenType]);

  const handleBackToDetails = () => {
    setStep(1);
    syncRoute(savedAppointmentId, "details");
    window.scrollTo(0, 0);
  };

  const handleAppointmentCompleted = () => {
    syncRoute(null);
    if (onSuccess) onSuccess();
    else onClose();
  };

  /**
   * Uploads the profile photo as a document — only ever after the appointment
   * has a real id. Resolves to whether it succeeded; the caller decides what to
   * do with the file, so this never clears state behind its back.
   *
   * The file is passed in rather than read from state: a `setPendingPhoto` in
   * the same render is not visible to this closure, and reading state here once
   * skipped the upload silently.
   */
  const uploadPhotoDocument = async (appointmentId, file) => {
    if (!(file instanceof File)) return false;
    try {
      await appointmentV1Api.uploadDocument(
        appointmentId,
        { file, documentType: PHOTO_DOCUMENT_TYPE },
        user?.accessToken,
        user?.tokenType,
      );
      return true;
    } catch {
      toast.error(
        "Appointment details were saved, but the profile photo upload failed. Retry from Upload Documents.",
      );
      return false;
    }
  };

  /** Step 2 reports a successful retry — drop the file so it is not re-sent. */
  const handlePendingPhotoUploaded = () => {
    setPendingPhoto(null);
    setFormData((prev) => ({ ...prev, photo: null }));
  };

  /** The user chose to abandon the photo. The saved appointment is untouched. */
  const handleDiscardPendingPhoto = () => {
    setPendingPhoto(null);
    setFormData((prev) => ({ ...prev, photo: null }));
    setPhotoPreview("");
  };

  const unitOptions = selectedCompanyId
    ? getCompanyUnits(selectedCompanyId)
    : [];

  const [formData, setFormData] = useState(() =>
    getBlankFormData(isAllCompanies ? "" : companyId),
  );

  // Still used by the emp-code confirmation flow and the edit-mode loader,
  // which survive the removal of the old combined submit.

  const [photoPreview, setPhotoPreview] = useState("");
  const [errors, setErrors] = useState({});
  const [showConfirmTransfer, setShowConfirmTransfer] = useState(false);
  const [checkingEmpCode, setCheckingEmpCode] = useState(false);
  const [empCodeConflict, setEmpCodeConflict] = useState(null);
  const [isFirstEmpCodeAssignment, setIsFirstEmpCodeAssignment] = useState(true);

  const requiredFields = [
    { path: "joining_date", label: "Joining Date" },
    { path: "department", label: "Department" },
    { path: "designation", label: "Designation" },
    { path: "manager_name", label: "Manager Name" },
    { path: "salary", label: "Salary" },
    { path: "mobile_number", label: "Emp. Mobile No" },
    { path: "emp_whatsapp_no", label: "Emp. Whatsapp No" },
    { path: "name.first", label: "First Name" },
    { path: "name.mid", label: "Mid Name" },
    { path: "name.surname", label: "Surname" },
    { path: "email", label: "Email" },
    { path: "address", label: "Resident Add" },
    { path: "village", label: "Village" },
    { path: "taluka", label: "Taluka" },
    { path: "district", label: "District" },
    { path: "dob", label: "Birth Date" },
    { path: "gender", label: "Gender" },
    { path: "marital_status", label: "Marital Status" },
    { path: "aadhar_card_no", label: "Aadhar Card No" },
    { path: "bank_name", label: "Bank Name" },
    { path: "pan_card_no", label: "PAN Card No" },
    { path: "bank_ifsc_code", label: "Bank IFSC Code" },
    { path: "bank_account_no", label: "Bank Account No" },
    ...(isAllCompanies ? [{ path: "company_code", label: "Company" }] : []),
    { path: "unit", label: "Unit Name" },
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
      // A record that already has an Aadhaar on file may leave the input blank —
      // the form is never given the stored number to put back, so requiring it
      // again would block every edit. The backend keeps the existing value.
      if (path === "aadhar_card_no" && storedAadhaarMasked) return;

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

  const clearError = (path) => {
    setErrors((prev) => {
      if (!prev[path]) return prev;
      const updated = { ...prev };
      delete updated[path];
      return updated;
    });
  };

  /**
   * Persist the appointment fields (no documents) and return its database id.
   *
   * Documents are uploaded separately against that id, so the backend can read
   * the Aadhaar number from the saved record instead of from form state — which
   * was blank whenever the record had not been saved yet, producing an invalid
   * S3 key and a failed upload.
   */
  const persistAppointment = async () => {
    const fullName = `${formData.name.first} ${formData.name.mid} ${formData.name.surname}`
      .replace(/\s+/g, " ")
      .trim();

    const payload = new FormData();

    if (savedAppointmentId) {
      payload.append("id", savedAppointmentId);
    }

    // Digits only, so "1234 5678 9012" reaches the backend the same way the
    // stored value does. Left as a string throughout — an Aadhaar is an
    // identifier, not a number, and leading zeros must survive.
    const aadhaarDigits = normaliseAadhaar(formData.aadhar_card_no);

    Object.entries({ ...formData, name: fullName }).forEach(([key, value]) => {
      if (DOC_FIELDS.some((d) => d.key === key) || key === "photo") return;

      if (key === "aadhar_card_no") {
        // Only send a complete number. Blank means "keep what is stored" — the
        // input is never prefilled, so posting it would wipe the record's
        // Aadhaar and orphan its documents in S3.
        if (aadhaarDigits.length === 12) payload.append(key, aadhaarDigits);
        return;
      }

      if (key === "members") {
        payload.append(key, JSON.stringify(value));
      } else if (value !== null && value !== undefined) {
        payload.append(key, value);
      }
    });

    // The photo is deliberately NOT part of this request. It is uploaded as a
    // PHOTOGRAPH document once the appointment has an id, so the two
    // operations can fail independently.

    if (savedAppointmentId) {
      const res = await authApi.updateAppointment(payload, user?.accessToken, user?.tokenType);
      return res?.user?.id ?? res?.data?.id ?? savedAppointmentId;
    }

    payload.append("type", "appointment");
    if (initialData?.addedBy) payload.append("added_by", initialData.addedBy);
    if (isPrefillFromTrial && initialData?.id) payload.append("trial_form_id", initialData.id);

    const res = await authApi.submitAppointmentForm(payload, user?.accessToken, user?.tokenType);

    return res?.data?.id ?? null;
  };

  const handleSaveAndNext = async () => {
    if (isSaving) return; // guards against a double click creating two records

    setSavePhase("validating");

    if (!validateStep1()) {
      setSavePhase("idle");
      toast.error("Please fill all required fields.");
      return;
    }

    // Assigning or changing an emp_code converts this record into a full
    // employee, so the duplicate-code confirmation has to run first. This guard
    // lived in the old combined submit; without it the confirmation dialog was
    // unreachable and a clashing code went straight through to the backend.
    const empCode = String(formData.emp_code ?? "").trim();

    if (empCode) {
      const previousEmpCode = String(originalSnapshot?.emp_code ?? "").trim();

      if (empCode !== previousEmpCode) {
        setSavePhase("idle");
        openEmpCodeConfirm(empCode, !previousEmpCode);
        return;
      }
    }

    await proceedSaveAndNext();
  };

  /**
   * The save itself, split out so the employee-code confirmation dialog can
   * resume it without re-running the guard that opened the dialog.
   */
  const proceedSaveAndNext = async () => {

    setIsSaving(true);
    const wasUpdate = Boolean(savedAppointmentId);
    setSavePhase(wasUpdate ? "updating" : "creating");

    try {
      const id = await persistAppointment();

      if (!id) {
        throw new Error("Appointment ID was not returned by the server.");
      }

      setSavedAppointmentId(id);

      // Separate operation: a photo failure must not undo the saved record. The
      // file is snapshotted here so nothing that re-renders in between can
      // change what gets sent, and it is only dropped once the upload confirms.
      const photoToUpload = formData.photo instanceof File ? formData.photo : null;
      const photoUploaded = photoToUpload
        ? await uploadPhotoDocument(id, photoToUpload)
        : false;

      // Survives into step 2 so the Retry control has something to send.
      setPendingPhoto(photoUploaded ? null : photoToUpload);

      // A freshly typed number masks from what was just saved; otherwise the
      // record keeps the mask it already had. Recorded so a further edit in this
      // same session still knows an Aadhaar is on file.
      const savedAadhaarMasked = maskAadhaar(formData.aadhar_card_no) || storedAadhaarMasked;
      setStoredAadhaarMasked(savedAadhaarMasked);

      setSavePhase("opening");
      setAppointmentSummary({
        appointmentNumber: `APT-${String(id).padStart(6, "0")}`,
        name: `${formData.name.first} ${formData.name.mid} ${formData.name.surname}`
          .replace(/\s+/g, " ")
          .trim(),
        aadhaarMasked: savedAadhaarMasked,
        company: formData.company_code,
        unit: formData.unit,
      });

      setStep(2);
      syncRoute(id, "documents");
      window.scrollTo(0, 0);
      toast.success(
        wasUpdate
          ? "Appointment details updated successfully."
          : "Appointment details saved successfully.",
      );
    } catch (error) {
      // Stay on step 1 — the documents step is useless without a saved record.
      setStep(1);
      toast.error(error?.message || "Unable to save appointment details.");
    } finally {
      setIsSaving(false);
      setSavePhase("idle");
    }
  };

  // Assigning an emp_code converts this record into a full employee, so
  // before asking "are you sure?" we check whether that code is already
  // taken — if it is, the popup shows the conflict as an error instead of a
  // Yes/No confirmation, so a duplicate emp_code never gets created.
  const openEmpCodeConfirm = async (empCode, isFirstAssignment) => {
    setEmpCodeConflict(null);
    setIsFirstEmpCodeAssignment(isFirstAssignment);
    setShowConfirmTransfer(true);
    setCheckingEmpCode(true);
    try {
      const res = await authApi.checkEmpCodeAvailability(
        empCode,
        initialData?.id,
        user?.accessToken,
        user?.tokenType,
      );
      if (res?.exists) {
        setEmpCodeConflict(res.employee);
      }
    } catch {
      // Fail open — the backend still enforces this on submit either way.
    } finally {
      setCheckingEmpCode(false);
    }
  };

  /**
   * The state a freshly opened modal should show. Pure — it returns values
   * instead of assigning them — so the open transition can apply it during
   * render rather than from an effect, which renders the previous record's
   * values and then immediately replaces them.
   */
  const buildOpenState = () => {
    if (initialData && (isEditMode || isPrefillFromTrial)) {
      const raw = initialData.raw || initialData || {};

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
      } catch {
        // ignore
      }

      const codeId = raw.company_code || "";

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
        // Never prefilled: the API only ever returns aadhaar_masked, and putting
        // "XXXX XXXX 9012" in the input would post the mask back as if it were
        // the real number. Left blank, which means "unchanged".
        aadhar_card_no: "",
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

      return {
        selectedCompanyId: codeId,
        formData: populated,
        snapshot: {
          ...populated,
          nameStr,
          membersJson: JSON.stringify(parsedMembers),
        },
        photoPreview: initialData.photo || "",
        // Only an existing appointment has an Aadhaar on file. A trial prefill
        // creates a brand-new record, so the number has to be entered again —
        // inheriting the trial row's mask would let the new appointment save
        // with no Aadhaar at all and land its documents in a fallback folder.
        aadhaarMasked: isEditMode ? raw.aadhaar_masked || "" : "",
      };
    }

    const newCompanyId = isAllCompanies ? "" : companyId;

    return {
      selectedCompanyId: newCompanyId,
      formData: getBlankFormData(newCompanyId),
      snapshot: null,
      photoPreview: "",
      aadhaarMasked: "",
    };
  };

  // Populate on open and clear on close. Assigning state during render is the
  // supported way to reset when a prop changes; doing it in an effect body
  // renders the previous record's values first and only then replaces them,
  // which is what the set-state-in-effect rule warns about.
  const [wasOpen, setWasOpen] = useState(false);

  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);

    if (isOpen) {
      const next = buildOpenState();
      setSelectedCompanyId(next.selectedCompanyId);
      setFormData(next.formData);
      setPhotoPreview(next.photoPreview);
      setOriginalSnapshot(next.snapshot);
      setStoredAadhaarMasked(next.aadhaarMasked);
    } else {
      setStep(1);
      setErrors({});
      setShowConfirmTransfer(false);
      setEmpCodeConflict(null);
      setCheckingEmpCode(false);
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

  // Camera-only capture — no gallery/file-picker path.
  const { requestCapture, cameraModal } = usePhotoCapture({
    onCapture: handlePhotoChange,
  });

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    let nextValue = value;

    if (name === "pan_card_no" || name === "bank_ifsc_code") {
      nextValue = value.toUpperCase();
    }

    const numericLimits = {
      aadhar_card_no: 12,
      mobile_number: 10,
      emp_whatsapp_no: 10,
      reference_mobile_no: 10,
      bank_account_no: 18,
      punching_no: 20,
      salary: 10,
    };

    if (Object.keys(numericLimits).includes(name)) {
      nextValue = value.replace(/\D/g, "");
      if (numericLimits[name]) {
        nextValue = nextValue.slice(0, numericLimits[name]);
      }
    }

    if (name === "pan_card_no") nextValue = nextValue.slice(0, 10);
    if (name === "bank_ifsc_code") nextValue = nextValue.slice(0, 11);

    setFormData((prev) => {
      const newData = { ...prev, [name]: nextValue };
      if (name === "salary") {
        newData.gross_salary = nextValue;
      }
      return newData;
    });
    clearError(name);
  };

  const handleCompanyChange = (e) => {
    const newCompanyId = e.target.value;
    setSelectedCompanyId(newCompanyId);
    setFormData((prev) => ({ ...prev, company_code: newCompanyId, unit: "" }));
    clearError("company_code");
    clearError("unit");
  };

  const handleNameChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, name: { ...prev.name, [name]: value } }));
    clearError(`name.${name}`);
  };

  const handleFamilyChange = (index, field, value) => {
    const updatedFamily = [...formData.members];
    let nextValue = value;
    if (field === "mobile") {
      nextValue = value.replace(/\D/g, "").slice(0, 10);
    }
    updatedFamily[index] = { ...updatedFamily[index], [field]: nextValue };
    setFormData((prev) => ({ ...prev, members: updatedFamily }));
  };

  return (
    <>
    {createPortal(
    <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm overflow-y-auto z-[1001] text-[13px] ${isMobile ? "p-0" : "p-4"}`}>
      <div className={`relative mx-auto w-full max-w-[850px] bg-white overflow-hidden ${isMobile ? "min-h-screen" : "my-4 shadow-2xl rounded-xl"}`}>
        {/* Top bar */}
        <div className="safe-top-bar flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white">
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
        {/* Restoring from ?appointmentId=… — showing an empty step 1 here would
            look like a fresh create form and invite a duplicate record. */}
        {rehydrateState === "loading" && (
          <div className="flex items-center justify-center gap-2 p-16 text-sm text-gray-500">
            <RefreshCw size={16} className="animate-spin" />
            Loading appointment…
          </div>
        )}

        {rehydrateState !== "loading" && (step === 1 || isMobile) && (
          <div className="sm:p-8 p-3">
            <div className="sm:border sm:border-dotted sm:border-gray-600 sm:p-6 bg-white sm:bg-transparent rounded-none">
              <div className="text-center mb-0">
                <h1 className="inline-block text-xl font-black tracking-widest uppercase">
                  APPOINTMENT FORM
                </h1>
              </div>
              <div className="border-t-2 border-black mt-2 mb-6" />

              <MobileCard title="Employee Details" isMobile={isMobile}>
                <div className="flex flex-col md:grid md:grid-cols-12 gap-8 items-start">
                {/* Photo */}
                <div className="md:col-span-5 flex flex-col items-center">
                  {/* The camera modal is a full-screen overlay and must NOT be
                      a child of this click target — its own clicks would bubble
                      back into requestCapture and immediately re-open it. */}
                  <div
                    className="cursor-pointer group relative"
                    onClick={requestCapture}
                  >
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
                            TAP TO TAKE PHOTO
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 text-center">
                      (Click box to take photo)
                    </p>
                  </div>
                  {cameraModal}
                </div>

                {/* Top Right Fields */}
                <div className="md:col-span-7 space-y-3 w-full">
                  <div>
                    {/* Assigning emp_code now happens from Employee Master only,
                        so this field is always locked here — kept visible
                        rather than removed since existing appointments still
                        show whichever code they already have. */}
                    <RowField
                      label="Emp. Code"
                      name="emp_code"
                      value={formData.emp_code}
                      onChange={handleChange}
                      disabled
                    />
                    <p className="text-[10px] text-gray-400 mt-1 sm:ml-[138px]">
                      Assign or change the employee code from Employee Master.
                    </p>
                  </div>
                  <RowField
                    label="Joining Date"
                    name="joining_date"
                    value={formData.joining_date}
                    onChange={handleChange}
                    required
                    error={errors.joining_date}
                    type="date"
                  />
                  {departmentsList.length > 0 ? (
                    <RowField
                      label="Department"
                      name="department"
                      value={formData.department}
                      onChange={handleChange}
                      required
                      error={errors.department}
                      type="select"
                      options={departmentsList}
                    />
                  ) : (
                    <RowField
                      label="Department"
                      name="department"
                      value={formData.department}
                      onChange={handleChange}
                      required
                      error={errors.department}
                    />
                  )}
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
              </MobileCard>

              <MobileCard title="Personal Information" isMobile={isMobile}>
                <div className="mt-6 space-y-4">
                  {/* Punching No */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                  <label className="font-bold w-full sm:w-[130px] sm:shrink-0 text-[13px]">
                    Punching No
                  </label>
                  <span className="font-bold hidden sm:inline">:</span>
                  <input
                    name="punching_no"
                    value={formData.punching_no}
                    onChange={handleChange}
                    inputMode="numeric"
                    className={`border w-full sm:w-48 h-7 px-2 outline-none text-[13px] ${
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
                <div className="flex flex-col sm:flex-row items-start gap-1 sm:gap-2">
                  <label className="font-bold w-full sm:w-[130px] sm:shrink-0 pt-1 text-[13px]">
                    Name <span className="text-red-600">*</span>
                  </label>
                  <span className="font-bold pt-1 hidden sm:inline">:</span>
                  <div className="flex-grow grid grid-cols-1 sm:grid-cols-3 gap-4">
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

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-3">
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
                    required
                    error={errors.gender}
                    type="select"
                    options={["MALE", "FEMALE", "OTHER"]}
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
                    required
                    error={errors.marital_status}
                    type="select"
                    options={["MARRIED", "UNMARRIED"]}
                  />
                  <RowField
                    label="Blood Group"
                    name="blood_group"
                    value={formData.blood_group}
                    onChange={handleChange}
                  />
                </div>
                </div>
              </MobileCard>

              <MobileCard title="Banking & Reference Details" isMobile={isMobile}>
                <div className="mt-0 sm:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-3">
                  <RowField
                    label="Reference Name"
                    name="reference_name"
                    value={formData.reference_name}
                    onChange={handleChange}
                    error={errors.reference_name}
                  />
                  <RowField
                    label="Reference Mobile"
                    name="reference_mobile_no"
                    value={formData.reference_mobile_no}
                    onChange={handleChange}
                    error={errors.reference_mobile_no}
                    inputMode="numeric"
                    maxLength={10}
                  />
                  <div>
                    <RowField
                      label="Aadhar Card No"
                      name="aadhar_card_no"
                      value={formData.aadhar_card_no}
                      onChange={handleChange}
                      required={!storedAadhaarMasked}
                      error={errors.aadhar_card_no}
                      inputMode="numeric"
                      maxLength={12}
                    />
                    {/* The stored number is never sent to the browser, so the
                        input starts empty even in edit mode. Say so, or it reads
                        as missing data. */}
                    {storedAadhaarMasked && (
                      <p className="mt-1 text-[11px] text-gray-500">
                        On file: <span className="font-semibold">{storedAadhaarMasked}</span> — leave
                        blank to keep it, or type all 12 digits to replace it.
                      </p>
                    )}
                  </div>
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
              </MobileCard>

              {/* Family Members Table */}
              <div className="mt-6 sm:overflow-visible overflow-visible pb-4">
                {isMobile ? (
                  <div className="flex flex-col gap-4">
                    <h3 className="text-base font-bold text-gray-800">Family Members</h3>
                    {formData.members.map((member, index) => (
                      <div key={index} className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex flex-col gap-3 shadow-sm">
                        <div className="font-bold text-sm text-brand-600 mb-1 flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center text-[10px]">{index + 1}</div>
                          Member
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-gray-600">Full Name</label>
                          <input
                            className="w-full transition-colors border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm h-10 focus:border-brand-500 focus:outline-none"
                            value={member.name}
                            onChange={(e) => handleFamilyChange(index, "name", e.target.value)}
                            placeholder="Name"
                          />
                        </div>
                        <div className="flex gap-3">
                          <div className="flex flex-col gap-1 flex-1">
                            <label className="text-xs font-semibold text-gray-600">Relation</label>
                            <input
                              className="w-full transition-colors border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm h-10 focus:border-brand-500 focus:outline-none"
                              value={member.relation}
                              onChange={(e) => handleFamilyChange(index, "relation", e.target.value)}
                              placeholder="e.g. Father"
                            />
                          </div>
                          <div className="flex flex-col gap-1 flex-1">
                            <label className="text-xs font-semibold text-gray-600">Date of Birth</label>
                            <ModernDatePicker
                              className="w-full transition-colors border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm h-10 focus:border-brand-500 focus:outline-none"
                              value={member.dob}
                              onChange={(e) => handleFamilyChange(index, "dob", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="flex flex-col gap-1 flex-1">
                            <label className="text-xs font-semibold text-gray-600">Mobile No</label>
                            <input
                              className="w-full transition-colors border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm h-10 focus:border-brand-500 focus:outline-none"
                              value={member.mobile}
                              onChange={(e) => handleFamilyChange(index, "mobile", e.target.value)}
                              placeholder="Mobile Number"
                              inputMode="numeric"
                            />
                          </div>
                          <div className="flex flex-col gap-1 flex-1">
                            <label className="text-xs font-semibold text-gray-600">Occupation</label>
                            <input
                              className="w-full transition-colors border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm h-10 focus:border-brand-500 focus:outline-none"
                              value={member.occupation}
                              onChange={(e) => handleFamilyChange(index, "occupation", e.target.value)}
                              placeholder="Occupation"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <table className="w-full border-collapse border border-black text-[13px] min-w-[600px]">
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
                            <ModernDatePicker
                              className="w-full outline-none text-[13px] bg-transparent min-h-0 h-6 px-1"
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
                )}
              </div>

              {/* Signature Row */}
              {!isMobile && (
                <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-12 font-bold text-[13px]">
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
              )}

              <MobileCard title="Company & Authorization" isMobile={isMobile}>
                <div className="mt-0 sm:mt-6 flex flex-col md:flex-row justify-between md:items-end gap-6 md:gap-10">
                  <div className="flex flex-col gap-4 md:gap-2 flex-1 w-full">
                  {isAllCompanies && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 w-full">
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
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 w-full">
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
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 flex-1 w-full">
                  <span className="font-bold whitespace-nowrap uppercase">
                    Emp. Signature :
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
              </MobileCard>
            </div>

            {/* Step 1 Footer */}
            {!isMobile && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveAndNext}
                  disabled={savePhase !== "idle"}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savePhase !== "idle" ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      {{
                        validating: "Validating...",
                        creating: "Saving Appointment...",
                        updating: "Saving Changes...",
                        opening: "Opening Upload Documents...",
                      }[savePhase]}
                    </>
                  ) : (
                    <>
                      {savedAppointmentId
                        ? "Save Changes & Next: Upload Documents"
                        : "Save & Next: Upload Documents"}
                      <ChevronRight size={16} />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── STEP 2: Documents ─── */}
        {/* Gated on savedAppointmentId: uploads post to
            /v1/appointments/{id}/documents, so without a real id there is
            nothing to attach them to. On mobile both steps render together, so
            the gate applies there too. */}
        {(step === 2 || isMobile) && savedAppointmentId && (
          <div className="sm:p-8 p-3">
            {/* The legacy inline document grid and its combined submit were
                removed: they posted all four documents through the appointment
                form, which required the record to already exist. Uploads now go
                one at a time to /v1/appointments/{id}/documents. */}
            <AppointmentDocumentsStep
              appointmentId={savedAppointmentId}
              summary={appointmentSummary}
              onBack={handleBackToDetails}
              onComplete={handleAppointmentCompleted}
              pendingPhoto={pendingPhoto}
              onPendingPhotoUploaded={handlePendingPhotoUploaded}
              onDiscardPendingPhoto={handleDiscardPendingPhoto}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
    )}
    {showConfirmTransfer &&
      createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1002] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            {checkingEmpCode ? (
              <div className="flex flex-col items-center py-4 gap-3">
                <span className="w-8 h-8 border-2 border-gray-200 border-t-brand-600 rounded-full animate-spin" />
                <p className="text-sm text-gray-500">Checking employee code…</p>
              </div>
            ) : empCodeConflict ? (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-red-50 text-red-500 flex items-center justify-center flex-shrink-0">
                    <AlertCircle size={20} />
                  </div>
                  <h3 className="text-base font-bold text-gray-900">
                    Employee Code Already In Use
                  </h3>
                </div>
                <p className="text-sm text-gray-600 mb-6">
                  Employee code{" "}
                  <span className="font-semibold text-gray-900">
                    {formData.emp_code}
                  </span>{" "}
                  is already assigned to{" "}
                  <span className="font-semibold text-gray-900">
                    {empCodeConflict.name}
                  </span>
                  . Please use a different employee code.
                </p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowConfirmTransfer(false)}
                    className="px-4 py-2 rounded-lg bg-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition"
                  >
                    OK
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center flex-shrink-0">
                    <AlertCircle size={20} />
                  </div>
                  <h3 className="text-base font-bold text-gray-900">
                    {isFirstEmpCodeAssignment
                      ? "Assign Employee Code?"
                      : "Change Employee Code?"}
                  </h3>
                </div>
                <p className="text-sm text-gray-600 mb-6">
                  {!isFirstEmpCodeAssignment ? (
                    <>
                      Changing the employee code to{" "}
                      <span className="font-semibold text-gray-900">
                        {formData.emp_code}
                      </span>
                      . Continue?
                    </>
                  ) : (
                    <>
                      Assigning employee code{" "}
                      <span className="font-semibold text-gray-900">
                        {formData.emp_code}
                      </span>{" "}
                      will convert this appointment into a full employee record and
                      remove it from the Appointments list. Continue?
                    </>
                  )}
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowConfirmTransfer(false)}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowConfirmTransfer(false);
                      proceedSaveAndNext();
                    }}
                    className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition"
                  >
                    {isFirstEmpCodeAssignment
                      ? "Yes, Convert to Employee"
                      : "Yes, Change Code"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
// ─── Form Helpers ─────────────────────────────────────────────────────────────

const RowField = ({
  label,
  required,
  name,
  value,
  onChange,
  error,
  type = "text",
  options = [],
  inputMode,
  maxLength,
  disabled,
}) => (
  <div className="w-full">
    <div className="flex flex-col sm:flex-row sm:items-center items-start gap-1 sm:gap-2 w-full">
      {/* htmlFor/id so the label actually names the control for screen readers. */}
      <label
        htmlFor={`appt-${name}`}
        className="text-sm font-semibold text-gray-700 sm:text-[13px] sm:font-bold sm:text-black sm:whitespace-nowrap w-full sm:w-[130px] sm:shrink-0 mb-1 sm:mb-0"
      >
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      <span className="font-bold hidden sm:inline">:</span>
      {type === "date" ? (
        <ModernDatePicker
          id={`appt-${name}`}
          name={name}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={`w-full sm:flex-grow focus:outline-none transition-colors border rounded-lg px-3 py-2 bg-gray-50 text-sm h-10 ${error ? "border-red-500 bg-red-50" : "border-gray-300 focus:border-brand-500"} sm:border-t-0 sm:border-l-0 sm:border-r-0 sm:border-b sm:rounded-none sm:px-1 sm:h-5 sm:text-[13px] ${disabled ? "bg-gray-100 cursor-not-allowed text-gray-500" : "sm:bg-transparent"} sm:border-black`}
        />
      ) : type === "select" ? (
        <select
          id={`appt-${name}`}
          name={name}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={`w-full sm:flex-grow focus:outline-none transition-colors border rounded-lg px-3 py-2 bg-gray-50 text-sm h-10 ${error ? "border-red-500 bg-red-50" : "border-gray-300 focus:border-brand-500"} sm:border-t-0 sm:border-l-0 sm:border-r-0 sm:border-b sm:rounded-none sm:px-1 sm:h-7 sm:py-0 sm:text-[13px] ${disabled ? "bg-gray-100 cursor-not-allowed text-gray-500" : "sm:bg-transparent"} sm:border-black`}
        >
          <option value="">Select {label}</option>
          {options.map((opt) => (
            <option key={opt.value || opt} value={opt.value || opt}>
              {opt.label || opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={`appt-${name}`}
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          inputMode={inputMode}
          maxLength={maxLength}
          disabled={disabled}
          className={`w-full sm:flex-grow focus:outline-none transition-colors border rounded-lg px-3 py-2 bg-gray-50 text-sm h-10 ${error ? "border-red-500 bg-red-50" : "border-gray-300 focus:border-brand-500"} sm:border-t-0 sm:border-l-0 sm:border-r-0 sm:border-b sm:rounded-none sm:px-1 sm:h-5 sm:text-[13px] ${disabled ? "bg-gray-100 cursor-not-allowed text-gray-500" : "sm:bg-transparent"} sm:border-black`}
        />
      )}
    </div>
    {error && (
      <p className="sm:ml-[138px] mt-1 text-[11px] text-red-600">{error}</p>
    )}
  </div>
);

const InlineField = ({ label, required, name, value, onChange, error }) => (
  <div className="min-w-0">
    <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-2">
      <label className="text-sm font-semibold text-gray-700 sm:text-[13px] sm:font-bold sm:text-black whitespace-nowrap mb-1 sm:mb-0">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      <span className="font-bold hidden sm:inline">:</span>
      <input
        name={name}
        value={value}
        onChange={onChange}
        className={`min-w-0 flex-1 outline-none transition-colors border rounded-lg px-3 py-2 bg-gray-50 text-sm h-10 ${error ? "border-red-500 bg-red-50" : "border-gray-300 focus:border-brand-500"} sm:border-t-0 sm:border-l-0 sm:border-r-0 sm:border-b sm:rounded-none sm:px-1 sm:h-5 sm:text-[13px] sm:bg-transparent sm:border-black`}
      />
    </div>
    {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
  </div>
);

const NameInput = ({ label, name, value, onChange, error }) => (
  <div className="text-center sm:text-center text-left">
    <input
      name={name}
      value={value}
      onChange={onChange}
      className={`w-full transition-colors border rounded-lg px-3 py-2 bg-gray-50 text-sm h-10 ${error ? "border-red-500 bg-red-50" : "border-gray-300 focus:border-brand-500"} sm:border-t-0 sm:border-l-0 sm:border-r-0 sm:border-b sm:rounded-none sm:px-1 sm:h-7 sm:text-[13px] sm:bg-transparent sm:border-black focus:outline-none sm:text-center text-left uppercase`}
    />
    <span className="text-[10px] sm:text-[10px] text-xs text-gray-500 sm:text-gray-700 font-bold block mt-1 sm:inline-block sm:mt-0">{label}</span>
    {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
  </div>
);

export default AppointmentModal;
