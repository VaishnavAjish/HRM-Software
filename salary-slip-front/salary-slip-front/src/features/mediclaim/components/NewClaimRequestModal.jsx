import { useState } from "react";
import toast from "react-hot-toast";
import Modal from "../../../components/ui/Modal";
import Button from "../../../components/ui/Button";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import MemberPicker from "./MemberPicker";
import HospitalPicker from "./HospitalPicker";
import ExpenseEditor from "./ExpenseEditor";
import DeclarationPanel from "./DeclarationPanel";
import { INITIAL_SYMPTOMS, INITIAL_SYMPTOM } from "../models/initialSymptoms";
import { EXPENSE_CATEGORIES } from "../models/expenseCategories";
import { DECLARATION_VERSION } from "../models/declarationText";
import {
  validatePatientStep,
  validateMedicalHistoryStep,
  validateTreatmentStep,
  validateExpensesStep,
  validateDeclarationStep,
} from "../utils/claimValidation";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

// Matches the treatment-type checkboxes on the paper claim form (Section D)
// and the backend's `MediclaimClaim::TREATMENT_TYPES` enum verbatim.
const TREATMENT_TYPES = [
  { value: "opd", label: "OPD" },
  { value: "hospitalization", label: "Hospitalization" },
  { value: "surgery", label: "Surgery" },
  { value: "emergency", label: "Emergency" },
  { value: "tests_only", label: "Tests Only" },
];

const EMPTY_FORM = {
  memberId: "",
  relationshipType: "",

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

/**
 * A returned-for-correction claim is edited back into this same flat form
 * shape. Same defensive camelCase/snake_case fallback pattern every other
 * Mediclaim mapper in this codebase uses, plus a `members` fallback for
 * `relationshipType` — see `SubmitClaimTab.jsx`'s retired equivalent (and
 * the backend fix in `ClaimWorkflowService::buildPatientSnapshot()`) for
 * why relying on the claim record alone was not reliable enough on its own.
 */
function mapClaimToFormData(claim, members = []) {
  if (!claim) return EMPTY_FORM;

  const memberId = claim.memberId ?? claim.member_id ?? "";
  const matchedMember = memberId ? members.find((m) => String(m.id) === String(memberId)) : null;

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
    memberId,
    relationshipType: claim.relationshipType ?? claim.relationship_type
      ?? claim.patientSnapshot?.relationshipType ?? claim.patient_snapshot?.relationship_type
      ?? matchedMember?.relationshipType ?? matchedMember?.relationship_type ?? "",

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
    treatmentType: treatmentTypeRaw ? String(treatmentTypeRaw).toLowerCase() : "",
    admissionDate: claim.admissionDate ?? claim.admission_at ?? "",
    dischargeDate: claim.dischargeDate ?? claim.discharge_at ?? "",
    isOngoing: claim.isOngoing ?? claim.is_ongoing_treatment,
    treatmentDescription: claim.treatmentDescription ?? claim.treatment_description ?? "",

    expenseLines,

    declarationAccepted: false,
    declarationVersion: "",
  };
}

function mapFormDataToClaimPayload(formData) {
  const initialSymptoms = Array.isArray(formData.initialSymptoms) ? [...formData.initialSymptoms] : [];
  const otherDetail = (formData.initialSymptomOtherDetail || "").trim();
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

function runFullValidation(formData) {
  const results = [
    validatePatientStep(formData),
    validateMedicalHistoryStep(formData),
    validateTreatmentStep(formData),
    validateExpensesStep(formData),
    validateDeclarationStep(formData),
  ];
  return results.reduce(
    (acc, r) => ({ valid: acc.valid && r.valid, errors: { ...acc.errors, ...r.errors } }),
    { valid: true, errors: {} },
  );
}

/**
 * "New Claim Request" — a single popup form, submitted once. Replaces the
 * earlier 6-step draft wizard (`SubmitClaimTab.jsx`, retired): everything
 * except documents (Sections A/B patient, C medical history, D treatment, E
 * expenses, G declaration) is captured in one pass here, and hitting Submit
 * both creates the claim AND submits it for review in the same action — the
 * employee never sees an intermediate "Draft" state. Documents (Section F)
 * are deliberately NOT part of this form: they're uploaded separately,
 * after discharge, from `ClaimDetailDrawer`'s Documents section, within a
 * 7-day window this same submission sets (`documents_due_at`) — see that
 * component and `mediclaim:remind-missing-documents` for the rest of that
 * flow.
 *
 * `editClaim` (optional): when set (a RETURNED_FOR_CORRECTION claim from
 * `MyClaimsTab`), this form pre-fills from it and resubmits the SAME claim
 * (`PUT` then `submit`) instead of creating a new one — still one popup,
 * one Submit action, no intermediate draft state exposed either way.
 *
 * The caller is responsible for mounting this component only while it
 * should be open, with a `key` derived from `editClaim`'s id (or a
 * constant for a fresh request) — see `MyClaimsTab.jsx`. That's what resets
 * this form's state between opens/targets: React remounting a component
 * with a new `key` is the standard way to do that, rather than an Effect
 * that re-syncs state from a prop on every open.
 */
export default function NewClaimRequestModal({ onClose, lookups, onSubmitted, editClaim }) {
  const { user } = useAuth();
  const [formData, setFormData] = useState(() => (editClaim ? mapClaimToFormData(editClaim, lookups?.members || []) : EMPTY_FORM));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  // If `submitClaim` fails after `createClaim`/`updateClaim` already
  // succeeded, a retry must reuse that same claim id (update + submit)
  // rather than creating a second, orphaned one — this is the one sliver of
  // "draft" state this form ever produces, and it never reaches the UI.
  const [savedClaimId, setSavedClaimId] = useState(editClaim?.id ?? editClaim?.claimId ?? null);

  const updateField = (patch) => setFormData((f) => ({ ...f, ...patch }));

  const symptoms = formData.initialSymptoms || [];
  const toggleSymptom = (key) => {
    const next = symptoms.includes(key) ? symptoms.filter((s) => s !== key) : [...symptoms, key];
    updateField({ initialSymptoms: next });
  };

  const handleSubmit = async () => {
    const result = runFullValidation(formData);
    setErrors(result.errors);
    if (!result.valid) {
      toast.error(Object.values(result.errors)[0] || "Please fix the highlighted fields before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = mapFormDataToClaimPayload(formData);
      const accessToken = user?.accessToken;
      const tokenType = user?.tokenType;

      const saveRes = savedClaimId
        ? await mediclaimApi.updateClaim(savedClaimId, payload, accessToken, tokenType)
        : await mediclaimApi.createClaim(payload, accessToken, tokenType);
      const savedId = saveRes?.data?.id ?? saveRes?.data?.claimId ?? savedClaimId;
      if (!savedId) throw new Error("Could not save the claim.");
      setSavedClaimId(savedId);

      await mediclaimApi.submitClaim(savedId, accessToken, tokenType);
      toast.success("Claim request submitted");
      onSubmitted?.();
      onClose?.();
    } catch (err) {
      toast.error(err?.message || "Failed to submit the claim request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={() => !submitting && onClose?.()}
      title={editClaim ? "Resubmit Claim Request" : "New Claim Request"}
      size="2xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">Documents are uploaded separately, after discharge.</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>{submitting ? "Submitting…" : "Submit Claim Request"}</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        <Section title="Patient">
          <MemberPicker
            members={lookups?.members || []}
            loading={lookups?.loading}
            error={lookups?.error}
            value={formData.memberId}
            onChange={(member) => updateField({
              memberId: member?.id != null ? String(member.id) : "",
              relationshipType: member?.relationshipType || member?.relationship_type || "",
            })}
            errorMessage={errors.memberId || errors.relationshipType}
          />
        </Section>

        <Section title="Medical History & Diagnosis">
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
        </Section>

        <Section title="Hospitalisation / Treatment">
          <div className="space-y-4">
            <HospitalPicker
              hospitals={lookups?.hospitals || []}
              loading={lookups?.loading}
              error={lookups?.error}
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
        </Section>

        <Section title="Claim Amount">
          <ExpenseEditor lines={formData.expenseLines} onChange={(lines) => updateField({ expenseLines: lines })} error={errors.expenseLines} />
        </Section>

        <Section title="Declaration">
          <DeclarationPanel
            accepted={formData.declarationAccepted}
            onAcceptedChange={(checked) => updateField({
              declarationAccepted: checked,
              declarationVersion: checked ? DECLARATION_VERSION : "",
            })}
          />
          {errors.declarationAccepted && <p className="mt-1 text-xs text-red-500">{errors.declarationAccepted}</p>}
        </Section>
      </div>
    </Modal>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{title}</p>
      {children}
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
