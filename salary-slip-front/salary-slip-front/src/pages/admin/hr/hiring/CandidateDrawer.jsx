import {
  Mail, Phone as PhoneIcon, MapPin, Clock, Trash2, ArrowRight, ChevronRight,
  CheckCircle2, Circle, XCircle, PauseCircle, User2, CalendarClock, FileText, StickyNote, Lock,
  Download, ExternalLink, AlertTriangle,
} from "lucide-react";
import Drawer, { CollapsibleSection } from "../../../../components/ui/Drawer";
import Badge from "../../../../components/ui/Badge";
import Button from "../../../../components/ui/Button";
import { baseUrl } from "../../../../utils/url";

const PRIORITY_VARIANT = { high: "red", medium: "yellow", low: "gray" };

/** Same safety rules as getEmployeePhotoUrl — a candidate's resume_path is a
 *  server-relative `public` disk path, never a browser-loadable one as-is. */
function getResumeUrl(path) {
  if (!path) return "";
  const value = String(path).trim();
  if (!value) return "";
  if (/^(https?:)?\/\//i.test(value)) return value;
  if (/^[a-z]:[\\/]/i.test(value) || value.startsWith("\\\\") || /^file:/i.test(value)) return "";
  return `${baseUrl}/storage/${value.replace(/^\/+/, "")}`;
}

/** Which tab a candidate belongs to once they've moved past this drawer's owning tab — only used for the "manage them elsewhere" banner. */
function ownerTabLabel(stage) {
  if (stage === "interview") return "Interviews";
  if (["selected", "offer_sent"].includes(stage)) return "Offers";
  if (stage === "offer_accepted") return "Onboarding";
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
  mainStages, terminalStages, stageIndex, ownedStages,
}) {
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

  const resumeUrl = getResumeUrl(candidate.resume_path);
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
          <button
            onClick={() => onDelete(candidate.id)}
            className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 size={14} /> Delete
          </button>
          {next && (
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
            </div>
          </div>
        </div>

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
                  <a href={resumeUrl} download={candidate.resume_original_name || undefined} title="Download"
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

        <CollapsibleSection title="Interviews" icon={<CalendarClock size={15} />} count={interviews.length} defaultOpen={false}>
          {loadingDetail ? (
            <p className="text-xs text-gray-400 text-center py-2">Loading…</p>
          ) : interviews.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">No interviews scheduled yet</p>
          ) : (
            <div className="space-y-2">
              {interviews.map((iv) => (
                <div key={iv.id} className="rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{iv.round_name}</span>
                    <Badge variant="gray">{iv.status?.replace("_", " ")}</Badge>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{iv.scheduled_at ? new Date(iv.scheduled_at).toLocaleString() : "—"}</p>
                </div>
              ))}
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

        {candidate.notes && (
          <CollapsibleSection title="Notes" icon={<StickyNote size={15} />}>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{candidate.notes}</p>
          </CollapsibleSection>
        )}
      </div>
    </Drawer>
  );
}
