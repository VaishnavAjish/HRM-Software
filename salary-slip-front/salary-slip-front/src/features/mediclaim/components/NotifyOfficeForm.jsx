import { useEffect, useState } from "react";
import { BellRing, FileClock } from "lucide-react";
import toast from "react-hot-toast";
import Button from "../../../components/ui/Button";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { formatClaimDate } from "../utils/formatters";
import MemberPicker from "./MemberPicker";
import HospitalPicker from "./HospitalPicker";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

function nowForDateTimeLocal() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

const EMPTY_FORM = {
  memberId: "",
  hospitalId: "",
  isNonNetworkHospital: false,
  nonNetworkHospitalName: "",
  nonNetworkReason: "",
  treatingDoctor: "",
  plannedTreatment: "",
  expectedAdmissionDate: "",
  estimatedAmount: "",
  employeeRemarks: "",
  isEmergency: false,
  emergencyExplanation: "",
  notificationDate: nowForDateTimeLocal(),
};

/**
 * The "Notify Office" intimation form — a lighter-weight, earlier signal
 * than a full claim, filed before or right after admission so the Mediclaim
 * office knows treatment is happening. Calls `mediclaimApi.createIntimation`
 * and lists past intimations via `mediclaimApi.myIntimations` underneath.
 *
 * `members`/`hospitals` are passed in from the workspace's shared
 * `useMediclaimLookups` instance (same lists `SubmitClaimTab` uses) rather
 * than fetched again here.
 */
export default function NotifyOfficeForm({ members = [], hospitals = [], lookupsLoading = false, lookupsError = null }) {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = `${accessToken ?? ""}|${tokenType ?? ""}|${reloadToken}`;
  const [intimationsResult, setIntimationsResult] = useState({ key: null, intimations: [], error: null });

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    mediclaimApi.myIntimations({}, accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const intimations = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setIntimationsResult({ key: requestKey, intimations, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setIntimationsResult({ key: requestKey, intimations: [], error: err?.message || "Failed to load past intimations." });
      });
    return () => { cancelled = true; };
  }, [accessToken, tokenType, requestKey]);

  const intimationsState = {
    loading: intimationsResult.key !== requestKey,
    intimations: intimationsResult.intimations,
    error: intimationsResult.error,
  };

  const loadIntimations = () => setReloadToken((n) => n + 1);

  const patch = (fields) => setForm((f) => ({ ...f, ...fields }));

  const validate = () => {
    if (!form.memberId) return "Select who this notification is for.";
    if (form.isNonNetworkHospital) {
      if (!form.nonNetworkHospitalName.trim()) return "Hospital name is required.";
      if (!form.nonNetworkReason.trim()) return "Explain why a non-network hospital is being used.";
    } else if (!form.hospitalId) {
      return "Select the hospital.";
    }
    if (!form.plannedTreatment.trim()) return "Describe the planned treatment.";
    if (!form.expectedAdmissionDate) return "Expected admission / treatment date is required.";
    if (form.isEmergency && !form.emergencyExplanation.trim()) return "Explain the emergency.";
    return null;
  };

  const submit = async () => {
    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        memberId: form.memberId,
        hospitalId: form.isNonNetworkHospital ? undefined : form.hospitalId,
        isNonNetworkHospital: form.isNonNetworkHospital,
        nonNetworkHospitalName: form.isNonNetworkHospital ? form.nonNetworkHospitalName.trim() : undefined,
        nonNetworkReason: form.isNonNetworkHospital ? form.nonNetworkReason.trim() : undefined,
        treatingDoctor: form.treatingDoctor.trim() || undefined,
        plannedTreatment: form.plannedTreatment.trim(),
        expectedAdmissionDate: form.expectedAdmissionDate,
        estimatedAmount: form.estimatedAmount || undefined,
        employeeRemarks: form.employeeRemarks.trim() || undefined,
        isEmergency: form.isEmergency,
        emergencyExplanation: form.isEmergency ? form.emergencyExplanation.trim() : undefined,
        intimationDate: form.notificationDate,
      };
      const res = await mediclaimApi.createIntimation(payload, user?.accessToken, user?.tokenType);
      if (res?.status !== false) {
        toast.success("Office notified");
        setForm({ ...EMPTY_FORM, notificationDate: nowForDateTimeLocal() });
        loadIntimations();
      }
    } catch (err) {
      toast.error(err?.message || "Failed to notify the office");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <BellRing size={16} className="text-brand-600 dark:text-brand-400" />
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Notify the Mediclaim Office</p>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Let the office know before or right after admission — this is a quick heads-up, not the full claim.
          File the claim itself separately once treatment is complete, from the Submit Claim tab.
        </p>

        <MemberPicker
          members={members}
          loading={lookupsLoading}
          error={lookupsError}
          value={form.memberId}
          onChange={(member) => patch({ memberId: member?.id != null ? String(member.id) : "" })}
        />

        <HospitalPicker
          hospitals={hospitals}
          loading={lookupsLoading}
          error={lookupsError}
          hospitalId={form.hospitalId}
          isNonNetworkHospital={form.isNonNetworkHospital}
          nonNetworkHospitalName={form.nonNetworkHospitalName}
          nonNetworkReason={form.nonNetworkReason}
          onChange={(p) => patch(p)}
        />

        <Field label="Treating Doctor (optional)">
          <input className={inputClass} value={form.treatingDoctor} onChange={(e) => patch({ treatingDoctor: e.target.value })} />
        </Field>

        <Field label="Planned Treatment" required>
          <textarea
            rows={2}
            className={inputClass}
            value={form.plannedTreatment}
            onChange={(e) => patch({ plannedTreatment: e.target.value })}
            placeholder="What treatment / procedure is planned"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Expected Admission / Treatment Date" required>
            <input
              type="date"
              className={inputClass}
              value={form.expectedAdmissionDate}
              onChange={(e) => patch({ expectedAdmissionDate: e.target.value })}
            />
          </Field>
          <Field label="Estimated Amount (₹)">
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              value={form.estimatedAmount}
              onChange={(e) => patch({ estimatedAmount: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Remarks (optional)">
          <textarea
            rows={2}
            className={inputClass}
            value={form.employeeRemarks}
            onChange={(e) => patch({ employeeRemarks: e.target.value })}
          />
        </Field>

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">Is this an emergency?</label>
          <div className="flex w-fit gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-700/50">
            {[{ label: "No", value: false }, { label: "Yes", value: true }].map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => patch({ isEmergency: opt.value })}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors ${
                  form.isEmergency === opt.value
                    ? "bg-white text-brand-600 shadow-sm dark:bg-gray-800 dark:text-brand-400"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {form.isEmergency && (
          <Field label="Emergency Explanation" required>
            <textarea
              rows={2}
              className={inputClass}
              value={form.emergencyExplanation}
              onChange={(e) => patch({ emergencyExplanation: e.target.value })}
              placeholder="Briefly explain the emergency"
            />
          </Field>
        )}

        <Field label="Notification Date / Time">
          <input
            type="datetime-local"
            className={inputClass}
            value={form.notificationDate}
            onChange={(e) => patch({ notificationDate: e.target.value })}
          />
        </Field>

        <div className="flex justify-end">
          <Button onClick={submit} disabled={saving}>{saving ? "Notifying…" : "Notify Office"}</Button>
        </div>
      </div>

      <div>
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <FileClock size={15} /> Past Intimations
        </p>
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {intimationsState.loading ? (
            <div className="p-6"><SkeletonTable rows={3} /></div>
          ) : intimationsState.error ? (
            <p className="py-10 text-center text-sm text-red-500">{intimationsState.error}</p>
          ) : intimationsState.intimations.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">No office intimations recorded yet.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {intimationsState.intimations.map((intimation) => (
                <div key={intimation.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-100">{intimation.referenceNumber || intimation.reference_number}</p>
                    <p className="text-xs text-gray-400">{formatClaimDate(intimation.createdAt || intimation.created_at)}</p>
                  </div>
                  {(intimation.isEmergency ?? intimation.is_emergency) && (
                    <span className="text-xs font-semibold text-amber-600">Emergency</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
