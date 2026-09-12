import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Mail, Phone as PhoneIcon, MapPin, Clock, Trash2, ArrowRight, ChevronRight,
  CheckCircle2, Circle, XCircle, PauseCircle, User2, CalendarClock, FileText, StickyNote, Lock,
  Download, ExternalLink, AlertTriangle, Target, RefreshCw, Loader2,
} from "lucide-react";
import Drawer, { CollapsibleSection } from "../../../../components/ui/Drawer";
import Badge from "../../../../components/ui/Badge";
import Button from "../../../../components/ui/Button";
import CandidateCrmSections from "./CandidateCrmSections";
import { baseUrl } from "../../../../utils/url";
import { useAuth } from "../../../../context/AuthContext";
import { hrApi } from "../../../../utils/api";

const CATEGORY_LABELS = { skills: "Skills", experience: "Experience", keywords: "Resume keywords" };

function ScoreBar({ label, score, weight }) {
  const pct = Math.max(0, Math.min(100, score ?? 0));
  const tone = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
        <span>{label} <span className="text-gray-400">({weight}%)</span></span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700">
        <div className={`h-1.5 rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AtsBreakdown({ candidate, onRescore, rescoring }) {
  const breakdown = candidate.ats_score_breakdown;
  const hasRequisition = !!candidate.requisition_id;

  return (
    <CollapsibleSection title="ATS Match" icon={<Target size={15} />}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            {candidate.ats_score != null ? (
              <span className="text-2xl font-bold text-gray-900 dark:text-white">{candidate.ats_score}%</span>
            ) : (
              <span className="text-sm text-gray-400">Not scored yet</span>
            )}
            {candidate.ats_score_source === "manual" && (
              <span className="ml-2 text-xs text-gray-400">(manually entered)</span>
            )}
            {candidate.ats_scored_at && candidate.ats_score_source !== "manual" && (
              <span className="ml-2 text-xs text-gray-400">
                computed {new Date(candidate.ats_scored_at).toLocaleDateString()}
              </span>
            )}
          </div>
          {hasRequisition && (
            <Button size="sm" variant="outline" onClick={onRescore} disabled={rescoring}>
              {rescoring ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Recompute
            </Button>
          )}
        </div>

        {!hasRequisition && (
          <p className="text-xs text-gray-400">
            Not linked to a requisition, so there is nothing to score a match against.
          </p>
        )}

        {breakdown?.categories && (
          <>
            <div className="space-y-2.5">
              {Object.entries(breakdown.categories).map(([key, cat]) => (
                <ScoreBar key={key} label={CATEGORY_LABELS[key] || key} score={cat.score} weight={cat.weight} />
              ))}
            </div>

            {breakdown.categories.skills?.matched?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Matched skills</p>
                <div className="flex flex-wrap gap-1">
                  {breakdown.categories.skills.matched.map((s) => (
                    <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">✓ {s}</span>
                  ))}
                </div>
              </div>
            )}
            {breakdown.categories.skills?.missing?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Not matched against this requisition</p>
                <div className="flex flex-wrap gap-1">
                  {breakdown.categories.skills.missing.map((s) => (
                    <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {Object.values(breakdown.categories).filter((c) => c.note).map((c, i) => (
              <p key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1">
                <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> {c.note}
              </p>
            ))}
          </>
        )}
      </div>
    </CollapsibleSection>
  );
}

const PRIORITY_VARIANT = { high: "red", medium: "yellow", low: "gray" };

/** Same safety rules as getEmployeePhotoUrl — a candidate's resume_path is a
 *  server-relative `public` disk path, never a browser-loadable one as-is. */
function getResumeSource(candidate) {
  if (!candidate) return null;
  const path = candidate.resume_path;
  if (!path) return null;
  const value = String(path).trim();
  if (!value) return null;
  if (/^(https?:)?\/\//i.test(value) || value.startsWith("data:")) {
    return { kind: "direct", url: value };
  }
  if (/^[a-z]:[\\/]/i.test(value) || value.startsWith("\\\\") || /^file:/i.test(value)) return null;
  if (candidate.id) {
    return { kind: "api", url: `${baseUrl}/api/v1/candidates/${candidate.id}/resume` };
  }
  const cleanPath = value.replace(/^\/?(storage\/)?/i, "");
  return { kind: "direct", url: `${baseUrl}/storage/${cleanPath}` };
}

/*
 * The resume endpoint is authenticated, so it cannot be handed to an <iframe>
 * or an <a href> as a bare URL — those load without the Authorization header
 * and come back 401. It is fetched once with the session token and published
 * to the DOM as a blob URL, which every consumer below can use unchanged.
 */
function useResumeObjectUrl(candidate, user) {
  const source = getResumeSource(candidate);
  const endpoint = source?.kind === "api" ? source.url : null;
  const [objectUrl, setObjectUrl] = useState("");

  useEffect(() => {
    if (!endpoint) return undefined;

    const controller = new AbortController();
    let created = "";
    let cancelled = false;

    fetch(endpoint, {
      headers: { Authorization: `${user?.tokenType || "bearer"} ${user?.accessToken}` },
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
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
      setObjectUrl("");
    };
  }, [endpoint, user?.accessToken, user?.tokenType]);

  return source?.kind === "direct" ? source.url : objectUrl;
}

/** Which tab a candidate belongs to once they've moved past this drawer's owning tab — only used for the "manage them elsewhere" banner. */
function ownerTabLabel(stage) {
  if (stage === "assessment") return "Assessment";
  if (stage === "interview") return "Interview";
  if (["selected", "offer_sent"].includes(stage)) return "Offer";
  if (stage === "offer_accepted") return "HR → Onboarding";
  return null;
}

/**
 * Replaces the old CandidateDetailModal — same stage-progress/terminal-
 * actions/delete behavior, reorganized into collapsible sections plus three
 * new ones (Timeline, Interviews, Offer) populated from whatever
 * CandidateController::show() already eager-loads (stageHistory, interviews,
 * offers) — no new backend call shape, just data that wasn't being shown.
 *
 * `ownedStages`, when passed, restricts advance/terminal actions to
 * candidates currently in one of those stages — the full stage timeline
 * still renders for context, but once a candidate has moved past the
 * calling tab's ownership boundary (e.g. Shortlisted → HR Interview), every
 * action here is disabled instead of letting this tab keep driving their
 * progress. Omit it for a tab with no such restriction.
 */
export default function CandidateDrawer({
  candidate, loadingDetail, onClose, onAdvance, onDelete, advancing,
  mainStages, terminalStages, stageIndex, ownedStages, hideCrmSections, hideAdvanceButton,
}) {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";
  const resumeUrl = useResumeObjectUrl(candidate, user);

  // Recompute overlays onto whatever candidate the parent handed us, keyed
  // to that candidate's id so switching to a different candidate doesn't
  // carry a stale score forward — no effect needed to "reset" it.
  const [rescoreResult, setRescoreResult] = useState(null);
  const [rescoring, setRescoring] = useState(false);
  const scored = rescoreResult && candidate && rescoreResult.candidateId === candidate.id
    ? { ...candidate, ...rescoreResult.data }
    : candidate;

  const handleRescore = async () => {
    if (!candidate) return;
    setRescoring(true);
    try {
      const res = await hrApi.rescoreCandidate(candidate.id, token, tokenType);
      setRescoreResult({ candidateId: candidate.id, data: res.data });
      toast.success("ATS score recomputed");
    } catch (err) {
      toast.error(err.message || "Could not recompute the ATS score");
    } finally {
      setRescoring(false);
    }
  };

  if (!candidate) return <Drawer isOpen={false} onClose={onClose} />;

  const canProcess = !ownedStages || ownedStages.includes(candidate.stage);
  const owner = !canProcess ? ownerTabLabel(candidate.stage) : null;

  const currentIdx = stageIndex[candidate.stage];
  const isTerminal = terminalStages.some((s) => s.key === candidate.stage);
  const nextIdx = isTerminal ? -1 : (currentIdx === undefined ? 0 : currentIdx + 1);
  const next = canProcess && !isTerminal && nextIdx < mainStages.length ? mainStages[nextIdx] : null;

  const stageHistory = candidate.stageHistory || [];
  const interviews = candidate.interviews || [];
  const offers = candidate.offers || [];

  const resumeExt = (candidate.resume_original_name || candidate.resume_path || "").split(".").pop()?.toLowerCase();
  const isUnmatchedFormSubmission = candidate.source === "google_form" && !candidate.requisition_id;

  return (
    <Drawer
      isOpen={!!candidate}
      onClose={onClose}
      title={candidate.name}
      subtitle={candidate.requisition?.title}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          {onDelete ? (
            <button
              onClick={() => onDelete(candidate.id)}
              className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 size={14} /> Delete
            </button>
          ) : <div />}
          {next && !hideAdvanceButton && onAdvance && (
            <Button icon={<ArrowRight size={15} />} onClick={() => onAdvance(candidate.id, next.key)} disabled={advancing}>
              {advancing ? "Moving..." : `Advance to ${next.label}`}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        {!canProcess && (
          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
            <Lock size={13} className="flex-shrink-0 text-gray-400" />
            {owner
              ? <span>This candidate has moved on — manage their next steps from the <strong>{owner}</strong> tab.</span>
              : <span>This candidate is no longer active in this tab's process.</span>}
          </div>
        )}
        {isUnmatchedFormSubmission && (
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            <AlertTriangle size={13} className="flex-shrink-0" />
            <span>Submitted via Google Form with a position that didn't match any requisition — link them to the right one manually.</span>
          </div>
        )}
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center text-white font-bold flex-shrink-0">
            {candidate.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {candidate.email && <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><Mail size={11} /> {candidate.email}</span>}
              {candidate.phone && <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><PhoneIcon size={11} /> {candidate.phone}</span>}
              {candidate.current_company && <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><MapPin size={11} /> {candidate.current_company}</span>}
              {candidate.experience_years != null && <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><Clock size={11} /> {candidate.experience_years} yrs exp</span>}
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              <Badge variant={PRIORITY_VARIANT[candidate.priority] || "gray"}>{candidate.priority} priority</Badge>
              {candidate.source && <Badge variant="gray">{candidate.source.replace("_", " ")}</Badge>}
              {candidate.rating != null && <Badge variant="blue">Score {candidate.rating}/5</Badge>}
              {scored.ats_score != null && <Badge variant="green">ATS {scored.ats_score}%</Badge>}
            </div>
          </div>
        </div>

        <AtsBreakdown candidate={scored} onRescore={handleRescore} rescoring={rescoring} />

        <CollapsibleSection title="Profile" icon={<User2 size={15} />}>
          {Array.isArray(candidate.skills) && candidate.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {candidate.skills.map((s) => (
                <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 font-medium">{s}</span>
              ))}
            </div>
          )}
          {candidate.current_designation && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">{candidate.current_designation} at {candidate.current_company || "—"}</p>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Resume" icon={<FileText size={15} />}>
          {!resumeUrl ? (
            <p className="text-xs text-gray-400 text-center py-2">No resume on file</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                <div className="min-w-0 flex items-center gap-2">
                  <FileText size={16} className="flex-shrink-0 text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-200 truncate">
                    {candidate.resume_original_name || "resume"}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <a href={resumeUrl} target="_blank" rel="noopener noreferrer" title="Open in new tab"
                     className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60">
                    <ExternalLink size={15} />
                  </a>
                  <a href={resumeUrl} download={candidate.resume_original_name || "resume"} title="Download"
                     className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60">
                    <Download size={15} />
                  </a>
                </div>
              </div>
              {resumeExt === "pdf" ? (
                <iframe src={resumeUrl} title="Resume preview" className="w-full h-96 rounded-lg border border-gray-200 dark:border-gray-700 bg-white" />
              ) : (
                <p className="text-xs text-gray-400 px-1">
                  Inline preview is only available for PDF resumes — use "Open in new tab" to view this Word document.
                </p>
              )}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Hiring Progress" icon={<CheckCircle2 size={15} />}>
          <div className="relative">
            <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-gray-700" />
            <div className="space-y-1">
              {mainStages.map((stage, i) => {
                const isDone = !isTerminal && i < currentIdx;
                const isCurrent = !isTerminal && i === currentIdx;
                const isFuture = isTerminal || i > currentIdx;
                return (
                  <div key={stage.key} className="flex items-center gap-3 relative">
                    <div
                      className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all
                        ${isDone ? "bg-green-100 dark:bg-green-900/30" : ""}
                        ${isCurrent ? "ring-2 ring-offset-2 ring-brand-500 dark:ring-offset-gray-900" : ""}
                        ${isFuture ? "bg-gray-100 dark:bg-gray-700" : ""}`}
                      style={isCurrent ? { backgroundColor: `${stage.color}22` } : {}}
                    >
                      {isDone ? <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
                        : isCurrent ? <span className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: stage.color }} />
                        : <Circle size={14} className="text-gray-400" />}
                    </div>
                    <div className="flex-1 flex items-center justify-between py-1.5 min-w-0">
                      <div>
                        <p className={`text-sm font-medium transition-colors ${isDone ? "text-green-700 dark:text-green-400 line-through opacity-60" : ""} ${isCurrent ? "text-gray-900 dark:text-white font-semibold" : ""} ${isFuture ? "text-gray-400 dark:text-gray-500" : ""}`}>
                          {stage.label}
                        </p>
                        {isCurrent && <p className="text-[11px] text-brand-600 dark:text-brand-400 font-medium">Current stage</p>}
                      </div>
                      {canProcess && i === nextIdx && !isTerminal && (
                        <button
                          onClick={() => onAdvance(candidate.id, stage.key)}
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
                          style={{ backgroundColor: `${stage.color}18`, color: stage.color }}
                        >
                          <ChevronRight size={13} /> Move here
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wide">Terminal Actions</p>
            <div className="flex gap-2">
              {terminalStages.map((stage) => {
                const isActive = candidate.stage === stage.key;
                const disabled = isActive || !canProcess;
                return (
                  <button
                    key={stage.key}
                    onClick={() => !disabled && onAdvance(candidate.id, stage.key)}
                    disabled={disabled}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border ${disabled ? "cursor-not-allowed opacity-50" : "hover:opacity-80 cursor-pointer"}`}
                    style={{ backgroundColor: isActive ? `${stage.color}22` : "transparent", borderColor: `${stage.color}44`, color: stage.color }}
                  >
                    {stage.key === "rejected" ? <XCircle size={13} /> : <PauseCircle size={13} />}
                    {stage.label}{isActive && " ✓"}
                  </button>
                );
              })}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Timeline" icon={<CalendarClock size={15} />} count={stageHistory.length} defaultOpen={false}>
          {loadingDetail ? (
            <p className="text-xs text-gray-400 text-center py-2">Loading…</p>
          ) : stageHistory.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">No stage changes recorded yet</p>
          ) : (
            <div className="space-y-2">
              {stageHistory.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">
                    {h.from_stage ? `${h.from_stage.replace("_", " ")} → ` : ""}{h.to_stage.replace("_", " ")}
                    {h.changedBy?.name && <span className="text-gray-400 text-xs"> · {h.changedBy.name}</span>}
                  </span>
                  <span className="text-gray-400 text-xs">{h.created_at ? new Date(h.created_at).toLocaleDateString() : ""}</span>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Interviews & Evaluation Notes" icon={<CalendarClock size={15} />} count={interviews.length} defaultOpen={interviews.length > 0}>
          {loadingDetail ? (
            <p className="text-xs text-gray-400 text-center py-2">Loading…</p>
          ) : interviews.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">No interviews scheduled yet</p>
          ) : (
            <div className="space-y-3">
              {interviews.map((iv) => {
                const feedbacks = Array.isArray(iv.feedback)
                  ? iv.feedback
                  : iv.feedback && typeof iv.feedback === "object"
                  ? [iv.feedback]
                  : [];
                const directFeedback = (iv.rating || iv.recommendation || iv.strengths || iv.concerns || iv.notes) ? [iv] : [];
                const allFeedbacks = feedbacks.length > 0 ? feedbacks : directFeedback;

                return (
                  <div key={iv.id} className="rounded-xl border border-gray-200 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-800/40 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between flex-wrap gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">{iv.round_name || "Interview Round"}</span>
                        {iv.mode && (
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                            {iv.mode}
                          </span>
                        )}
                      </div>
                      <Badge variant={iv.status === "completed" ? "green" : iv.status === "scheduled" ? "blue" : "gray"}>
                        {iv.status?.replace("_", " ")}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                      {iv.scheduled_at && (
                        <span>📅 {new Date(iv.scheduled_at).toLocaleString()}</span>
                      )}
                      {iv.duration_minutes && (
                        <span>⏱️ {iv.duration_minutes} mins</span>
                      )}
                      {iv.meeting_link && (
                        <a href={iv.meeting_link} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
                          <ExternalLink size={11} /> Meeting Link
                        </a>
                      )}
                    </div>

                    {/* Interview Feedback & Evaluation Notes */}
                    {allFeedbacks.length > 0 ? (
                      <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                            Evaluation Feedback
                          </span>
                        </div>
                        {allFeedbacks.map((fb, idx) => (
                          <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-100 dark:border-gray-700 space-y-2 text-xs shadow-2xs">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                {fb.rating != null && (
                                  <span className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                    ★ {fb.rating}/5
                                  </span>
                                )}
                                {fb.recommendation && (
                                  <span
                                    className={`font-bold px-2 py-0.5 rounded-full ${
                                      fb.recommendation.includes("yes")
                                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200"
                                        : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200"
                                    }`}
                                  >
                                    {fb.recommendation.replace("_", " ").toUpperCase()}
                                  </span>
                                )}
                              </div>
                              {fb.created_at && (
                                <span className="text-[10.5px] text-gray-400">
                                  {new Date(fb.created_at).toLocaleDateString()}
                                </span>
                              )}
                            </div>

                            {fb.strengths && (
                              <div className="p-2 rounded-md bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200 border border-emerald-100 dark:border-emerald-900/40">
                                <span className="font-bold block text-[11px] text-emerald-700 dark:text-emerald-300">Strengths:</span>
                                <p className="mt-0.5 whitespace-pre-line">{fb.strengths}</p>
                              </div>
                            )}

                            {fb.concerns && (
                              <div className="p-2 rounded-md bg-amber-50/60 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 border border-amber-100 dark:border-amber-900/40">
                                <span className="font-bold block text-[11px] text-amber-700 dark:text-amber-300">Concerns:</span>
                                <p className="mt-0.5 whitespace-pre-line">{fb.concerns}</p>
                              </div>
                            )}

                            {fb.notes && (
                              <div className="p-2 rounded-md bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-200">
                                <span className="font-bold block text-[11px] text-gray-500 dark:text-gray-400">Interviewer Notes:</span>
                                <p className="mt-0.5 whitespace-pre-line font-normal">{fb.notes}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      iv.notes && (
                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700 text-xs">
                          <span className="font-semibold text-gray-500 dark:text-gray-400 block text-[11px]">Round Notes:</span>
                          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line mt-0.5">{iv.notes}</p>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Offer" icon={<FileText size={15} />} count={offers.length} defaultOpen={false}>
          {loadingDetail ? (
            <p className="text-xs text-gray-400 text-center py-2">Loading…</p>
          ) : offers.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">No offer created yet</p>
          ) : (
            <div className="space-y-2">
              {offers.map((o) => (
                <div key={o.id} className="rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{o.designation}</span>
                    <Badge variant="gray">{o.status?.replace("_", " ")}</Badge>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">₹{Number(o.ctc_annual || 0).toLocaleString("en-IN")} / year</p>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {!hideCrmSections && <CandidateCrmSections candidate={candidate} loading={loadingDetail} />}

        {!hideCrmSections && candidate.notes && (
          <CollapsibleSection title="Notes" icon={<StickyNote size={15} />}>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{candidate.notes}</p>
          </CollapsibleSection>
        )}
      </div>
    </Drawer>
  );
}
