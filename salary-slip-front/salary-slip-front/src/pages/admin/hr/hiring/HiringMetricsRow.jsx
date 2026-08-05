import { useEffect, useState } from "react";
import { Briefcase, Users, CalendarClock, FileText, LogIn, Timer } from "lucide-react";
import { StatCard } from "../../../../components/ui/Card";
import { useAuth } from "../../../../context/AuthContext";
import { hrApi } from "../../../../utils/api";

// Every candidate stage that isn't a dead end — mirrors MAIN_STAGES in
// CandidatePipeline.jsx without importing it, so this row has no dependency
// on the Candidates tab's internals.
const ACTIVE_CANDIDATE_STAGES = [
  "applied", "screening", "shortlisted", "interview", "selected", "offer_sent", "offer_accepted",
];
const OFFERS_PENDING_STATUSES = "draft,pending_approval,approved,released";

/**
 * Every number here is real and traced to an existing endpoint — see the
 * plan's grounding table. Nothing is invented; Time to Hire / Joining This
 * Week are computed client-side from the one "accepted offers" fetch
 * because there's no backend aggregation for them.
 */
export default function HiringMetricsRow() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    if (!user?.accessToken) return;
    let cancelled = false;

    Promise.all([
      hrApi.getDashboard(user.accessToken, user.tokenType),
      hrApi.getCandidates(user.accessToken, user.tokenType, { stage: ACTIVE_CANDIDATE_STAGES.join(","), per_page: 1 }),
      hrApi.getOffers(user.accessToken, user.tokenType, { status: OFFERS_PENDING_STATUSES, per_page: 1 }),
      hrApi.getOffers(user.accessToken, user.tokenType, { status: "accepted", per_page: 100 }),
    ])
      .then(([dash, candidates, offersPending, accepted]) => {
        if (cancelled) return;
        const cards = dash?.data?.cards || {};
        const activeCandidates = candidates?.data?.total ?? 0;
        const offersPendingTotal = offersPending?.data?.total ?? 0;
        const acceptedOffers = accepted?.data?.data || accepted?.data || [];

        const today = new Date();
        const in7Days = new Date();
        in7Days.setDate(today.getDate() + 7);
        const joiningThisWeek = acceptedOffers.filter((o) => {
          if (!o.joining_date) return false;
          const jd = new Date(o.joining_date);
          return jd >= today && jd <= in7Days;
        }).length;

        const hireDurations = acceptedOffers
          .filter((o) => o.responded_at && o.candidate?.created_at)
          .map((o) => (new Date(o.responded_at) - new Date(o.candidate.created_at)) / 86400000);
        const timeToHire = hireDurations.length
          ? Math.round(hireDurations.reduce((s, d) => s + d, 0) / hireDurations.length)
          : null;

        setMetrics({
          openJobs: cards.open_job_positions ?? 0,
          activeCandidates,
          interviewsToday: cards.interviews_today ?? 0,
          offersPending: offersPendingTotal,
          joiningThisWeek,
          timeToHire,
        });
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [user]);

  const cards = [
    { key: "openJobs", title: "Open Jobs", icon: <Briefcase size={18} />, color: "blue" },
    { key: "activeCandidates", title: "Active Candidates", icon: <Users size={18} />, color: "purple" },
    { key: "interviewsToday", title: "Today's Interviews", icon: <CalendarClock size={18} />, color: "yellow" },
    { key: "offersPending", title: "Offers Pending", icon: <FileText size={18} />, color: "red" },
    { key: "joiningThisWeek", title: "Joining This Week", icon: <LogIn size={18} />, color: "green" },
    { key: "timeToHire", title: "Time to Hire", icon: <Timer size={18} />, color: "blue", suffix: " days" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <StatCard
          key={c.key}
          compact
          title={c.title}
          icon={c.icon}
          color={c.color}
          value={
            metrics === null
              ? "—"
              : metrics[c.key] == null
                ? "—"
                : `${metrics[c.key]}${c.suffix || ""}`
          }
        />
      ))}
    </div>
  );
}
