import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarClock, Video, Phone, MapPin, AlertCircle, ExternalLink, CalendarPlus } from "lucide-react";
import { candidateApi } from "../../utils/api";
import { useCandidateAuth } from "../../context/CandidateAuthContext";

const MODE_ICON = { video: Video, phone: Phone, onsite: MapPin };
const MODE_LABEL = { video: "Video Call", phone: "Phone Call", onsite: "On-site" };

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

function icsTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function downloadIcs(interview) {
  const start = new Date(interview.scheduled_at);
  const end = new Date(start.getTime() + (interview.duration_minutes || 30) * 60000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NISS Careers//Interview//EN",
    "BEGIN:VEVENT",
    `UID:interview-${interview.id}@niss.pro`,
    `DTSTAMP:${icsTimestamp(new Date())}`,
    `DTSTART:${icsTimestamp(start)}`,
    `DTEND:${icsTimestamp(end)}`,
    `SUMMARY:${interview.round_name} — ${interview.job_title}`,
    interview.meeting_link ? `DESCRIPTION:Join: ${interview.meeting_link}` : "",
    interview.meeting_link ? `LOCATION:${interview.meeting_link}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `interview-${interview.id}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function CandidateInterviewDetail() {
  const { id } = useParams();
  const { candidate, token } = useCandidateAuth();
  const [interview, setInterview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    candidateApi.getInterview(id, token)
      .then((res) => {
        if (res.status) setInterview(res.data);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, token]);

  if (!candidate) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-nx-paper px-4 py-16 text-center sm:px-6">
        <div className="w-full max-w-md rounded-lg border border-nx-line bg-nx-surface p-8 shadow-[0_12px_28px_-18px_rgba(33,29,23,0.3)] sm:p-10">
          <h1 className="text-xl font-bold text-nx-ink">Sign in to view this interview</h1>
          <Link
            to={`/careers/login?redirect=/careers/account/interviews/${id}`}
            className="mt-6 inline-flex rounded-md bg-brand-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <div className="h-56 animate-pulse rounded-lg border border-nx-line bg-nx-surface" />
      </div>
    );
  }

  if (notFound || !interview) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-nx-surface">
          <AlertCircle size={26} className="text-nx-faint" />
        </div>
        <h2 className="mt-5 text-xl font-bold text-nx-ink">Interview not found</h2>
        <Link
          to="/careers/account/interviews"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-nx-ink px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
        >
          <ArrowLeft size={15} /> Back to My Interviews
        </Link>
      </div>
    );
  }

  const ModeIcon = MODE_ICON[interview.mode] || CalendarClock;
  const canJoin = interview.meeting_link && ["scheduled", "rescheduled"].includes(interview.status);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-nx-paper">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Link
          to="/careers/account/interviews"
          className="inline-flex items-center gap-2 text-sm font-semibold text-nx-muted transition-colors hover:text-nx-ink"
        >
          <ArrowLeft size={15} /> Back to My Interviews
        </Link>

        <div className="mt-6 rounded-lg border border-nx-line border-l-[3px] border-l-brand-500 bg-nx-surface p-7 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-brand-700">{interview.job_title}</p>
              <h1 className="mt-2 text-xl font-black tracking-[-0.01em] text-nx-ink sm:text-2xl">{interview.round_name}</h1>
              {interview.department_name && <p className="mt-1 text-sm text-nx-muted">{interview.department_name}</p>}
            </div>
            <span className={`inline-flex flex-shrink-0 items-center rounded-full border px-3 py-1 text-xs font-bold ${STATUS_STYLES[interview.status] || STATUS_STYLES.scheduled}`}>
              {STATUS_LABEL[interview.status] || interview.status}
            </span>
          </div>

          <div className="mt-6 space-y-3 border-t border-nx-line pt-6 text-sm text-nx-body">
            {interview.scheduled_at && (
              <div className="flex items-center gap-2.5">
                <CalendarClock size={16} className="text-nx-faint" />
                {new Date(interview.scheduled_at).toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" })}
                {interview.duration_minutes && <span className="text-nx-muted">· {interview.duration_minutes} min</span>}
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <ModeIcon size={16} className="text-nx-faint" />
              {MODE_LABEL[interview.mode] || interview.mode}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3 border-t border-nx-line pt-6">
            {canJoin && (
              <a
                href={interview.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
              >
                Join Interview <ExternalLink size={15} />
              </a>
            )}
            {interview.scheduled_at && ["scheduled", "rescheduled"].includes(interview.status) && (
              <button
                onClick={() => downloadIcs(interview)}
                className="inline-flex items-center gap-2 rounded-md border border-nx-line px-5 py-2.5 text-sm font-bold text-nx-body hover:border-nx-line2"
              >
                Add to Calendar <CalendarPlus size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
