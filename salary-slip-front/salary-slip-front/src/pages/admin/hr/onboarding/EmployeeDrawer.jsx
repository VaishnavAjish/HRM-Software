import { useEffect, useState, useMemo } from "react";
import toast from "react-hot-toast";
import {
  ShieldCheck,
  Mail,
  Phone as PhoneIcon,
  MapPin,
  User2,
  Target,
  AlertTriangle,
  Clock,
} from "lucide-react";
import Button from "../../../../components/ui/Button";
import SlideOver from "../../../../components/onboarding/SlideOver";
import {
  Eyebrow,
  Person,
  ProgressBar,
  StatusPill,
} from "../../../../components/onboarding/primitives";
import Badge from "../../../../components/ui/Badge";
import { CollapsibleSection } from "../../../../components/ui/Drawer";
import { hrApi, rbacApi } from "../../../../utils/api";
import { useAuth } from "../../../../context/AuthContext";

const STATUS = {
  PRE_BOARDING: ["Pre-boarding", "info"],
  IN_PROGRESS: ["In progress", "warn"],
  PROBATION: ["Probation", "mut"],
  COMPLETED: ["Completed", "ok"],
};

const PRIORITY_VARIANT = { high: "red", medium: "yellow", low: "gray" };

const CATEGORY_LABELS = { skills: "Skills", experience: "Experience", keywords: "Resume keywords" };

const DEFAULT_DOC_RULES = [
  { id: "aadhaar", name: "Aadhaar Card", mandatory: true, expiryTracked: false, allowed: "PDF, JPG, PNG", maxSize: "5 MB" },
  { id: "pan", name: "PAN Card", mandatory: true, expiryTracked: false, allowed: "PDF, JPG, PNG", maxSize: "5 MB" },
  { id: "passport", name: "Passport", mandatory: false, expiryTracked: true, allowed: "PDF", maxSize: "10 MB" },
  { id: "driving", name: "Driving License", mandatory: false, expiryTracked: true, allowed: "PDF, JPG", maxSize: "5 MB" },
  { id: "education", name: "Degree Certificates", mandatory: true, expiryTracked: false, allowed: "PDF", maxSize: "10 MB" },
  { id: "experience", name: "Relieving & Experience Letters", mandatory: true, expiryTracked: false, allowed: "PDF", maxSize: "10 MB" }
];

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

function AtsBreakdown({ candidate }) {
  const breakdown = candidate?.ats_score_breakdown;
  const hasRequisition = !!candidate?.requisition_id;

  return (
    <CollapsibleSection title="ATS Match" icon={<Target size={15} />}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            {candidate?.ats_score != null ? (
              <span className="text-2xl font-bold text-gray-900 dark:text-white">{candidate.ats_score}%</span>
            ) : (
              <span className="text-sm text-gray-400">Not scored yet</span>
            )}
            {candidate?.ats_score_source === "manual" && (
              <span className="ml-2 text-xs text-gray-400">(manually entered)</span>
            )}
            {candidate?.ats_scored_at && candidate?.ats_score_source !== "manual" && (
              <span className="ml-2 text-xs text-gray-400">
                computed {new Date(candidate.ats_scored_at).toLocaleDateString()}
              </span>
            )}
          </div>
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

/** Shared employee side panel — used by both the Employees tab and the
 *  Overview tab's joining lists. */
export default function EmployeeDrawer({ employee, onClose }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("onboarding");
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [docRules, setDocRules] = useState(DEFAULT_DOC_RULES);
  const [candidateDetails, setCandidateDetails] = useState(null);
  const [loadingCandidate, setLoadingCandidate] = useState(false);

  useEffect(() => {
    setActiveTab("onboarding");
    setCandidateDetails(null);
  }, [employee?.id]);

  useEffect(() => {
    if (!user?.accessToken) return;
    rbacApi.getSettings(user.accessToken, user.tokenType, "hr")
      .then((res) => {
        const data = res.data || [];
        try {
          const docsStr = data.find((s) => s.key === "hr.doc_types")?.value;
          if (docsStr) {
            const parsed = JSON.parse(docsStr);
            if (Array.isArray(parsed) && parsed.length > 0) setDocRules(parsed);
          }
        } catch (e) {
          console.error("Error parsing HR settings JSON", e);
        }
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!employee?.id || !user?.accessToken) return;
    let ignore = false;
    hrApi.getCandidateDocuments(employee.id, user.accessToken, user.tokenType)
      .then((res) => { if (!ignore && res.status) setDocs(res.data || []); })
      .catch(() => {})
      .finally(() => { if (!ignore) setLoading(false); });

    return () => {
      ignore = true;
    };
  }, [employee?.id, user]);

  useEffect(() => {
    if (!employee?.id || !user?.accessToken || activeTab !== "user_details") return;
    let ignore = false;
    setLoadingCandidate(true);
    hrApi.getCandidate(employee.id, user.accessToken, user.tokenType)
      .then((res) => {
        if (!ignore && res.status) {
          setCandidateDetails(res.data || null);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) setLoadingCandidate(false);
      });

    return () => {
      ignore = true;
    };
  }, [employee?.id, user, activeTab]);

  const docsByType = useMemo(() => {
    const map = {};
    for (const d of docs) {
      (map[d.document_type] ||= []).push(d);
    }
    return map;
  }, [docs]);

  const mandatoryRules = docRules.filter((r) => r.mandatory);
  const verifiedMandatoryCount = mandatoryRules.filter((r) => {
    const list = docsByType[r.name] || [];
    return list.some((d) => d.status === "VERIFIED");
  }).length;
  const compliancePct = mandatoryRules.length > 0
    ? Math.round((verifiedMandatoryCount / mandatoryRules.length) * 100)
    : 100;

  const candidate = candidateDetails || employee;

  return (
    <SlideOver
      open={Boolean(employee)}
      title={employee?.name || ""}
      onClose={onClose}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      {employee ? (
        <>
          {/* Tabs bar side-by-side */}
          <div className="flex gap-6 border-b border-gray-200 dark:border-gray-700 mb-4">
            <button
              type="button"
              onClick={() => setActiveTab("onboarding")}
              className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                activeTab === "onboarding"
                  ? "border-brand-600 text-brand-600 dark:text-brand-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              Onboarding Details
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("user_details")}
              className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                activeTab === "user_details"
                  ? "border-brand-600 text-brand-600 dark:text-brand-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              User Details
            </button>
          </div>

          {activeTab === "onboarding" ? (
            <>
              <div className="mb-4">
                <Person name={employee.name} meta={`${employee.code || "EMP"} • ${employee.dept || "Engineering"}`} size={40} />
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3">
                {[
                  ["Role", employee.role],
                  ["Joining", employee.joiningDate || "TBD"],
                  ["Mode", employee.mode || "On-site"],
                  ["Location", employee.location || "Headquarters"],
                  ["Manager", employee.manager || "—"],
                  ["Status", STATUS[employee.status]?.[0] || employee.status || "In progress"],
                ].map(([l, v]) => (
                  <div key={l}>
                    <Eyebrow>{l}</Eyebrow>
                    <div className="mt-0.5 text-[13px] font-semibold">{v}</div>
                  </div>
                ))}
              </div>

              {employee.slaBreached ? (
                <div className="mb-4">
                  <StatusPill tone="bad">SLA breached</StatusPill>
                </div>
              ) : null}

              {/* Compliance Card */}
              <div className="mb-5 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                  <span className="flex items-center gap-1.5 text-gray-800 dark:text-gray-200">
                    <ShieldCheck size={14} className="text-brand-500" />
                    Document Verification Compliance
                  </span>
                  <span className="text-brand-600 dark:text-brand-400">{compliancePct}%</span>
                </div>
                <ProgressBar value={compliancePct} tone={compliancePct === 100 ? "ok" : "brand"} />
                <p className="text-[11px] text-gray-400 mt-1.5">
                  {verifiedMandatoryCount} of {mandatoryRules.length} mandatory documents verified
                </p>
              </div>

              {/* Uploaded Files Section (without verify/reject/delete action buttons) */}
              <Eyebrow>Uploaded Files ({docs.length})</Eyebrow>
              <div className="mb-5 mt-2 flex flex-col gap-2.5">
                {loading ? (
                  <p className="text-[12.5px] text-gray-400">Loading…</p>
                ) : docs.length === 0 ? (
                  <p className="text-[12.5px] text-gray-400">Nothing uploaded yet.</p>
                ) : (
                  docs.map((d) => (
                    <div key={d.id} className="flex items-center gap-2.5 rounded-lg border border-gray-200 p-2.5 dark:border-gray-800">
                      <div className="min-w-0 flex-1">
                        <a href={d.url} target="_blank" rel="noreferrer" className="block truncate text-[12.5px] font-semibold text-brand-600 hover:underline">
                          {d.document_type}
                        </a>
                        <small className="text-[11px] text-gray-400 truncate block">{d.original_filename}</small>
                      </div>
                      <StatusPill tone={d.status === "VERIFIED" ? "ok" : d.status === "REJECTED" ? "bad" : "warn"}>
                        {d.status === "VERIFIED" ? "Verified" : d.status === "REJECTED" ? "Rejected" : "Pending"}
                      </StatusPill>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            /* User Details Tab Content */
            <div className="space-y-4">
              {loadingCandidate ? (
                <p className="text-xs text-gray-400 text-center py-4">Loading candidate details…</p>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                      {candidate?.name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-base font-bold text-gray-900 dark:text-white">{candidate?.name}</h4>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                        {candidate?.email && (
                          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Mail size={11} /> {candidate.email}
                          </span>
                        )}
                        {candidate?.phone && (
                          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <PhoneIcon size={11} /> {candidate.phone}
                          </span>
                        )}
                        {(candidate?.current_company || candidate?.location) && (
                          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <MapPin size={11} /> {candidate.current_company || candidate.location}
                          </span>
                        )}
                        {candidate?.experience_years != null && (
                          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Clock size={11} /> {candidate.experience_years} yrs exp
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {candidate?.priority && (
                          <Badge variant={PRIORITY_VARIANT[candidate.priority] || "gray"}>
                            {candidate.priority} priority
                          </Badge>
                        )}
                        {candidate?.source && (
                          <Badge variant="gray">{candidate.source.replace("_", " ")}</Badge>
                        )}
                        {candidate?.rating != null && (
                          <Badge variant="blue">Score {candidate.rating}/5</Badge>
                        )}
                        {candidate?.ats_score != null && (
                          <Badge variant="green">ATS {candidate.ats_score}%</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <AtsBreakdown candidate={candidate} />

                  <CollapsibleSection title="Profile" icon={<User2 size={15} />}>
                    {Array.isArray(candidate?.skills) && candidate.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {candidate.skills.map((s) => (
                          <span
                            key={s}
                            className="text-xs px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 font-medium"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                    {candidate?.current_designation && (
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {candidate.current_designation} {candidate.current_company ? `at ${candidate.current_company}` : ""}
                      </p>
                    )}
                    {!candidate?.current_designation && (!Array.isArray(candidate?.skills) || candidate.skills.length === 0) && (
                      <p className="text-xs text-gray-400">No profile info available</p>
                    )}
                  </CollapsibleSection>
                </>
              )}
            </div>
          )}
        </>
      ) : null}
    </SlideOver>
  );
}
