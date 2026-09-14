import { formatClaimDate } from "../utils/formatters";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

/**
 * Section B control — select-only. The employee picks from their own
 * already-on-file covered members (self/spouse/child/parent); there is
 * deliberately no free-text entry here. Requesting a new member or a
 * correction to an existing one goes through `FamilyMemberManager`'s
 * change-request flow, never through this picker — that's the whole point
 * of keeping this a plain `<select>`.
 *
 * Once a member is selected, their relationship/DOB/computed age/gender are
 * shown read-only underneath, pulled straight from the selected member row
 * rather than re-entered.
 */
function computeAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

export default function MemberPicker({ members = [], loading = false, error = null, value, onChange, disabled = false, errorMessage }) {
  const selected = members.find((m) => String(m.id) === String(value)) || null;
  const age = selected ? computeAge(selected.dateOfBirth || selected.date_of_birth) : null;

  const handleSelect = (event) => {
    const memberId = event.target.value;
    const member = members.find((m) => String(m.id) === memberId) || null;
    onChange?.(member);
  };

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
        Family Member (Patient)<span className="text-red-500"> *</span>
      </label>

      {loading ? (
        <p className="text-xs text-gray-400">Loading covered members…</p>
      ) : error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : members.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No covered members on file yet. Use the Family Members tab to request one before filing a claim.
        </p>
      ) : (
        <select className={inputClass} value={value || ""} onChange={handleSelect} disabled={disabled}>
          <option value="">— Select the patient —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fullName || m.full_name || m.name} ({m.relationshipType || m.relationship_type})
            </option>
          ))}
        </select>
      )}
      {errorMessage && <p className="mt-1 text-xs text-red-500">{errorMessage}</p>}

      {selected && (
        <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/40 sm:grid-cols-4">
          <ReadOnlyField label="Relationship" value={selected.relationshipType || selected.relationship_type} />
          <ReadOnlyField label="Date of Birth" value={formatClaimDate(selected.dateOfBirth || selected.date_of_birth)} />
          <ReadOnlyField label="Age" value={age != null ? `${age} yrs` : "—"} />
          <ReadOnlyField label="Gender" value={selected.gender} />
        </div>
      )}
    </div>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{value || "—"}</p>
    </div>
  );
}
