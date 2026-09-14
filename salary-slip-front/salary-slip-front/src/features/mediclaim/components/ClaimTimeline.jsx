import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { formatClaimDate } from "../utils/formatters";

/**
 * Plain vertical event list for a claim's timeline — status changes,
 * who/when, description. No charting library; styled consistently with the
 * rest of the app's simple list rows (see `AssetAllocation.jsx`'s
 * Allocation History inside a `CollapsibleSection`).
 *
 * Fetches its own data from `mediclaimApi.claimTimeline(claimId, ...)`
 * given just a `claimId`, so it can be dropped into `ClaimDetailDrawer`
 * (read-only, today) and into a future review panel (F5) without either
 * parent needing to plumb timeline data through itself.
 */
export default function ClaimTimeline({ claimId }) {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, events: [], error: null });

  useEffect(() => {
    if (!claimId || !user?.accessToken) return undefined;
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    mediclaimApi.claimTimeline(claimId, user.accessToken, user.tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const events = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setState({ loading: false, events, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ loading: false, events: [], error: err?.message || "Failed to load claim timeline." });
      });

    return () => { cancelled = true; };
  }, [claimId, user]);

  if (state.loading) {
    return <p className="py-6 text-center text-xs text-gray-400">Loading timeline…</p>;
  }

  if (state.error) {
    return <p className="py-6 text-center text-xs text-red-500">{state.error}</p>;
  }

  if (state.events.length === 0) {
    return <p className="py-6 text-center text-xs text-gray-400">No timeline events yet.</p>;
  }

  return (
    <ol className="space-y-4">
      {state.events.map((event, index) => (
        <li key={event.id ?? index} className="relative pl-6">
          <span className="absolute left-0 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-500" aria-hidden="true" />
          {index < state.events.length - 1 && (
            <span className="absolute left-[6.5px] top-4 h-full w-px bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
          )}
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {event.label || event.eventType || event.event_type || "Update"}
            </p>
            <span className="flex items-center gap-1 text-[11px] text-gray-400">
              <Clock size={11} /> {formatClaimDate(event.createdAt || event.created_at)}
            </span>
          </div>
          {(event.actorName || event.actor_name || event.actor?.name) && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              by {event.actorName || event.actor_name || event.actor?.name}
            </p>
          )}
          {event.description && (
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{event.description}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
