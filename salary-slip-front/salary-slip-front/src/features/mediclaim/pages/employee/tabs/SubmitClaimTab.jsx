import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import Button from "../../../../../components/ui/Button";
import { useAuth } from "../../../../../context/AuthContext";
import { mediclaimApi } from "../../../services/mediclaimApi";
import { useClaimWizard } from "../../../hooks/useClaimWizard";
import ClaimStepper from "../../../components/ClaimStepper";
import ClaimStatusBadge from "../../../components/ClaimStatusBadge";
import ClaimDetailDrawer from "../../../components/ClaimDetailDrawer";
import MemberPicker from "../../../components/MemberPicker";
import HospitalPicker from "../../../components/HospitalPicker";
import ExpenseEditor from "../../../components/ExpenseEditor";
import DocumentChecklist from "../../../components/DocumentChecklist";
import DeclarationPanel from "../../../components/DeclarationPanel";
import { WIZARD_STEP, WIZARD_STEPS, getWizardStepIndex } from "../../../models/wizardSteps";
import { CLAIM_STATUS } from "../../../models/claimStatus";
import { INITIAL_SYMPTOMS, INITIAL_SYMPTOM } from "../../../models/initialSymptoms";
import { EXPENSE_CATEGORIES } from "../../../models/expenseCategories";
import { DECLARATION_VERSION } from "../../../models/declarationText";
import { validateWizardStep, validateDeclarationStep } from "../../../utils/claimValidation";
import { getRequiredDocumentTypes } from "../../../utils/documentChecklistRules";
import { sumExpenseLines } from "../../../utils/expenseCalculations";
import { formatCurrencyINR, formatClaimDate } from "../../../utils/formatters";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

// Matches the treatment-type checkboxes on the actual PDF claim form
// (Section D) and `claimValidation.js`'s `TREATMENT_TYPES_REQUIRING_ADMISSION`
// list, matching the backend's enum exactly (`MediclaimClaim::TREATMENT_TYPES`)
// — the API client sends this value through unchanged, no case-mapping layer
// exists, so this must stay in sync with the backend constant verbatim.
const TREATMENT_TYPES = [
  { value: "opd", label: "OPD" },
  { value: "hospitalization", label: "Hospitalization" },
  { value: "surgery", label: "Surgery" },
  { value: "emergency", label: "Emergency" },
  { value: "tests_only", label: "Tests Only" },
];

const EDITABLE_STATUSES = [CLAIM_STATUS.DRAFT, CLAIM_STATUS.RETURNED_FOR_CORRECTION];

const DEFAULT_FORM_DATA = {
  memberId: "",
  relationshipType: "",
  memberName: "",
  memberDateOfBirth: "",
  memberGender: "",

  natureOfIllness: "",
  symptomsFirstNoticedOn: "",
  initialSymptoms: [],
  initialSymptomOtherDetail: "",
  firstConsultationDate: "",
  treatingDoctorOrHospital: "",
  isMedicoLegal: undefined,
  reportedToPolice: undefined,
  policeStationDetails: "",

  hospitalId: "",
  isNonNetworkHospital: false,
  nonNetworkHospitalName: "",
  nonNetworkReason: "",
  treatmentType: "",
  admissionDate: "",
  dischargeDate: "",
  isOngoing: undefined,
  treatmentDescription: "",

  expenseLines: EXPENSE_CATEGORIES.map((c) => ({ category: c.key, amount: "", description: "" })),

  declarationAccepted: false,
  declarationVersion: "",
};

function resolveIsNonNetwork(claim) {
  if (typeof claim.isNonNetworkHospital === "boolean") return claim.isNonNetworkHospital;
  if (typeof claim.isNetworkHospital === "boolean") return !claim.isNetworkHospital;
  if (typeof claim.is_network_hospital === "boolean") return !claim.is_network_hospital;
  return Boolean(claim.nonNetworkHospitalName || claim.non_network_hospital_name);
}

/** Best-effort read of an already-saved/returned claim back into the
 * wizard's flat, camelCase form-data shape. Every field falls back between
 * camelCase and snake_case since the backend's actual JSON serialization
 * for this not-yet-built module isn't pinned down — the same defensive
 * pattern every other Mediclaim view in this codebase already uses. */
function mapClaimToFormData(claim) {
  if (!claim) return DEFAULT_FORM_DATA;

  const expensesFromServer = Array.isArray(claim.expenses) ? claim.expenses : Array.isArray(claim.expenseLines) ? claim.expenseLines : [];
  const expenseLines = EXPENSE_CATEGORIES.map((c) => {
    const match = expensesFromServer.find((e) => e.category === c.key);
    return {
      category: c.key,
      amount: match ? String(match.claimedAmount ?? match.claimed_amount ?? match.amount ?? "") : "",
      description: match?.description || "",
    };
  });

  const treatmentTypeRaw = claim.treatmentType ?? claim.treatment_type ?? "";

  return {
    memberId: claim.memberId ?? claim.member_id ?? "",
    relationshipType: claim.relationshipType ?? claim.relationship_type ?? claim.patientSnapshot?.relationshipType ?? claim.patient_snapshot?.relationship_type ?? "",
    memberName: claim.patientName ?? claim.patientSnapshot?.name ?? claim.patient_snapshot?.name ?? "",
    memberDateOfBirth: claim.patientSnapshot?.dateOfBirth ?? claim.patient_snapshot?.date_of_birth ?? "",
    memberGender: claim.patientSnapshot?.gender ?? claim.patient_snapshot?.gender ?? "",

    natureOfIllness: claim.natureOfIllness ?? claim.nature_of_illness ?? "",
    symptomsFirstNoticedOn: claim.symptomsFirstNoticedOn ?? claim.first_symptom_date ?? "",
    initialSymptoms: claim.initialSymptoms ?? claim.initial_symptoms ?? [],
    initialSymptomOtherDetail: claim.initialSymptomOtherDetail ?? claim.initial_symptom_other_detail ?? "",
    firstConsultationDate: claim.firstConsultationDate ?? claim.first_consultation_date ?? "",
    treatingDoctorOrHospital: claim.treatingDoctorOrHospital ?? claim.treating_doctor_name ?? "",
    isMedicoLegal: claim.isMedicoLegal ?? claim.is_medico_legal_case,
    reportedToPolice: claim.reportedToPolice ?? claim.reported_to_police,
    policeStationDetails: claim.policeStationDetails ?? claim.police_station_details ?? "",

    hospitalId: claim.hospitalId ?? claim.hospital_id ?? "",
    isNonNetworkHospital: resolveIsNonNetwork(claim),
    nonNetworkHospitalName: claim.nonNetworkHospitalName ?? claim.non_network_hospital_name ?? "",
    nonNetworkReason: claim.nonNetworkReason ?? claim.non_network_reason ?? "",
    // Backend's treatment_type enum is lowercase (opd/hospitalization/surgery/
    // emergency/tests_only) and every consumer here (TREATMENT_TYPES,
    // documentChecklistRules.js, claimValidation.js) compares lowercase —
    // resuming a saved claim must not re-case this value.
    treatmentType: treatmentTypeRaw ? String(treatmentTypeRaw).toLowerCase() : "",
    admissionDate: claim.admissionDate ?? claim.admission_at ?? "",
    dischargeDate: claim.dischargeDate ?? claim.discharge_at ?? "",
    isOngoing: claim.isOngoing ?? claim.is_ongoing_treatment,
    treatmentDescription: claim.treatmentDescription ?? claim.treatment_description ?? "",

    expenseLines,

    declarationAccepted: claim.declarationAccepted ?? claim.declaration_accepted ?? false,
    declarationVersion: claim.declarationVersion ?? claim.declaration_version ?? "",
  };
}

/**
 * The inverse of `mapClaimToFormData` — builds the actual backend payload
 * (`ValidatesClaimPayload::claimRules()`'s field set) from the wizard's
 * local, UI-convenience `formData` shape. This is NOT just a camelCase →
 * snake_case rename: several fields differ in NAME (`symptomsFirstNoticedOn`
 * → `first_symptom_date`, `treatingDoctorOrHospital` → `treating_doctor_name`,
 * `isMedicoLegal` → `is_medico_legal_case`, `admissionDate`/`dischargeDate`
 * → `admission_at`/`discharge_at`, `expenseLines` → `expenses`), and
 * `isNonNetworkHospital` is the outright INVERSE of the backend's
 * `is_network_hospital` — a bare key-casing middleware cannot fix either of
 * those, so this mapping has to be explicit and exhaustive. Member/patient
 * identity fields (`relationshipType`, `memberName`, `memberDateOfBirth`,
 * `memberGender`) are deliberately NOT sent — `patient_snapshot` is derived
 * server-side from `member_id`, never client-supplied (see
 * `ValidatesClaimPayload`'s own docblock).
 */
function mapFormDataToClaimPayload(formData) {
  const initialSymptoms = Array.isArray(formData.initialSymptoms) ? [...formData.initialSymptoms] : [];
  const otherDetail = (formData.initialSymptomOtherDetail || "").trim();
  // No dedicated backend column for the "Other" free-text detail — folded
  // into the initial_symptoms array itself rather than dropped silently.
  const symptomsForPayload = otherDetail
    ? [...initialSymptoms.filter((s) => s !== INITIAL_SYMPTOM.OTHER), `${INITIAL_SYMPTOM.OTHER}: ${otherDetail}`]
    : initialSymptoms;

  const expenses = (formData.expenseLines || [])
    .filter((line) => line.amount !== "" && line.amount != null)
    .map((line) => ({
      category: line.category,
      claimed_amount: Number(line.amount) || 0,
      description: line.description || undefined,
    }));

  return {
    member_id: formData.memberId || undefined,
    hospital_id: formData.isNonNetworkHospital ? undefined : (formData.hospitalId || undefined),
    nature_of_illness: formData.natureOfIllness || undefined,
    first_symptom_date: formData.symptomsFirstNoticedOn || undefined,
    initial_symptoms: symptomsForPayload,
    first_consultation_date: formData.firstConsultationDate || undefined,
    treating_doctor_name: formData.treatingDoctorOrHospital || undefined,
    is_medico_legal_case: Boolean(formData.isMedicoLegal),
    reported_to_police: formData.isMedicoLegal ? Boolean(formData.reportedToPolice) : undefined,
    police_station_details: formData.policeStationDetails || undefined,
    treatment_type: formData.treatmentType || undefined,
    is_network_hospital: !formData.isNonNetworkHospital,
    non_network_hospital_name: formData.isNonNetworkHospital ? (formData.nonNetworkHospitalName || undefined) : undefined,
    non_network_reason: formData.isNonNetworkHospital ? (formData.nonNetworkReason || undefined) : undefined,
    admission_at: formData.admissionDate || undefined,
    discharge_at: formData.dischargeDate || undefined,
    is_ongoing_treatment: Boolean(formData.isOngoing),
    treatment_description: formData.treatmentDescription || undefined,
    expenses,
    declaration_accepted: Boolean(formData.declarationAccepted),
    declaration_version: formData.declarationVersion || undefined,
  };
}

/**
 * The claim submission wizard's host tab. Composes the 6 interactive steps
 * over Sections A-G of the paper claim form (F4), using `useClaimWizard` for
 * step/claim-id state + persistence and `ClaimStepper` for the progress UI.
 *
 * `lookups` (hospitals/members) comes from the workspace's shared
 * `useMediclaimLookups` instance — this tab fetches no lookup data of its
 * own, only the claim itself and its documents.
 */
export default function SubmitClaimTab({ lookups }) {
  const { user } = useAuth();
  const [, setSearchParams] = useSearchParams();
  const wizard = useClaimWizard();

  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [stepErrors, setStepErrors] = useState({});
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const hydratedFor = useRef(null);

  useEffect(() => {
    if (!wizard.claim) return;
    const id = wizard.claim.id ?? wizard.claimId;
    if (!id || hydratedFor.current === String(id)) return;
    setFormData(mapClaimToFormData(wizard.claim));
    hydratedFor.current = String(id);
  }, [wizard.claim, wizard.claimId]);

  const loadDocuments = useCallback(() => {
    if (!wizard.claimId || !user?.accessToken) {
      setUploadedDocs([]);
      return;
    }
    mediclaimApi.claimDocuments(wizard.claimId, user.accessToken, user.tokenType)
      .then((res) => {
        const payload = res?.data;
        const docs = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setUploadedDocs(docs);
      })
      .catch(() => setUploadedDocs([]));
  }, [wizard.claimId, user]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const updateField = (patch) => setFormData((f) => ({ ...f, ...patch }));

  const isReviewMode = Boolean(wizard.claim) && !EDITABLE_STATUSES.includes(wizard.claim.status);

  const closeReview = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "claims");
      next.delete("claimId");
      next.delete("wizardStep");
      return next;
    });
  };

  if (wizard.loading) {
    return <p className="py-16 text-center text-sm text-gray-400">Loading claim…</p>;
  }

  if (wizard.error && !wizard.claim) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-red-500">{wizard.error}</p>
        <Button variant="secondary" onClick={wizard.startNewClaim}>Start a New Claim</Button>
      </div>
    );
  }

  if (isReviewMode) {
    const claimNumber = wizard.claim.claimNumber || wizard.claim.claim_number || "This claim";
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{claimNumber} has already been submitted</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Viewing in read-only mode below. Use My Claims to browse everything you've filed.</p>
          </div>
          <ClaimStatusBadge status={wizard.claim.status} />
        </div>

        <ClaimDetailDrawer isOpen={true} claimId={wizard.claimId} onClose={closeReview} />

        <div className="flex justify-center">
          <Button variant="secondary" onClick={wizard.startNewClaim}>File a New Claim</Button>
        </div>
      </div>
    );
  }

  const currentIndex = getWizardStepIndex(wizard.step);
  const isFirstStep = currentIndex === 0;
  const isLastStep = wizard.step === WIZARD_STEP.DECLARATION;

  const goBack = () => {
    const prevStep = WIZARD_STEPS[currentIndex - 1]?.key;
    if (prevStep) wizard.goToStep(prevStep);
  };

  const handleSaveAndContinue = async () => {
    let dataForValidation = formData;
    let extra;
    if (wizard.step === WIZARD_STEP.DOCUMENTS) {
      extra = getRequiredDocumentTypes({ treatmentType: formData.treatmentType, isMedicoLegal: formData.isMedicoLegal });
      dataForValidation = { uploadedDocumentTypes: uploadedDocs.map((d) => d.documentType || d.document_type) };
    }

    const result = validateWizardStep(wizard.step, dataForValidation, extra);
    setStepErrors(result.errors);
    if (!result.valid) {
      toast.error(Object.values(result.errors)[0] || "Please fix the highlighted fields before continuing.");
      return;
    }

    try {
      const nextStep = WIZARD_STEPS[currentIndex + 1]?.key;
      if (wizard.step !== WIZARD_STEP.DOCUMENTS) {
        // Advancing is folded into the save itself (see saveStep's docblock)
        // so a freshly-created claim's id is never clobbered by a stale
        // goToStep closure called right after.
        await wizard.saveStep(mapFormDataToClaimPayload(formData), nextStep);
      } else if (nextStep) {
        wizard.goToStep(nextStep);
      }
    } catch (err) {
      toast.error(err?.message || "Failed to save this step.");
    }
  };

  const handleSubmitClaim = async () => {
    const result = validateDeclarationStep(formData);
    setStepErrors(result.errors);
    if (!result.valid) {
      toast.error(Object.values(result.errors)[0] || "Please accept the declaration first.");
      return;
    }
    try {
      await wizard.saveStep(mapFormDataToClaimPayload(formData));
      await wizard.submitClaim();
      toast.success("Claim submitted");
    } catch (err) {
      toast.error(err?.message || "Failed to submit this claim.");
    }
  };

  const selectedMember = (lookups?.members || []).find((m) => String(m.id) === String(formData.memberId));
  const selectedHospital = (lookups?.hospitals || []).find((h) => String(h.id ?? h.hospitalId) === String(formData.hospitalId));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {wizard.claim?.claimNumber || wizard.claim?.claim_number || "New Claim (Draft)"}
          </p>
          {wizard.claim?.status === CLAIM_STATUS.RETURNED_FOR_CORRECTION && (
            <p className="text-xs text-orange-600 dark:text-orange-400">
              Returned for correction
              {(wizard.claim.returnReason || wizard.claim.return_reason)
                ? `: ${wizard.claim.returnReason || wizard.claim.return_reason}`
                : ". Please review each step and resubmit."}
            </p>
          )}
        </div>
        {wizard.claim?.status && <ClaimStatusBadge status={wizard.claim.status} />}
      </div>

      <ClaimStepper currentStep={wizard.step} />

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {wizard.step === WIZARD_STEP.PATIENT && (
          <StepPatient
            user={user}
            formData={formData}
            errors={stepErrors}
            updateField={updateField}
            members={lookups?.members || []}
            membersLoading={lookups?.loading}
            membersError={lookups?.error}
          />
        )}
        {wizard.step === WIZARD_STEP.MEDICAL_HISTORY && (
          <StepMedicalHistory formData={formData} errors={stepErrors} updateField={updateField} />
        )}
        {wizard.step === WIZARD_STEP.TREATMENT && (
          <StepTreatment
            formData={formData}
            errors={stepErrors}
            updateField={updateField}
            hospitals={lookups?.hospitals || []}
            hospitalsLoading={lookups?.loading}
            hospitalsError={lookups?.error}
          />
        )}
        {wizard.step === WIZARD_STEP.EXPENSES && (
          <ExpenseEditor lines={formData.expenseLines} onChange={(lines) => updateField({ expenseLines: lines })} error={stepErrors.expenseLines} />
        )}
        {wizard.step === WIZARD_STEP.DOCUMENTS && (
          <div className="space-y-3">
            <DocumentChecklist
              claimId={wizard.claimId}
              claimSnapshot={{ treatmentType: formData.treatmentType, isMedicoLegal: formData.isMedicoLegal }}
              uploadedDocs={uploadedDocs}
              onUploaded={loadDocuments}
            />
            {stepErrors.documents && <p className="text-xs text-red-500">{stepErrors.documents}</p>}
          </div>
        )}
        {wizard.step === WIZARD_STEP.DECLARATION && (
          <StepDeclaration
            formData={formData}
            errors={stepErrors}
            updateField={updateField}
            selectedMember={selectedMember}
            selectedHospital={selectedHospital}
            uploadedDocsCount={uploadedDocs.length}
          />
        )}
      </div>

      {wizard.error && <p className="text-xs text-red-500">{wizard.error}</p>}

      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={goBack} disabled={isFirstStep || wizard.saving}>Back</Button>
        {isLastStep ? (
          <Button onClick={handleSubmitClaim} disabled={wizard.saving}>{wizard.saving ? "Submitting…" : "Submit Claim"}</Button>
        ) : (
          <Button onClick={handleSaveAndContinue} disabled={wizard.saving}>{wizard.saving ? "Saving…" : "Save & Continue"}</Button>
        )}
      </div>
    </div>
  );
}

function YesNoToggle({ value, onChange }) {
  return (
    <div className="flex w-fit gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-700/50">
      {[{ label: "No", val: false }, { label: "Yes", val: true }].map((opt) => (
        <button
          key={String(opt.val)}
          type="button"
          onClick={() => onChange?.(opt.val)}
          className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors ${
            value === opt.val
              ? "bg-white text-brand-600 shadow-sm dark:bg-gray-800 dark:text-brand-400"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function ReadOnly({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{value || "—"}</p>
    </div>
  );
}

function StepPatient({ user, formData, errors, updateField, members, membersLoading, membersError }) {
  const snapshot = {
    name: user?.name,
    empCode: user?.empCode || user?.emp_code,
    department: user?.department,
    designation: user?.designation,
    company: user?.companyName || user?.company_name,
    joiningDate: user?.joining_date || user?.joiningDate,
    mobile: user?.mobile_number || user?.mobile || user?.phone,
    email: user?.email,
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Section A — Employee Details (read-only)</p>
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/40 sm:grid-cols-4">
          <ReadOnly label="Name" value={snapshot.name} />
          <ReadOnly label="Employee Code" value={snapshot.empCode} />
          <ReadOnly label="Department" value={snapshot.department} />
          <ReadOnly label="Designation" value={snapshot.designation} />
          <ReadOnly label="Company" value={snapshot.company} />
          <ReadOnly label="Date of Joining" value={formatClaimDate(snapshot.joiningDate)} />
          <ReadOnly label="Mobile" value={snapshot.mobile} />
          <ReadOnly label="Email" value={snapshot.email} />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Section B — Patient</p>
        <MemberPicker
          members={members}
          loading={membersLoading}
          error={membersError}
          value={formData.memberId}
          onChange={(member) => updateField({
            memberId: member?.id != null ? String(member.id) : "",
            relationshipType: member?.relationshipType || member?.relationship_type || "",
            memberName: member?.fullName || member?.full_name || member?.name || "",
            memberDateOfBirth: member?.dateOfBirth || member?.date_of_birth || "",
            memberGender: member?.gender || "",
          })}
          errorMessage={errors.memberId || errors.relationshipType}
        />
      </div>
    </div>
  );
}

function StepMedicalHistory({ formData, errors, updateField }) {
  const symptoms = formData.initialSymptoms || [];
  const toggleSymptom = (key) => {
    const next = symptoms.includes(key) ? symptoms.filter((s) => s !== key) : [...symptoms, key];
    updateField({ initialSymptoms: next });
  };

  return (
    <div className="space-y-4">
      <Field label="Nature of Illness / Disease Diagnosed" required error={errors.natureOfIllness}>
        <textarea rows={2} className={inputClass} value={formData.natureOfIllness} onChange={(e) => updateField({ natureOfIllness: e.target.value })} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date Symptoms First Noticed" required error={errors.symptomsFirstNoticedOn}>
          <input type="date" className={inputClass} value={formData.symptomsFirstNoticedOn} onChange={(e) => updateField({ symptomsFirstNoticedOn: e.target.value })} />
        </Field>
        <Field label="Date of First Medical Consultation" required error={errors.firstConsultationDate}>
          <input type="date" className={inputClass} value={formData.firstConsultationDate} onChange={(e) => updateField({ firstConsultationDate: e.target.value })} />
        </Field>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-gray-500 dark:text-gray-400">
          Initial Symptoms<span className="text-red-500"> *</span>
        </label>
        <div className="flex flex-wrap gap-3">
          {INITIAL_SYMPTOMS.map((s) => (
            <label key={s.key} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
              <input type="checkbox" checked={symptoms.includes(s.key)} onChange={() => toggleSymptom(s.key)} />
              {s.label}
            </label>
          ))}
        </div>
        {errors.initialSymptoms && <p className="mt-1 text-xs text-red-500">{errors.initialSymptoms}</p>}
        {symptoms.includes(INITIAL_SYMPTOM.OTHER) && (
          <input
            className={`${inputClass} mt-2`}
            placeholder="Describe the other symptom"
            value={formData.initialSymptomOtherDetail}
            onChange={(e) => updateField({ initialSymptomOtherDetail: e.target.value })}
          />
        )}
        {errors.initialSymptomOtherDetail && <p className="mt-1 text-xs text-red-500">{errors.initialSymptomOtherDetail}</p>}
      </div>

      <Field label="Treating Doctor / Hospital / Clinic" required error={errors.treatingDoctorOrHospital}>
        <input className={inputClass} value={formData.treatingDoctorOrHospital} onChange={(e) => updateField({ treatingDoctorOrHospital: e.target.value })} />
      </Field>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-gray-500 dark:text-gray-400">
          Is this a medico-legal case?<span className="text-red-500"> *</span>
        </label>
        <YesNoToggle
          value={formData.isMedicoLegal}
          onChange={(v) => updateField({ isMedicoLegal: v, reportedToPolice: v ? formData.reportedToPolice : undefined })}
        />
        {errors.isMedicoLegal && <p className="mt-1 text-xs text-red-500">{errors.isMedicoLegal}</p>}
      </div>

      {formData.isMedicoLegal && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-500 dark:text-gray-400">
            Reported to police?<span className="text-red-500"> *</span>
          </label>
          <YesNoToggle value={formData.reportedToPolice} onChange={(v) => updateField({ reportedToPolice: v })} />
          {errors.reportedToPolice && <p className="mt-1 text-xs text-red-500">{errors.reportedToPolice}</p>}
          {formData.reportedToPolice && (
            <textarea
              rows={2}
              className={`${inputClass} mt-2`}
              placeholder="Police station details (optional)"
              value={formData.policeStationDetails}
              onChange={(e) => updateField({ policeStationDetails: e.target.value })}
            />
          )}
        </div>
      )}
    </div>
  );
}

function StepTreatment({ formData, errors, updateField, hospitals, hospitalsLoading, hospitalsError }) {
  return (
    <div className="space-y-4">
      <HospitalPicker
        hospitals={hospitals}
        loading={hospitalsLoading}
        error={hospitalsError}
        hospitalId={formData.hospitalId}
        isNonNetworkHospital={formData.isNonNetworkHospital}
        nonNetworkHospitalName={formData.nonNetworkHospitalName}
        nonNetworkReason={formData.nonNetworkReason}
        onChange={(patch) => updateField(patch)}
        errors={errors}
      />

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-gray-500 dark:text-gray-400">
          Type of Treatment<span className="text-red-500"> *</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {TREATMENT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => updateField({ treatmentType: t.value })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                formData.treatmentType === t.value
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-300"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {errors.treatmentType && <p className="mt-1 text-xs text-red-500">{errors.treatmentType}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date & Time of Admission" error={errors.admissionDate}>
          <input type="datetime-local" className={inputClass} value={formData.admissionDate} onChange={(e) => updateField({ admissionDate: e.target.value })} />
        </Field>
        <Field label="Date & Time of Discharge" error={errors.dischargeDate}>
          <input
            type="datetime-local"
            className={inputClass}
            value={formData.dischargeDate}
            onChange={(e) => updateField({ dischargeDate: e.target.value })}
            disabled={Boolean(formData.isOngoing)}
          />
        </Field>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-gray-500 dark:text-gray-400">
          Is treatment ongoing?<span className="text-red-500"> *</span>
        </label>
        <YesNoToggle value={formData.isOngoing} onChange={(v) => updateField({ isOngoing: v, dischargeDate: v ? "" : formData.dischargeDate })} />
        {errors.isOngoing && <p className="mt-1 text-xs text-red-500">{errors.isOngoing}</p>}
      </div>

      <Field label="Treatment Description" required error={errors.treatmentDescription}>
        <textarea rows={3} className={inputClass} value={formData.treatmentDescription} onChange={(e) => updateField({ treatmentDescription: e.target.value })} />
      </Field>
    </div>
  );
}

function ReviewField({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{value || "—"}</p>
    </div>
  );
}

function StepDeclaration({ formData, errors, updateField, selectedMember, selectedHospital, uploadedDocsCount }) {
  const total = sumExpenseLines(formData.expenseLines);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
        <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Review Summary</p>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <ReviewField
            label="Patient"
            value={selectedMember ? `${selectedMember.fullName || selectedMember.full_name || selectedMember.name} (${selectedMember.relationshipType || selectedMember.relationship_type})` : formData.memberName}
          />
          <ReviewField
            label="Hospital"
            value={formData.isNonNetworkHospital ? `${formData.nonNetworkHospitalName} (non-network)` : selectedHospital?.name}
          />
          <ReviewField label="Treatment Type" value={formData.treatmentType} />
          <ReviewField label="Nature of Illness" value={formData.natureOfIllness} />
          <ReviewField label="Your Expense Total" value={formatCurrencyINR(total)} />
          <ReviewField label="Documents Uploaded" value={String(uploadedDocsCount)} />
        </div>
      </div>

      <DeclarationPanel
        accepted={formData.declarationAccepted}
        onAcceptedChange={(checked) => updateField({
          declarationAccepted: checked,
          declarationVersion: checked ? DECLARATION_VERSION : formData.declarationVersion,
        })}
      />
      {errors.declarationAccepted && <p className="text-xs text-red-500">{errors.declarationAccepted}</p>}
    </div>
  );
}
