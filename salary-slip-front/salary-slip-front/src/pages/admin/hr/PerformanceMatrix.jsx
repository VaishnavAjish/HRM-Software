import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trophy, TrendingDown, Star, ArrowUpCircle, GraduationCap, Target, Medal } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import { StatCard } from "../../../components/ui/Card";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { hrApi, salaryApi } from "../../../utils/api";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const EMPTY_CYCLE = { name: "", period_start: "", period_end: "", type: "annual" };
const EMPTY_GOAL = { user_id: "", type: "KPI", title: "", description: "", weight: "", target_value: "" };
const EMPTY_REVIEW = { user_id: "", review_type: "manager", overall_rating: 4, potential_rating: 3, strengths: "", improvements: "" };
const EMPTY_COMPETENCIES = [{ name: "Communication", rating: "" }, { name: "Problem Solving", rating: "" }, { name: "Leadership", rating: "" }];

const NINE_BOX_LEVELS = ["high", "medium", "low"];

export default function PerformanceMatrix() {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();
  const [tab, setTab] = useState("overview");
  const [cycles, setCycles] = useState([]);
  const [cycleId, setCycleId] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [goals, setGoals] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  const [cycleModalOpen, setCycleModalOpen] = useState(false);
  const [cycleForm, setCycleForm] = useState(EMPTY_CYCLE);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalForm, setGoalForm] = useState(EMPTY_GOAL);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewForm, setReviewForm] = useState(EMPTY_REVIEW);
  const [competencies, setCompetencies] = useState(EMPTY_COMPETENCIES);

  useEffect(() => {
    if (!user?.accessToken) return;
    hrApi.getPerformanceCycles(user.accessToken, user.tokenType).then((res) => {
      if (res.status) {
        setCycles(res.data || []);
        if (res.data?.length && !cycleId) setCycleId(res.data[0].id);
      }
    }).catch(() => {});
    salaryApi.getAllEmployees(user.accessToken, user.tokenType, { limit: 1000 }, companyScope)
      .then((res) => setEmployees(res?.data?.users?.data ?? res?.data?.users ?? []))
      .catch(() => {});
  }, [user, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const requestCycleData = async (id) => {
    try {
      const [dashRes, goalsRes, reviewsRes] = await Promise.all([
        hrApi.getPerformanceDashboard(user.accessToken, user.tokenType, { cycle_id: id }),
        hrApi.getPerformanceGoals(user.accessToken, user.tokenType, { cycle_id: id }),
        hrApi.getPerformanceReviews(user.accessToken, user.tokenType, { cycle_id: id }),
      ]);
      if (dashRes.status) setDashboard(dashRes.data);
      if (goalsRes.status) setGoals(goalsRes.data || []);
      if (reviewsRes.status) setReviews(reviewsRes.data || []);
    } finally {
      setLoading(false);
    }
  };

  // Raises no spinner of its own — every state update happens after an await,
  // so calling this from an effect costs no cascading render. `loading` starts
  // true; switching cycle turns it back on during render below.
  const loadCycleData = (id) =>
    requestCycleData(id).catch((err) => toast.error(err.message || "Failed to load performance data"));

  const [cycleSeen, setCycleSeen] = useState(cycleId);
  if (cycleSeen !== cycleId) {
    setCycleSeen(cycleId);
    if (cycleId) setLoading(true);
  }

  useEffect(() => { if (cycleId) loadCycleData(cycleId); }, [cycleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveCycle = async () => {
    if (!cycleForm.name || !cycleForm.period_start || !cycleForm.period_end) { toast.error("Name and period are required"); return; }
    try {
      const res = await hrApi.storePerformanceCycle(cycleForm, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success("Cycle created");
        setCycleModalOpen(false);
        setCycleForm(EMPTY_CYCLE);
        const listRes = await hrApi.getPerformanceCycles(user.accessToken, user.tokenType);
        if (listRes.status) { setCycles(listRes.data || []); setCycleId(res.data.id); }
      }
    } catch (err) {
      toast.error(err.message || "Failed to create cycle");
    }
  };

  const saveGoal = async () => {
    if (!goalForm.user_id || !goalForm.title) { toast.error("Employee and title are required"); return; }
    try {
      const res = await hrApi.storePerformanceGoal({ ...goalForm, cycle_id: cycleId }, user.accessToken, user.tokenType);
      if (res.status) { toast.success("Goal added"); setGoalModalOpen(false); setGoalForm(EMPTY_GOAL); loadCycleData(cycleId); }
    } catch (err) {
      toast.error(err.message || "Failed to add goal");
    }
  };

  const markGoalStatus = async (goal, status) => {
    try {
      const res = await hrApi.updatePerformanceGoal(goal.id, { status }, user.accessToken, user.tokenType);
      if (res.status) loadCycleData(cycleId);
    } catch (err) {
      toast.error(err.message || "Failed to update goal");
    }
  };

  const saveReview = async () => {
    if (!reviewForm.user_id) { toast.error("Select an employee"); return; }
    try {
      const competency_ratings = Object.fromEntries(competencies.filter((c) => c.name && c.rating).map((c) => [c.name, Number(c.rating)]));
      const res = await hrApi.storePerformanceReview({ ...reviewForm, cycle_id: cycleId, competency_ratings }, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success("Review saved");
        setReviewModalOpen(false);
        setReviewForm(EMPTY_REVIEW);
        setCompetencies(EMPTY_COMPETENCIES);
        loadCycleData(cycleId);
      }
    } catch (err) {
      toast.error(err.message || "Failed to save review");
    }
  };

  const nineBoxGrid = useMemo(() => {
    const grid = {};
    NINE_BOX_LEVELS.forEach((p) => NINE_BOX_LEVELS.forEach((q) => { grid[`${p}-${q}`] = []; }));
    (dashboard?.nine_box || []).forEach((e) => {
      const key = `${e.potential}-${e.performance}`;
      if (grid[key]) grid[key].push(e);
    });
    return grid;
  }, [dashboard]);

  // Who's actually performing well, not just a count — pulled straight from
  // the reviews already fetched for this cycle, no extra request needed.
  const ratedReviews = useMemo(
    () => reviews.filter((r) => r.review_type === "manager" && r.overall_rating != null),
    [reviews]
  );
  const topPerformers = useMemo(
    () => [...ratedReviews].sort((a, b) => b.overall_rating - a.overall_rating).slice(0, 6),
    [ratedReviews]
  );
  const needsAttention = useMemo(
    () => [...ratedReviews].filter((r) => r.overall_rating < 3).sort((a, b) => a.overall_rating - b.overall_rating).slice(0, 6),
    [ratedReviews]
  );

  const cards = dashboard?.cards || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Performance Matrix</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">KPI/KRA/OKR goals, reviews, bell curve and 9-box calibration</p>
        </div>
        <div className="flex items-center gap-2">
          <select className={inputClass + " w-48"} value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
            {cycles.length === 0 && <option value="">No cycles yet</option>}
            {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setCycleModalOpen(true)}>New Cycle</Button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {["overview", "goals", "reviews"].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 -mb-px transition-colors ${tab === t ? "border-brand-600 text-brand-600 dark:text-brand-400" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700"}`}>
            {t}
          </button>
        ))}
      </div>

      {!cycleId ? (
        <p className="text-center py-16 text-sm text-gray-500 dark:text-gray-400">Create a performance cycle to get started</p>
      ) : loading ? (
        <SkeletonTable rows={6} />
      ) : tab === "overview" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
            <StatCard title="Top Performers" value={cards.top_performers ?? 0} icon={<Trophy size={20} />} color="green" compact />
            <StatCard title="Low Performers" value={cards.low_performers ?? 0} icon={<TrendingDown size={20} />} color="red" compact />
            <StatCard title="Average Rating" value={cards.average_rating ?? "—"} icon={<Star size={20} />} color="yellow" compact />
            <StatCard title="Promotion Eligible" value={cards.promotion_eligible ?? 0} icon={<ArrowUpCircle size={20} />} color="blue" compact />
            <StatCard title="Training Required" value={cards.training_required ?? 0} icon={<GraduationCap size={20} />} color="purple" compact />
            <StatCard title="Goal Completion %" value={`${cards.goal_completion_pct ?? 0}%`} icon={<Target size={20} />} color="blue" compact />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <RankedEmployeeList
              title="Top Performing Employees"
              icon={<Trophy size={16} className="text-green-500" />}
              emptyText="No manager reviews with a rating yet"
              rows={topPerformers}
              tone="positive"
            />
            <RankedEmployeeList
              title="Needs Attention"
              icon={<TrendingDown size={16} className="text-red-500" />}
              emptyText="No one currently rated below 3"
              rows={needsAttention}
              tone="negative"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4">Bell Curve</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboard?.bell_curve || []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="band" tick={{ fontSize: 11, fill: "#6b7280" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                    <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4">Skill / Competency Matrix</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboard?.skill_matrix || []} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                    <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 12, fill: "#6b7280" }} />
                    <YAxis type="category" dataKey="competency" width={110} tick={{ fontSize: 11, fill: "#6b7280" }} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                    <Bar dataKey="average" fill="#22c55e" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">9-Box Grid</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Potential (rows) vs Performance (columns)</p>
            <div className="grid grid-cols-3 gap-2">
              {NINE_BOX_LEVELS.map((potential) => (
                NINE_BOX_LEVELS.slice().reverse().map((performance) => {
                  const cellEmployees = nineBoxGrid[`${potential}-${performance}`] || [];
                  return (
                    <div key={`${potential}-${performance}`} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 p-3 min-h-[110px]">
                      <p className="text-[10px] uppercase font-semibold text-gray-400 mb-2">{potential} potential · {performance} perf</p>
                      <div className="flex flex-wrap gap-1">
                        {cellEmployees.map((e) => <Badge key={e.user_id} variant="blue">{e.name}</Badge>)}
                      </div>
                    </div>
                  );
                })
              ))}
            </div>
          </div>
        </div>
      ) : tab === "goals" ? (
        <div className="space-y-4">
          <div className="flex justify-end"><Button icon={<Plus size={16} />} onClick={() => setGoalModalOpen(true)}>Add Goal</Button></div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            {goals.length === 0 ? (
              <p className="text-center py-16 text-sm text-gray-500 dark:text-gray-400">No goals for this cycle yet</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="text-left px-4 py-3">Employee</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Title</th>
                    <th className="text-left px-4 py-3">Weight</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {goals.map((g) => (
                    <tr key={g.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{g.user?.name}</td>
                      <td className="px-4 py-3"><Badge variant="purple">{g.type}</Badge></td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{g.title}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{g.weight ? `${g.weight}%` : "—"}</td>
                      <td className="px-4 py-3"><Badge variant={g.status === "completed" ? "green" : g.status === "missed" ? "red" : "yellow"}>{g.status.replace("_", " ")}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5 text-xs">
                          {g.status !== "completed" && <button onClick={() => markGoalStatus(g, "completed")} className="text-green-600 hover:underline">Complete</button>}
                          {g.status !== "missed" && <button onClick={() => markGoalStatus(g, "missed")} className="text-red-500 hover:underline">Mark Missed</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end"><Button icon={<Plus size={16} />} onClick={() => setReviewModalOpen(true)}>New Review</Button></div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            {reviews.length === 0 ? (
              <p className="text-center py-16 text-sm text-gray-500 dark:text-gray-400">No reviews for this cycle yet</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="text-left px-4 py-3">Employee</th>
                    <th className="text-left px-4 py-3">Reviewer</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Rating</th>
                    <th className="text-left px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {reviews.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.user?.name}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.reviewer?.name}</td>
                      <td className="px-4 py-3 capitalize text-gray-600 dark:text-gray-300">{r.review_type}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.overall_rating ?? "—"}</td>
                      <td className="px-4 py-3"><Badge variant={r.status === "acknowledged" ? "green" : "blue"}>{r.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <Modal isOpen={cycleModalOpen} onClose={() => setCycleModalOpen(false)} title="New Performance Cycle"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCycleModalOpen(false)}>Cancel</Button><Button onClick={saveCycle}>Create</Button></div>}>
        <div className="space-y-4">
          <Field label="Name" required><input className={inputClass} value={cycleForm.name} onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })} placeholder="e.g. H1 2026" /></Field>
          <Field label="Type">
            <select className={inputClass} value={cycleForm.type} onChange={(e) => setCycleForm({ ...cycleForm, type: e.target.value })}>
              <option value="annual">Annual</option><option value="half_yearly">Half Yearly</option><option value="quarterly">Quarterly</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start" required><input type="date" className={inputClass} value={cycleForm.period_start} onChange={(e) => setCycleForm({ ...cycleForm, period_start: e.target.value })} /></Field>
            <Field label="End" required><input type="date" className={inputClass} value={cycleForm.period_end} onChange={(e) => setCycleForm({ ...cycleForm, period_end: e.target.value })} /></Field>
          </div>
        </div>
      </Modal>

      <Modal isOpen={goalModalOpen} onClose={() => setGoalModalOpen(false)} title="Add Goal"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setGoalModalOpen(false)}>Cancel</Button><Button onClick={saveGoal}>Add</Button></div>}>
        <div className="space-y-4">
          <Field label="Employee" required>
            <select className={inputClass} value={goalForm.user_id} onChange={(e) => setGoalForm({ ...goalForm, user_id: e.target.value })}>
              <option value="">— Select employee —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Type">
            <select className={inputClass} value={goalForm.type} onChange={(e) => setGoalForm({ ...goalForm, type: e.target.value })}>
              <option value="KPI">KPI</option><option value="KRA">KRA</option><option value="OKR">OKR</option>
            </select>
          </Field>
          <Field label="Title" required><input className={inputClass} value={goalForm.title} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} /></Field>
          <Field label="Weight (%)"><input type="number" className={inputClass} value={goalForm.weight} onChange={(e) => setGoalForm({ ...goalForm, weight: e.target.value })} /></Field>
          <Field label="Target"><input className={inputClass} value={goalForm.target_value} onChange={(e) => setGoalForm({ ...goalForm, target_value: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal isOpen={reviewModalOpen} onClose={() => setReviewModalOpen(false)} title="New Performance Review" size="lg"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setReviewModalOpen(false)}>Cancel</Button><Button onClick={saveReview}>Save Review</Button></div>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Employee" required full>
            <select className={inputClass} value={reviewForm.user_id} onChange={(e) => setReviewForm({ ...reviewForm, user_id: e.target.value })}>
              <option value="">— Select employee —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Review Type">
            <select className={inputClass} value={reviewForm.review_type} onChange={(e) => setReviewForm({ ...reviewForm, review_type: e.target.value })}>
              <option value="self">Self</option><option value="manager">Manager</option><option value="peer">Peer</option><option value="360">360</option>
            </select>
          </Field>
          <Field label="Overall Rating (1-5)"><input type="number" min="1" max="5" step="0.5" className={inputClass} value={reviewForm.overall_rating} onChange={(e) => setReviewForm({ ...reviewForm, overall_rating: e.target.value })} /></Field>
          <Field label="Potential Rating (1-5)"><input type="number" min="1" max="5" step="0.5" className={inputClass} value={reviewForm.potential_rating} onChange={(e) => setReviewForm({ ...reviewForm, potential_rating: e.target.value })} /></Field>
          <Field label="Strengths" full><textarea rows={2} className={inputClass} value={reviewForm.strengths} onChange={(e) => setReviewForm({ ...reviewForm, strengths: e.target.value })} /></Field>
          <Field label="Areas of Improvement" full><textarea rows={2} className={inputClass} value={reviewForm.improvements} onChange={(e) => setReviewForm({ ...reviewForm, improvements: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Competency Ratings (1-5)</label>
            <div className="space-y-2">
              {competencies.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <input className={inputClass} value={c.name} onChange={(e) => setCompetencies(competencies.map((row, idx) => idx === i ? { ...row, name: e.target.value } : row))} />
                  <input type="number" min="1" max="5" className={inputClass} value={c.rating} onChange={(e) => setCompetencies(competencies.map((row, idx) => idx === i ? { ...row, rating: e.target.value } : row))} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Names, not just a count — ranked by overall_rating, using whatever
 *  manager reviews are already loaded for the current cycle. */
function RankedEmployeeList({ title, icon, emptyText, rows, tone }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
      <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">{icon} {title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">{emptyText}</p>
      ) : (
        <div className="space-y-1">
          {rows.map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 py-2 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
              <span className="w-5 flex-shrink-0 text-center">
                {i < 3 ? <Medal size={16} className={i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : "text-amber-700"} /> : <span className="text-xs text-gray-400">{i + 1}</span>}
              </span>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {r.user?.name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{r.user?.name || "—"}</p>
                {r.user?.designation && <p className="text-xs text-gray-400 truncate">{r.user.designation}</p>}
              </div>
              <span className={`flex items-center gap-1 text-sm font-bold flex-shrink-0 ${tone === "positive" ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                <Star size={13} fill="currentColor" /> {Number(r.overall_rating).toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, required, full, children }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
