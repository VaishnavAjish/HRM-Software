import { useEffect, useState } from "react";
import { Plus, UserPlus, UserCog, UserMinus, Clock } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "../../../components/ui/Modal";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { formatClaimDate } from "../utils/formatters";

const REQUEST_TYPE = { ADD: "ADD", UPDATE: "UPDATE", REMOVE: "REMOVE" };
// SELF isn't offered here — that's the employee's own record, not a
// dependent added through this flow. Only actual covered dependents, per
// the policy rule book's Section B (Spouse/Child/Parent).
const RELATIONSHIP_OPTIONS = ["SPOUSE", "CHILD", "PARENT"];
const REQUEST_STATUS_VARIANT = { pending: "yellow", approved: "green", rejected: "red" };

// From the actual policy rule book (EMPLOYEE MEDICAL CLAIM.pdf):
// - Family floater: Rs 3,00,000 for the employee and family, on a floater basis.
// - Maximum 2 children per employee, eligible only up to 18 years of age.
// - Parents above 55 years of age are not covered.
const MAX_COVERED_CHILDREN = 2;
const CHILD_MAX_AGE_YEARS = 18;
const PARENT_MAX_AGE_YEARS = 55;

// The backend always returns the raw Eloquent attribute name — `full_name`
// — never a camelCased `name`; this normalizes every place a member's or a
// change request's proposed name is displayed or prefilled.
function memberName(member) {
  return member?.fullName || member?.full_name || member?.name || "";
}

function requestMemberName(request) {
  const proposed = request?.proposedValues || request?.proposed_values || {};
  // A "remove" request carries no proposed_values (there's nothing being
  // proposed) — its name comes only from the linked member relation the
  // backend eager-loads.
  return proposed.name || proposed.fullName || proposed.full_name
    || request?.memberName || request?.member_name
    || memberName(request?.member) || "";
}

function ageInYears(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age;
}

function countActiveChildren(members, excludingMemberId) {
  return members.filter((m) => {
    const relationship = String(m.relationshipType || m.relationship_type || "").toUpperCase();
    if (relationship !== "CHILD") return false;
    if (excludingMemberId && String(m.id) === String(excludingMemberId)) return false;
    const status = String(m.status || "").toLowerCase();
    return status === "" || status === "active" || status === "pending";
  }).length;
}

/**
 * Client-side, advisory-only eligibility check mirroring the backend's
 * authoritative `PolicyEligibilityService`/`MediclaimMemberService` rules —
 * this never blocks submission outright (HR makes the real decision), it
 * just warns the employee before they submit a request that's very likely
 * to be rejected, so they don't have to wait for HR to find out.
 */
function eligibilityWarning({ relationshipType, dateOfBirth, requestType }, members) {
  const age = ageInYears(dateOfBirth);
  if (relationshipType === "CHILD") {
    if (age !== null && age > CHILD_MAX_AGE_YEARS) {
      return `Children are eligible only up to ${CHILD_MAX_AGE_YEARS} years of age under the policy — this child is ${age}. HR is likely to reject this request.`;
    }
    if (requestType === REQUEST_TYPE.ADD) {
      const existing = countActiveChildren(members);
      if (existing >= MAX_COVERED_CHILDREN) {
        return `The policy covers a maximum of ${MAX_COVERED_CHILDREN} children per employee, and ${existing} ${existing === 1 ? "is" : "are"} already on file. HR is likely to reject this request.`;
      }
    }
  }
  if (relationshipType === "PARENT" && age !== null && age > PARENT_MAX_AGE_YEARS) {
    return `Parents above ${PARENT_MAX_AGE_YEARS} years of age are not covered under the policy — this parent is ${age}. HR is likely to reject this request.`;
  }
  return null;
}

const EMPTY_FORM = {
  requestType: REQUEST_TYPE.ADD,
  memberId: "",
  relationshipType: "SPOUSE",
  name: "",
  dateOfBirth: "",
  gender: "",
  reason: "",
};

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

/**
 * Read-only family member rows plus an add/update/remove flow. Every
 * change goes through `mediclaimApi.createMemberChangeRequest`, which the
 * backend applies immediately — no HR approval wait — via
 * `MediclaimMemberService::submitAndAutoApply()`. It's still never a direct
 * edit/PATCH against a member record from here: server-side eligibility
 * validation (max 2 children, child/parent age limits, spouse overlap)
 * always runs on every submission, and every change is recorded as a
 * `MediclaimMemberChangeRequest` row for history — shown below the member
 * list — even though nothing is left "pending."
 *
 * `members` comes from `useMediclaimLookups` (preloaded once per workspace
 * mount) — this component does not fetch its own copy of the member list.
 */
export default function FamilyMemberManager({ members = [], loading = false, error = null, onChanged }) {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = `${accessToken ?? ""}|${tokenType ?? ""}|${reloadToken}`;
  const [requestsResult, setRequestsResult] = useState({ key: null, requests: [], error: null });
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const ruleWarning = eligibilityWarning(form, members);

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    mediclaimApi.memberChangeRequests({}, accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const requests = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setRequestsResult({ key: requestKey, requests, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setRequestsResult({ key: requestKey, requests: [], error: err?.message || "Failed to load change requests." });
      });
    return () => { cancelled = true; };
  }, [accessToken, tokenType, requestKey]);

  const requestsState = {
    loading: requestsResult.key !== requestKey,
    requests: requestsResult.requests,
    error: requestsResult.error,
  };

  const loadRequests = () => setReloadToken((n) => n + 1);

  const openRequest = (requestType = REQUEST_TYPE.ADD, member = null) => {
    setForm({
      ...EMPTY_FORM,
      requestType,
      memberId: member?.id != null ? String(member.id) : "",
      relationshipType: member?.relationshipType || member?.relationship_type || "SPOUSE",
      name: memberName(member),
      dateOfBirth: member?.dateOfBirth || member?.date_of_birth || "",
      gender: member?.gender || "",
    });
    setModalOpen(true);
  };

  const submitRequest = async () => {
    if (form.requestType !== REQUEST_TYPE.REMOVE && !form.name.trim()) {
      toast.error("Member name is required");
      return;
    }
    if (form.requestType !== REQUEST_TYPE.ADD && !form.memberId) {
      toast.error("Select which member this is about");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        requestType: form.requestType,
        memberId: form.memberId || undefined,
        relationshipType: form.relationshipType,
        reason: form.reason.trim() || undefined,
        proposedValues: form.requestType === REQUEST_TYPE.REMOVE ? undefined : {
          name: form.name.trim(),
          dateOfBirth: form.dateOfBirth || undefined,
          gender: form.gender || undefined,
          relationshipType: form.relationshipType,
        },
      };
      const res = await mediclaimApi.createMemberChangeRequest(payload, user?.accessToken, user?.tokenType);
      if (res?.status !== false) {
        toast.success(
          form.requestType === REQUEST_TYPE.ADD ? "Family member added"
            : form.requestType === REQUEST_TYPE.UPDATE ? "Family member updated"
            : "Family member removed"
        );
        setModalOpen(false);
        loadRequests();
        onChanged?.();
      }
    } catch (err) {
      toast.error(err?.message || "Failed to save this change");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">Covered family members under your Mediclaim policy</p>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => openRequest(REQUEST_TYPE.ADD)}>Add Family Member</Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {loading ? (
          <div className="p-6"><SkeletonTable rows={3} /></div>
        ) : error ? (
          <p className="py-16 text-center text-sm text-red-500">{error}</p>
        ) : members.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">No covered members on file yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Relationship</th>
                  <th className="px-4 py-3 text-left">Date of Birth</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{memberName(member)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{member.relationshipType || member.relationship_type}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatClaimDate(member.dateOfBirth || member.date_of_birth)}</td>
                    <td className="px-4 py-3"><Badge variant={member.status === "active" ? "green" : "gray"}>{member.status || "—"}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button title="Update details" onClick={() => openRequest(REQUEST_TYPE.UPDATE, member)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                          <UserCog size={14} />
                        </button>
                        <button title="Remove from coverage" onClick={() => openRequest(REQUEST_TYPE.REMOVE, member)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                          <UserMinus size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Family Member History</p>
        {requestsState.loading ? (
          <SkeletonTable rows={2} />
        ) : requestsState.error ? (
          <p className="text-sm text-red-500">{requestsState.error}</p>
        ) : requestsState.requests.length === 0 ? (
          <p className="text-sm text-gray-400">No changes made yet.</p>
        ) : (
          <div className="space-y-2">
            {requestsState.requests.map((request) => (
              <div key={request.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-700">
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-100">
                    {request.requestType || request.request_type} — {requestMemberName(request) || "—"}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock size={11} /> {formatClaimDate(request.createdAt || request.created_at)}
                  </p>
                </div>
                <Badge variant={REQUEST_STATUS_VARIANT[String(request.status || "").toLowerCase()] || "gray"}>{request.status || "—"}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={form.requestType === REQUEST_TYPE.ADD ? "Add Family Member" : form.requestType === REQUEST_TYPE.UPDATE ? "Update Family Member" : "Remove Family Member"}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submitRequest} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          {form.requestType !== REQUEST_TYPE.REMOVE && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-700/30 dark:text-gray-300">
              <p className="mb-1 font-semibold text-gray-700 dark:text-gray-200">Coverage rules</p>
              <ul className="list-disc space-y-0.5 pl-4">
                <li>Maximum {MAX_COVERED_CHILDREN} children per employee, covered only up to {CHILD_MAX_AGE_YEARS} years of age.</li>
                <li>Parents above {PARENT_MAX_AGE_YEARS} years of age are not covered.</li>
                <li>Family floater limit is ₹3,00,000, shared across all covered members.</li>
              </ul>
            </div>
          )}
          <div className="flex w-fit gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-700/50">
            {Object.values(REQUEST_TYPE).map((type) => (
              <button
                key={type}
                onClick={() => setForm((f) => ({ ...f, requestType: type }))}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  form.requestType === type
                    ? "bg-white text-brand-600 shadow-sm dark:bg-gray-800 dark:text-brand-400"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                }`}
              >
                {type === REQUEST_TYPE.ADD && <UserPlus size={12} className="mr-1 inline" />}
                {type === REQUEST_TYPE.UPDATE && <UserCog size={12} className="mr-1 inline" />}
                {type === REQUEST_TYPE.REMOVE && <UserMinus size={12} className="mr-1 inline" />}
                {type.charAt(0) + type.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {form.requestType !== REQUEST_TYPE.ADD && (
            <Field label="Existing Member" required>
              <select
                className={inputClass}
                value={form.memberId}
                onChange={(e) => {
                  const member = members.find((m) => String(m.id) === e.target.value);
                  setForm((f) => ({
                    ...f,
                    memberId: e.target.value,
                    name: member ? memberName(member) : f.name,
                    relationshipType: member?.relationshipType || member?.relationship_type || f.relationshipType,
                    dateOfBirth: member?.dateOfBirth || member?.date_of_birth || f.dateOfBirth,
                    gender: member?.gender || f.gender,
                  }));
                }}
              >
                <option value="">— Select member —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{memberName(m)} ({m.relationshipType || m.relationship_type})</option>
                ))}
              </select>
            </Field>
          )}

          {form.requestType !== REQUEST_TYPE.REMOVE && (
            <>
              <Field label="Relationship" required>
                <select className={inputClass} value={form.relationshipType} onChange={(e) => setForm((f) => ({ ...f, relationshipType: e.target.value }))}>
                  {RELATIONSHIP_OPTIONS.map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
                </select>
              </Field>
              <Field label="Full Name" required>
                <input className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="As printed on Aadhaar card" />
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  ⚠ Enter the name exactly as it appears on the member's Aadhaar card. A mismatch can cause the card and claims to be rejected at the hospital.
                </p>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Date of Birth">
                  <input type="date" className={inputClass} value={form.dateOfBirth} onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))} />
                </Field>
                <Field label="Gender">
                  <select className={inputClass} value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
                    <option value="">—</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </Field>
              </div>
              {ruleWarning && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
                  {ruleWarning}
                </div>
              )}
            </>
          )}

          <Field label="Notes (optional)">
            <textarea
              rows={3}
              className={inputClass}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Any additional context for this change — kept on file for reference."
            />
          </Field>
        </div>
      </Modal>
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
