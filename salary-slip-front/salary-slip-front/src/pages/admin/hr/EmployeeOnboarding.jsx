import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Mail, Phone, Briefcase, CalendarClock, FileEdit } from "lucide-react";
import Badge from "../../../components/ui/Badge";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { hrApi } from "../../../utils/api";

/** Days between two dates, ignoring time-of-day. */
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function JoiningBadge({ dateStr }) {
  const days = daysUntil(dateStr);
  if (days === null) return <Badge variant="gray">No date set</Badge>;
  if (days < 0) return <Badge variant="red">{Math.abs(days)}d overdue</Badge>;
  if (days === 0) return <Badge variant="green">Joining today</Badge>;
  if (days <= 7) return <Badge variant="yellow">In {days}d</Badge>;
  return <Badge variant="gray">In {days}d</Badge>;
}

/**
 * This tab owns candidates from the moment their offer is accepted — the
 * hand-off point from the Offer tab. It reads accepted offers directly
 * (rather than candidates) because the offer record already carries
 * designation/CTC/joining date in one call, which the candidate list
 * endpoint doesn't eager-load.
 *
 * Filling the actual appointment/onboarding paperwork still happens through
 * the existing Appointments flow (KYC, documents, bank details) — this tab
 * doesn't duplicate that form, just tracks who's joining and hands off to it.
 */
export default function EmployeeOnboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState([]);

  useEffect(() => {
    if (!user?.accessToken) return;
    hrApi.getOffers(user.accessToken, user.tokenType, { status: "accepted", per_page: 100 })
      .then((res) => {
        if (!res.status) return;
        const rows = res.data?.data || res.data || [];
        rows.sort((a, b) => new Date(a.joining_date || "9999-12-31") - new Date(b.joining_date || "9999-12-31"));
        setOffers(rows);
      })
      .catch((err) => toast.error(err.message || "Failed to load onboarding list"))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Everyone whose offer was accepted in the Offers tab shows up here, sorted by joining date
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6"><SkeletonTable rows={6} /></div>
        ) : offers.length === 0 ? (
          <p className="text-center py-16 text-sm text-gray-500 dark:text-gray-400">
            No one is onboarding right now — accepted offers show up here automatically.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left px-4 py-3">Candidate</th>
                  <th className="text-left px-4 py-3">Designation</th>
                  <th className="text-left px-4 py-3">CTC (Annual)</th>
                  <th className="text-left px-4 py-3">Joining Date</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {offers.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-white">{o.candidate?.name}</p>
                      <div className="flex flex-wrap items-center gap-x-3 mt-0.5">
                        {o.candidate?.email && <span className="flex items-center gap-1 text-xs text-gray-400"><Mail size={11} /> {o.candidate.email}</span>}
                        {o.candidate?.phone && <span className="flex items-center gap-1 text-xs text-gray-400"><Phone size={11} /> {o.candidate.phone}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      <span className="flex items-center gap-1"><Briefcase size={13} /> {o.designation}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">₹{Number(o.ctc_annual || 0).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      <span className="flex items-center gap-1"><CalendarClock size={13} /> {o.joining_date || "—"}</span>
                    </td>
                    <td className="px-4 py-3"><JoiningBadge dateStr={o.joining_date} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          title="Fill appointment / onboarding form"
                          onClick={() => navigate("/admin/appointments")}
                          className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 border border-brand-100 dark:border-brand-900/40"
                        >
                          <FileEdit size={13} /> Fill Appointment Form
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
    </div>
  );
}
