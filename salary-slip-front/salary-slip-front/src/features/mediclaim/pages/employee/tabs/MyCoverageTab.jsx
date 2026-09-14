import { useEffect, useState } from "react";
import { ShieldCheck, Users, Building2 } from "lucide-react";
import { useAuth } from "../../../../../context/AuthContext";
import { mediclaimApi } from "../../../services/mediclaimApi";
import { formatCurrencyINR, formatClaimDate } from "../../../utils/formatters";

function memberName(member) {
  return member?.fullName || member?.full_name || member?.name || "";
}

/**
 * Read-only summary of the employee's own coverage — policy name, floater
 * limit, validity, covered members summary, and network hospitals — exactly
 * what `mediclaimApi.myCoverage()` (`GET /me/coverage`) returns, rendered
 * honestly. A genuinely empty response (no active enrollment yet, or the
 * backend module not fully migrated) renders as an empty state, never a
 * fabricated policy.
 */
export default function MyCoverageTab() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, coverage: null, error: null });

  useEffect(() => {
    if (!user?.accessToken) return undefined;
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    mediclaimApi.myCoverage(user.accessToken, user.tokenType)
      .then((res) => {
        if (cancelled) return;
        setState({ loading: false, coverage: res?.data ?? null, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ loading: false, coverage: null, error: err?.message || "Failed to load your coverage." });
      });

    return () => { cancelled = true; };
  }, [user]);

  if (state.loading) {
    return <p className="py-10 text-center text-sm text-gray-400">Loading your coverage…</p>;
  }

  if (state.error) {
    return <p className="py-10 text-center text-sm text-red-500">{state.error}</p>;
  }

  const coverage = state.coverage;
  const enrollment = coverage?.enrollment;

  if (!coverage || !enrollment) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <ShieldCheck size={32} className="text-gray-300 dark:text-gray-600" />
        <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
          You don&apos;t have an active Mediclaim enrollment yet. Contact HR if you believe this is incorrect.
        </p>
      </div>
    );
  }

  const policyVersion = enrollment.policyVersion || enrollment.policy_version;
  const policy = policyVersion?.policy;
  const policyName = policy?.name;
  const validFrom = policyVersion?.effectiveFrom || policyVersion?.effective_from || enrollment.enrolledAt || enrollment.enrolled_at;
  const validTo = policyVersion?.effectiveTo || policyVersion?.effective_to || enrollment.terminatedAt || enrollment.terminated_at;
  const floater = coverage.floater || {};
  const floaterLimit = floater.limit;
  const floaterUsed = floater.used;
  const remaining = floater.remaining;
  const members = coverage.members || [];
  const hospitals = coverage.hospitals || [];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="text-base font-bold text-gray-900 dark:text-white">{policyName || "Mediclaim Policy"}</p>
            <p className="text-xs text-gray-400">{formatClaimDate(validFrom)} – {formatClaimDate(validTo)}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Floater Limit" value={formatCurrencyINR(floaterLimit)} />
          <Stat label="Used" value={floaterUsed != null ? formatCurrencyINR(floaterUsed) : "—"} />
          <Stat label="Remaining" value={remaining != null ? formatCurrencyINR(remaining) : "—"} />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <Users size={15} /> Covered Members ({members.length})
        </p>
        {members.length === 0 ? (
          <p className="text-xs text-gray-400">No covered members on file.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <span key={m.id} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                {memberName(m)} <span className="text-gray-400">· {m.relationshipType || m.relationship_type}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <Building2 size={15} /> Approved Hospitals ({hospitals.length})
        </p>
        {hospitals.length === 0 ? (
          <p className="text-xs text-gray-400">No approved hospitals listed.</p>
        ) : (
          <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
            {hospitals.map((h) => (
              <li key={h.id ?? h.name}>{h.name}{h.city ? `, ${h.city}` : ""}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{value}</p>
    </div>
  );
}
