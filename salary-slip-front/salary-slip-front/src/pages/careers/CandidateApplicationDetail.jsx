import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, FileText, Download, AlertCircle, CheckCircle2, Circle } from "lucide-react";
import { candidateApi } from "../../utils/api";
import { baseUrl } from "../../utils/url";
import { useCandidateAuth } from "../../context/CandidateAuthContext";

const STATUS_STYLES = {
  Submitted: "bg-blue-50 text-blue-700 border-blue-200",
  "Under Review": "bg-amber-50 text-amber-700 border-amber-200",
  Assessment: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Interview: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Offer: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Hired: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Closed: "bg-nx-paper text-nx-muted border-nx-line",
};

// The resume endpoint is authenticated (candidate-owned only), so it cannot
// be handed to a bare <a href> — that would load without the Authorization
// header and 401. Fetched once with the candidate token and published as a
// blob URL instead, matching the same pattern the admin candidate drawer uses.
function useResumeObjectUrl(applicationId, token) {
  const [objectUrl, setObjectUrl] = useState("");

  useEffect(() => {
    if (!applicationId || !token) return undefined;

    let cancelled = false;
    let created = "";
    const controller = new AbortController();

    fetch(`${baseUrl}/api/candidate/applications/${applicationId}/resume`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error("not found"))))
      .then((blob) => {
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      })
      .catch(() => {
        if (!cancelled) setObjectUrl("");
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (created) URL.revokeObjectURL(created);
    };
  }, [applicationId, token]);

  return objectUrl;
}

export default function CandidateApplicationDetail() {
  const { id } = useParams();
  const { candidate, token } = useCandidateAuth();
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    candidateApi
      .getApplication(id, token)
      .then((res) => {
        if (res.status) setApplication(res.data);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, token]);

  const resumeUrl = useResumeObjectUrl(application?.resume_name ? id : null, token);

  if (!candidate) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-nx-paper px-4 py-16 text-center sm:px-6">
        <div className="w-full max-w-md rounded-lg border border-nx-line bg-nx-surface p-8 shadow-[0_12px_28px_-18px_rgba(33,29,23,0.3)] sm:p-10">
          <h1 className="text-xl font-bold text-nx-ink">Sign in to view this application</h1>
          <Link
            to={`/careers/login?redirect=/careers/account/applications/${id}`}
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
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="h-64 animate-pulse rounded-lg border border-nx-line bg-nx-surface" />
      </div>
    );
  }

  if (notFound || !application) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-nx-surface">
          <AlertCircle size={26} className="text-nx-faint" />
        </div>
        <h2 className="mt-5 text-xl font-bold text-nx-ink">Application not found</h2>
        <Link
          to="/careers/account/applications"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-nx-ink px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
        >
          <ArrowLeft size={15} /> Back to My Applications
        </Link>
      </div>
    );
  }

  const timeline = application.timeline || [];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-nx-paper">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link
          to="/careers/account/applications"
          className="inline-flex items-center gap-2 text-sm font-semibold text-nx-muted transition-colors hover:text-nx-ink"
        >
          <ArrowLeft size={15} /> Back to My Applications
        </Link>

        <div className="mt-6 rounded-lg border border-nx-line border-l-[3px] border-l-brand-500 bg-nx-surface p-7 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-brand-700">
                {application.department_name || "General"}
              </p>
              <h1 className="mt-2 text-xl font-black tracking-[-0.01em] text-nx-ink sm:text-2xl">{application.job_title}</h1>
            </div>
            <span
              className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
                STATUS_STYLES[application.status_label] || STATUS_STYLES.Submitted
              }`}
            >
              {["Offer", "Hired"].includes(application.status_label) && <CheckCircle2 size={12} />}
              {application.status_label}
            </span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-nx-line pt-5 text-sm text-nx-body">
            <span className="inline-flex items-center gap-1.5">
              <Calendar size={14} className="text-nx-faint" />
              Applied {new Date(application.applied_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </span>
            {application.resume_name && (
              <span className="inline-flex items-center gap-1.5">
                <FileText size={14} className="text-nx-faint" /> {application.resume_name}
                {resumeUrl && (
                  <a
                    href={resumeUrl}
                    download={application.resume_name}
                    className="ml-1 inline-flex items-center gap-1 font-bold text-brand-700 hover:underline"
                  >
                    <Download size={13} /> Download
                  </a>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-nx-line bg-nx-surface p-7 sm:p-8">
          <h2 className="text-sm font-bold text-nx-ink">Application Progress</h2>
          <ol className="mt-5 space-y-5">
            {timeline.map((step, i) => (
              <li key={`${step.status_label}-${step.occurred_at}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <CheckCircle2 size={18} className="flex-shrink-0 text-emerald-600" />
                  {i < timeline.length - 1 && <div className="mt-1 w-px flex-1 bg-nx-line2" />}
                </div>
                <div className="pb-1">
                  <p className="text-sm font-bold text-nx-ink">{step.status_label}</p>
                  <p className="text-xs text-nx-muted">
                    {new Date(step.occurred_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              </li>
            ))}
            {!["Closed", "Hired", "Offer"].includes(application.status_label) && (
              <li className="flex gap-3">
                <Circle size={18} className="flex-shrink-0 text-nx-faint" />
                <p className="text-sm font-medium text-nx-faint">Final Decision — Pending</p>
              </li>
            )}
          </ol>
        </div>
      </div>
    </div>
  );
}
