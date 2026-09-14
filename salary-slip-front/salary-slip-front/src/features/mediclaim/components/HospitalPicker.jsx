const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const OTHER_VALUE = "__OTHER__";

/**
 * Section D control — select from the active/approved hospitals
 * (`useMediclaimLookups`'s `hospitals`), plus an "Other / Non-network
 * hospital" option that reveals a required free-text hospital-name field and
 * a required reason textarea.
 *
 * Field names on the wizard side (`nonNetworkHospitalName` / `nonNetworkReason`)
 * match `claimValidation.js`'s `validateTreatmentStep` exactly, per the
 * implementation plan's corrected Section D field names — the API layer maps
 * these onto the backend's `non_network_hospital_name` / `non_network_reason`
 * columns (confirmed against `MediclaimClaim::$fillable`).
 *
 * Fully controlled: the caller owns `hospitalId` / `isNonNetworkHospital` /
 * `nonNetworkHospitalName` / `nonNetworkReason` and receives partial patches
 * through a single `onChange(patch)` callback, so this component holds no
 * state of its own.
 */
export default function HospitalPicker({
  hospitals = [],
  loading = false,
  error = null,
  hospitalId,
  isNonNetworkHospital = false,
  nonNetworkHospitalName = "",
  nonNetworkReason = "",
  onChange,
  disabled = false,
  errors = {},
}) {
  const selectValue = isNonNetworkHospital ? OTHER_VALUE : (hospitalId || "");

  const handleSelect = (event) => {
    const next = event.target.value;
    if (next === OTHER_VALUE) {
      onChange?.({ hospitalId: "", isNonNetworkHospital: true });
    } else {
      onChange?.({ hospitalId: next, isNonNetworkHospital: false, nonNetworkHospitalName: "", nonNetworkReason: "" });
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
          Hospital<span className="text-red-500"> *</span>
        </label>
        {loading ? (
          <p className="text-xs text-gray-400">Loading hospitals…</p>
        ) : error ? (
          <p className="text-xs text-red-500">{error}</p>
        ) : (
          <select className={inputClass} value={selectValue} onChange={handleSelect} disabled={disabled}>
            <option value="">— Select hospital —</option>
            {hospitals.map((h) => (
              <option key={h.id ?? h.hospitalId} value={h.id ?? h.hospitalId}>
                {h.name}{h.city ? `, ${h.city}` : ""}
              </option>
            ))}
            <option value={OTHER_VALUE}>Other / Non-network hospital</option>
          </select>
        )}
        {errors.hospitalId && <p className="mt-1 text-xs text-red-500">{errors.hospitalId}</p>}
      </div>

      {isNonNetworkHospital && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            This hospital is not on the approved network list. Please provide its name and the reason a
            non-network hospital was used — the office reviews this during verification.
          </p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              Hospital Name<span className="text-red-500"> *</span>
            </label>
            <input
              className={inputClass}
              value={nonNetworkHospitalName}
              onChange={(e) => onChange?.({ nonNetworkHospitalName: e.target.value })}
              disabled={disabled}
              placeholder="Enter the hospital's name"
            />
            {errors.nonNetworkHospitalName && <p className="mt-1 text-xs text-red-500">{errors.nonNetworkHospitalName}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              Reason for Non-Network Hospital<span className="text-red-500"> *</span>
            </label>
            <textarea
              className={inputClass}
              rows={2}
              value={nonNetworkReason}
              onChange={(e) => onChange?.({ nonNetworkReason: e.target.value })}
              disabled={disabled}
              placeholder="e.g. emergency admission, nearest hospital at the time"
            />
            {errors.nonNetworkReason && <p className="mt-1 text-xs text-red-500">{errors.nonNetworkReason}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
