import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark } from "lucide-react";
import toast from "react-hot-toast";
import { candidateApi } from "../../utils/api";
import { useCandidateAuth } from "../../context/CandidateAuthContext";

/**
 * Self-contained save/unsave toggle. The caller only needs to know whether
 * the job started out saved (from a bulk `getSavedJobs` lookup) — everything
 * after that first render is this component's own state, backed by the
 * real `candidate_saved_jobs` table, never localStorage.
 */
export default function SaveJobButton({ jobId, initialSaved = false, variant = "icon", className = "" }) {
  const navigate = useNavigate();
  const { isAuthenticated, token } = useCandidateAuth();
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);

  const toggle = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      navigate(`/careers/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    setBusy(true);
    try {
      if (saved) {
        await candidateApi.unsaveJob(jobId, token);
        setSaved(false);
      } else {
        await candidateApi.saveJob(jobId, token);
        setSaved(true);
        toast.success("Job saved");
      }
    } catch (err) {
      toast.error(err.message || "Could not update saved jobs");
    } finally {
      setBusy(false);
    }
  };

  if (variant === "text") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={saved}
        className={`inline-flex items-center gap-1.5 rounded-md border px-4 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          saved
            ? "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
            : "border-nx-line text-nx-body hover:border-nx-line2"
        } ${className}`}
      >
        <Bookmark size={15} className={saved ? "fill-brand-600 text-brand-600" : ""} />
        {saved ? "Saved" : "Save Job"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved jobs" : "Save job"}
      title={saved ? "Remove from saved jobs" : "Save job"}
      className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-nx-faint transition-colors hover:bg-nx-paper hover:text-brand-600 disabled:cursor-not-allowed ${className}`}
    >
      <Bookmark size={17} className={saved ? "fill-brand-600 text-brand-600" : ""} />
    </button>
  );
}
