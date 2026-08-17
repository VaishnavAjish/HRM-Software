import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Video, Phone, MapPin, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { candidateApi } from "../../utils/api";
import { useCandidateAuth } from "../../context/CandidateAuthContext";

const MODE_ICON = { video: Video, phone: Phone, onsite: MapPin };

const STATUS_STYLES = {
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  rescheduled: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-nx-paper text-nx-muted border-nx-line",
  no_show: "bg-nx-paper text-nx-muted border-nx-line",
};

const STATUS_LABEL = {
  scheduled: "Scheduled",
  rescheduled: "Rescheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No Show",
};

export default function CandidateInterviews() {
  const { candidate, token } = useCandidateAuth();
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    candidateApi.getInterviews(token)
      .then((res) => {
        if (res.status) setInterviews(res.data || []);
      })
      .catch((err) => toast.error(err.message || "Failed to load interviews"))
      .finally(() => setLoading(false));
  }, [token]);

  if (!candidate) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-nx-paper px-4 py-16 text-center sm:px-6">
        <div className="w-full max-w-md rounded-lg border border-nx-line bg-nx-surface p-8 shadow-[0_12px_28px_-18px_rgba(33,29,23,0.3)] sm:p-10">
          <h1 className="text-xl font-bold text-nx-ink">Sign in to view your interviews</h1>
          <Link
            to="/careers/login?redirect=/careers/account/interviews"
            className="mt-6 inline-flex rounded-md bg-brand-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-nx-paper">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-black tracking-[-0.01em] text-nx-ink">My Interviews</h1>
        <p className="mt-1 text-sm text-nx-muted">Upcoming and past interview rounds across your applications.</p>

        <div className="mt-8 space-y-3">
          {loading ? (
            [1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg border border-nx-line bg-nx-surface" />)
          ) : interviews.length === 0 ? (
            <div className="rounded-lg border border-dashed border-nx-line2 bg-nx-surface px-6 py-16 text-center">
              <CalendarClock size={28} className="mx-auto text-nx-faint" />
              <h3 className="mt-3 text-sm font-bold text-nx-ink">No interviews scheduled yet</h3>
              <p className="mt-1.5 text-sm text-nx-muted">Interview invitations will appear here once a recruiter schedules one.</p>
            </div>
          ) : (
            interviews.map((interview) => {
              const ModeIcon = MODE_ICON[interview.mode] || CalendarClock;
              return (
                <Link
                  key={interview.id}
                  to={`/careers/account/interviews/${interview.id}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-nx-line border-l-[3px] border-l-brand-500 bg-nx-surface p-5 transition-colors hover:border-nx-line2"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-nx-muted">{interview.job_title}</p>
                    <h3 className="mt-1 truncate text-base font-bold text-nx-ink">{interview.round_name}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-nx-muted">
                      {interview.scheduled_at && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock size={13} />
                          {new Date(interview.scheduled_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <ModeIcon size={13} /> {interview.mode}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${STATUS_STYLES[interview.status] || STATUS_STYLES.scheduled}`}>
                      {STATUS_LABEL[interview.status] || interview.status}
                    </span>
                    <ChevronRight size={16} className="text-nx-faint" />
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
