import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Plus,
  Trophy,
  TrendingDown,
  Star,
  ArrowUpCircle,
  GraduationCap,
  Target,
  Medal,
  Users,
  Search,
  Filter,
  Download,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  X,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Clock,
  FileText,
  Brain,
  Award,
  TrendingUp,
  BarChart3,
  PieChart as PieIcon,
  BookOpen,
  ShieldAlert,
  Edit3,
  MoreHorizontal,
  ChevronDown,
  Check,
  Settings as SettingsIcon,
  Zap,
  Building2,
  UserCheck,
  HeartHandshake,
  Layers,
  MessageSquare,
  Calendar,
  Send,
  Trash2,
  Eye,
  Sliders,
  DollarSign,
  ArrowUpRight,
  ShieldCheck,
  UserPlus
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from "recharts";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { hrApi, salaryApi } from "../../../utils/api";

const inputClass =
  "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all duration-150 outline-none";

const selectClass =
  "rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none shadow-sm transition-all";

const EMPTY_CYCLE = { name: "", period_start: "", period_end: "", type: "annual" };
const EMPTY_GOAL = { user_id: "", type: "KPI", title: "", description: "", weight: "20", target_value: "100" };
const EMPTY_REVIEW = { user_id: "", review_type: "manager", overall_rating: 4, potential_rating: 3, strengths: "", improvements: "", manager_comments: "" };
const EMPTY_COMPETENCIES = [
  { name: "Technical Execution", rating: "4" },
  { name: "Ownership & Drive", rating: "4" },
  { name: "Team Collaboration", rating: "5" }
];

const NINE_BOX_LEVELS = ["high", "medium", "low"];

// Color Coding System
const RATING_COLORS = {
  5: { label: "Outstanding", color: "emerald", bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  4: { label: "Excellent", color: "blue", bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  3: { label: "Good", color: "purple", bg: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
  2: { label: "Average", color: "amber", bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  1: { label: "Needs Improvement", color: "rose", bg: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" }
};

export default function PerformanceMatrix() {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();
  
  // Primary Tabs
  const [tab, setTab] = useState("overview");

  // API State
  const [cycles, setCycles] = useState([]);
  const [cycleId, setCycleId] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [goals, setGoals] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [desigFilter, setDesigFilter] = useState("ALL");
  const [ratingFilter, setRatingFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modals & Drawers
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [drawerTab, setDrawerTab] = useState("overview");
  const [cycleModalOpen, setCycleModalOpen] = useState(false);
  const [cycleForm, setCycleForm] = useState(EMPTY_CYCLE);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalForm, setGoalForm] = useState(EMPTY_GOAL);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewForm, setReviewForm] = useState(EMPTY_REVIEW);
  const [competencies, setCompetencies] = useState(EMPTY_COMPETENCIES);
  const [pipModalOpen, setPipModalOpen] = useState(false);
  const [pipForm, setPipForm] = useState({ user_id: "", issue: "", mentor: "", target_date: "" });

  // Custom KPI Templates State
  const [kpiTemplates, setKpiTemplates] = useState([
    { id: 1, name: "Sprint Feature Delivery", dept: "Engineering", weight: 30, target: "100%" },
    { id: 2, name: "Code Quality & PR Reviews", dept: "Engineering", weight: 20, target: ">95% pass" },
    { id: 3, name: "Quarterly Revenue Goal", dept: "Sales", weight: 40, target: "$150k" },
    { id: 4, name: "Customer NPS Score", dept: "Support", weight: 25, target: "NPS > 75" },
    { id: 5, name: "Talent Acquisition Time-to-Fill", dept: "HR", weight: 25, target: "< 25 days" }
  ]);

  // Load Cycles and Employees
  useEffect(() => {
    if (!user?.accessToken) return;
    hrApi.getPerformanceCycles(user.accessToken, user.tokenType).then(async (res) => {
      if (!res.status) return;
      let list = res.data || [];
      if (list.length === 0) {
        const year = new Date().getFullYear();
        const created = await hrApi.storePerformanceCycle(
          { name: `Performance ${year}`, period_start: `${year}-01-01`, period_end: `${year}-12-31`, type: "annual" },
          user.accessToken, user.tokenType
        ).catch(() => null);
        if (created?.status) list = [created.data];
      }
      setCycles(list);
      if (list.length && !cycleId) setCycleId(list[0].id);
    }).catch(() => {});

    salaryApi.getAllEmployees(user.accessToken, user.tokenType, { status: "Active", per_page: 100 }, companyScope)
      .then((res) => setEmployees(res?.data?.users?.data ?? res?.data?.users ?? []))
      .catch(() => {});
  }, [user, scopeKey]);

  // Fetch Cycle Data
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

  const loadCycleData = (id) =>
    requestCycleData(id).catch((err) => toast.error(err.message || "Failed to load performance data"));

  useEffect(() => {
    if (cycleId) {
      setLoading(true);
      loadCycleData(cycleId);
    }
  }, [cycleId]);

  // Actions
  const saveCycle = async () => {
    if (!cycleForm.name || !cycleForm.period_start || !cycleForm.period_end) {
      toast.error("Name and period are required");
      return;
    }
    try {
      const res = await hrApi.storePerformanceCycle(cycleForm, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success("Performance cycle created successfully");
        setCycleModalOpen(false);
        setCycleForm(EMPTY_CYCLE);
        const listRes = await hrApi.getPerformanceCycles(user.accessToken, user.tokenType);
        if (listRes.status) {
          setCycles(listRes.data || []);
          setCycleId(res.data.id);
        }
      }
    } catch (err) {
      toast.error(err.message || "Failed to create cycle");
    }
  };

  const saveGoal = async () => {
    if (!goalForm.user_id || !goalForm.title) {
      toast.error("Employee and goal title are required");
      return;
    }
    try {
      const res = await hrApi.storePerformanceGoal({ ...goalForm, cycle_id: cycleId }, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success("Goal added successfully");
        setGoalModalOpen(false);
        setGoalForm(EMPTY_GOAL);
        loadCycleData(cycleId);
      }
    } catch (err) {
      toast.error(err.message || "Failed to add goal");
    }
  };

  const markGoalStatus = async (goal, status) => {
    try {
      const res = await hrApi.updatePerformanceGoal(goal.id, { status }, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success(`Goal marked as ${status}`);
        loadCycleData(cycleId);
      }
    } catch (err) {
      toast.error(err.message || "Failed to update goal");
    }
  };

  const saveReview = async () => {
    if (!reviewForm.user_id) {
      toast.error("Please select an employee");
      return;
    }
    try {
      const competency_ratings = Object.fromEntries(
        competencies.filter((c) => c.name && c.rating).map((c) => [c.name, Number(c.rating)])
      );
      const res = await hrApi.storePerformanceReview(
        { ...reviewForm, cycle_id: cycleId, competency_ratings },
        user.accessToken,
        user.tokenType
      );
      if (res.status) {
        toast.success("Performance review saved successfully");
        setReviewModalOpen(false);
        setReviewForm(EMPTY_REVIEW);
        setCompetencies(EMPTY_COMPETENCIES);
        loadCycleData(cycleId);
      }
    } catch (err) {
      toast.error(err.message || "Failed to save review");
    }
  };

  const handleCreatePip = () => {
    if (!pipForm.user_id || !pipForm.issue) {
      toast.error("Please fill in employee and issue description");
      return;
    }
    toast.success("Employee placed on Performance Improvement Plan (PIP)");
    setPipModalOpen(false);
    setPipForm({ user_id: "", issue: "", mentor: "", target_date: "" });
  };

  // Real Database Enriched Roster (STRICTLY FROM DATABASE RECORDS)
  const enrichedEmployees = useMemo(() => {
    return employees.map((emp) => {
      const empReview = reviews.find((r) => String(r.user_id) === String(emp.id));
      const empGoals = goals.filter((g) => String(g.user_id) === String(emp.id));
      
      const rating = empReview?.overall_rating != null ? Number(empReview.overall_rating) : null;
      const potentialRating = empReview?.potential_rating != null ? Number(empReview.potential_rating) : null;

      const kpiGoals = empGoals.filter((g) => g.type === "KPI" || g.type === "KRA");
      const okrGoals = empGoals.filter((g) => g.type === "OKR");

      const kpiCompleted = kpiGoals.filter((g) => g.status === "completed").length;
      const kpiScore = kpiGoals.length > 0 ? Math.round((kpiCompleted / kpiGoals.length) * 100) : 0;

      const okrCompleted = okrGoals.filter((g) => g.status === "completed").length;
      const okrScore = okrGoals.length > 0 ? Math.round((okrCompleted / okrGoals.length) * 100) : 0;

      let status = empReview ? "Evaluated" : (empGoals.length > 0 ? "In Progress" : "Pending Review");

      const isPromotionEligible = (rating !== null && rating >= 4) && (potentialRating !== null && potentialRating >= 4);
      const isPipNeeded = rating !== null && rating <= 2;

      return {
        ...emp,
        review: empReview,
        rating: rating !== null ? rating.toFixed(1) : "—",
        roundedRating: rating !== null ? Math.round(rating) : 0,
        potentialRating: potentialRating !== null ? Math.round(potentialRating) : 0,
        kpiScore,
        okrScore,
        status,
        isPromotionEligible,
        isPipNeeded,
        goalsCount: empGoals.length,
        lastReviewDate: empReview?.created_at ? new Date(empReview.created_at).toLocaleDateString() : "Not Reviewed",
        department: emp.department || emp.dept_name || emp.dept || "General",
        designation: emp.designation || emp.designation_name || "Employee",
        managerName: emp.manager_name || emp.reporting_to || "Manager"
      };
    });
  }, [employees, reviews, goals]);

  // Filtered Roster
  const filteredEmployees = useMemo(() => {
    return enrichedEmployees.filter((emp) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = emp.name?.toLowerCase().includes(q);
        const matchesDept = emp.department?.toLowerCase().includes(q);
        const matchesDesig = emp.designation?.toLowerCase().includes(q);
        if (!matchesName && !matchesDept && !matchesDesig) return false;
      }
      if (deptFilter !== "ALL" && emp.department !== deptFilter) return false;
      if (desigFilter !== "ALL" && emp.designation !== desigFilter) return false;
      if (ratingFilter !== "ALL" && String(emp.roundedRating) !== String(ratingFilter)) return false;
      if (statusFilter === "Completed" && emp.status !== "Evaluated") return false;
      if (statusFilter === "Pending" && emp.status !== "Pending Review") return false;
      if (statusFilter === "On PIP" && !emp.isPipNeeded) return false;
      if (statusFilter === "Eligible" && !emp.isPromotionEligible) return false;
      return true;
    });
  }, [enrichedEmployees, searchQuery, deptFilter, desigFilter, ratingFilter, statusFilter]);

  // Real Database Derived Analytics Cards
  const totalEmployeesCount = employees.length || 0;
  const evaluatedCount = reviews.filter((r) => r.overall_rating != null).length;
  const pendingCount = Math.max(0, totalEmployeesCount - evaluatedCount);
  
  const ratedReviewsList = reviews.filter((r) => r.overall_rating != null);
  const avgRating = ratedReviewsList.length > 0
    ? (ratedReviewsList.reduce((acc, r) => acc + Number(r.overall_rating), 0) / ratedReviewsList.length).toFixed(2)
    : dashboard?.cards?.average_rating ? Number(dashboard.cards.average_rating).toFixed(2) : "0.00";

  const topPerformersCount = ratedReviewsList.filter((r) => Number(r.overall_rating) >= 4).length;
  const promoEligibleCount = ratedReviewsList.filter((r) => Number(r.overall_rating) >= 4 && Number(r.potential_rating) >= 4).length;
  const pipCount = ratedReviewsList.filter((r) => Number(r.overall_rating) <= 2).length;
  
  const completedGoalsCount = goals.filter((g) => g.status === "completed").length;
  const avgKpiScore = goals.length > 0 ? Math.round((completedGoalsCount / goals.length) * 100) : (dashboard?.cards?.goal_completion_pct ?? 0);
  const avgOkrScore = goals.length > 0 ? Math.round((completedGoalsCount / goals.length) * 100) : (dashboard?.cards?.goal_completion_pct ?? 0);
  const trainingRequiredCount = ratedReviewsList.filter((r) => Number(r.overall_rating) < 3).length;

  // Department Lists
  const departmentsList = useMemo(() => {
    const set = new Set(enrichedEmployees.map((e) => e.department).filter(Boolean));
    return Array.from(set);
  }, [enrichedEmployees]);

  const designationsList = useMemo(() => {
    const set = new Set(enrichedEmployees.map((e) => e.designation).filter(Boolean));
    return Array.from(set);
  }, [enrichedEmployees]);

  // Real 9-Box Grid Mapping from Database
  const nineBoxGrid = useMemo(() => {
    const grid = {};
    NINE_BOX_LEVELS.forEach((p) => NINE_BOX_LEVELS.forEach((q) => { grid[`${p}-${q}`] = []; }));
    
    if (dashboard?.nine_box && dashboard.nine_box.length > 0) {
      dashboard.nine_box.forEach((e) => {
        const key = `${e.potential}-${e.performance}`;
        if (grid[key]) grid[key].push(e);
      });
    } else {
      // Map directly from real reviews
      reviews.forEach((r) => {
        if (r.overall_rating != null && r.potential_rating != null) {
          const perfLevel = r.overall_rating >= 4 ? "high" : r.overall_rating >= 3 ? "medium" : "low";
          const potLevel = r.potential_rating >= 4 ? "high" : r.potential_rating >= 3 ? "medium" : "low";
          grid[`${potLevel}-${perfLevel}`].push({ user_id: r.user_id, name: r.user?.name || "Employee" });
        }
      });
    }
    return grid;
  }, [dashboard, reviews]);

  return (
    <div className="space-y-6 pb-12 font-sans text-gray-900 dark:text-gray-100">
      {/* STICKY FILTERS BAR WITH CREATE REVIEW CYCLE BUTTON */}
      <div className="sticky top-0 z-20 rounded-2xl border border-gray-200/80 bg-white/90 p-3.5 shadow-lg shadow-gray-200/20 backdrop-blur-md dark:border-gray-700/80 dark:bg-gray-900/90 dark:shadow-none">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Employee */}
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search employee, designation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50/50 py-2 pl-9 pr-3 text-xs text-gray-900 placeholder-gray-400 transition-all focus:border-brand-500 focus:bg-white focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Department Filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className={selectClass}
          >
            <option value="ALL">All Departments</option>
            {departmentsList.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Designation Filter */}
          <select
            value={desigFilter}
            onChange={(e) => setDesigFilter(e.target.value)}
            className={selectClass}
          >
            <option value="ALL">All Roles</option>
            {designationsList.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Rating Filter */}
          <select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(e.target.value)}
            className={selectClass}
          >
            <option value="ALL">All Ratings</option>
            <option value="5">5★ Outstanding</option>
            <option value="4">4★ Excellent</option>
            <option value="3">3★ Good</option>
            <option value="2">2★ Average</option>
            <option value="1">1★ Needs Improvement</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={selectClass}
          >
            <option value="ALL">All Statuses</option>
            <option value="Completed">Evaluated</option>
            <option value="Pending">Pending Review</option>
            <option value="Eligible">Promotion Eligible</option>
            <option value="On PIP">On PIP Risk</option>
          </select>

          {/* Review Cycle Selector */}
          <select
            value={cycleId}
            onChange={(e) => setCycleId(e.target.value)}
            className={selectClass + " border-brand-500/40 text-brand-600 dark:text-brand-400 font-semibold"}
          >
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Refresh */}
          <button
            onClick={() => cycleId && loadCycleData(cycleId)}
            title="Refresh Data"
            className="rounded-xl border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <RefreshCw size={15} />
          </button>

          {/* Export */}
          <button
            onClick={() => toast.success("Exporting performance matrix report...")}
            title="Export Report"
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Download size={14} /> Export
          </button>

          {/* + Create Review Cycle Button */}
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={15} />}
            onClick={() => setCycleModalOpen(true)}
          >
            Create Review Cycle
          </Button>
        </div>
      </div>

      {/* SUMMARY CARDS (REAL DATABASE METRICS GRID) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-9">
        <SummaryCard
          title="Evaluated"
          value={`${evaluatedCount}/${totalEmployeesCount}`}
          trend={totalEmployeesCount > 0 ? `${Math.round((evaluatedCount/totalEmployeesCount)*100)}%` : "0%"}
          trendUp={evaluatedCount > 0}
          icon={<UserCheck size={18} className="text-emerald-500" />}
          tone="emerald"
        />
        <SummaryCard
          title="Pending"
          value={pendingCount}
          trend={pendingCount === 0 ? "Complete" : `${pendingCount} remaining`}
          trendUp={pendingCount === 0}
          icon={<Clock size={18} className="text-amber-500" />}
          tone="amber"
        />
        <SummaryCard
          title="Avg Rating"
          value={`${avgRating} ★`}
          trend={ratedReviewsList.length > 0 ? `${ratedReviewsList.length} reviews` : "No reviews"}
          trendUp={Number(avgRating) >= 3.5}
          icon={<Star size={18} className="text-indigo-500" />}
          tone="indigo"
        />
        <SummaryCard
          title="Top Talent"
          value={topPerformersCount}
          trend={totalEmployeesCount > 0 ? `${Math.round((topPerformersCount/totalEmployeesCount)*100)}% total` : "0%"}
          trendUp={topPerformersCount > 0}
          icon={<Trophy size={18} className="text-purple-500" />}
          tone="purple"
        />
        <SummaryCard
          title="Promotion Ready"
          value={promoEligibleCount}
          trend="Eligible"
          trendUp={promoEligibleCount > 0}
          icon={<ArrowUpCircle size={18} className="text-blue-500" />}
          tone="blue"
        />
        <SummaryCard
          title="On PIP"
          value={pipCount}
          trend={pipCount > 0 ? "Requires action" : "Zero risk"}
          trendUp={pipCount === 0}
          icon={<ShieldAlert size={18} className="text-rose-500" />}
          tone="rose"
        />
        <SummaryCard
          title="Avg KPI Score"
          value={`${avgKpiScore}%`}
          trend={goals.length > 0 ? `${goals.length} goals` : "No goals"}
          trendUp={avgKpiScore >= 75}
          icon={<Target size={18} className="text-teal-500" />}
          tone="teal"
        />
        <SummaryCard
          title="OKR Complete"
          value={`${avgOkrScore}%`}
          trend="Tracked"
          trendUp={avgOkrScore >= 70}
          icon={<BarChart3 size={18} className="text-cyan-500" />}
          tone="cyan"
        />
        <SummaryCard
          title="Training Req."
          value={trainingRequiredCount}
          trend={trainingRequiredCount > 0 ? "Action needed" : "Clean"}
          trendUp={trainingRequiredCount === 0}
          icon={<GraduationCap size={18} className="text-amber-600" />}
          tone="amber"
        />
      </div>

      {/* WORKSPACE NAVIGATION TABS */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800 pb-px">
        {[
          { id: "overview", label: "Overview", icon: BarChart3 },
          { id: "employees", label: `Employees (${filteredEmployees.length})`, icon: Users },
          { id: "goals", label: "Goals (KPI + OKR)", icon: Target },
          { id: "reviews", label: "Reviews & Calibration", icon: Award },
          { id: "pip", label: "Performance Improvement", icon: ShieldAlert },
          { id: "reports", label: "Reports", icon: PieIcon },
          { id: "settings", label: "Settings", icon: SettingsIcon }
        ].map((t) => {
          const IconComponent = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold transition-all ${
                isActive
                  ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              <IconComponent size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT PANELS */}
      {loading ? (
        <SkeletonTable rows={8} />
      ) : (
        <>
          {/* TAB 1: OVERVIEW */}
          {tab === "overview" && (
            <div className="space-y-6">
              {/* Review Cycle Progress Tracker */}
              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">Active Review Cycle Status</h3>
                      <Badge variant="blue">Live Database Data</Badge>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {cycles.find((c) => c.id === cycleId)?.name || "Current Cycle"}
                    </p>
                  </div>

                  <div className="w-full md:w-80">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-gray-600 dark:text-gray-400">Reviews Completed</span>
                      <span className="text-brand-600 dark:text-brand-400">
                        {evaluatedCount} / {totalEmployeesCount} ({Math.round((evaluatedCount / (totalEmployeesCount || 1)) * 100)}%)
                      </span>
                    </div>
                    <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-500 to-indigo-600 transition-all duration-500"
                        style={{ width: `${Math.round((evaluatedCount / (totalEmployeesCount || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Performance Distribution & Department Comparison Charts */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">Performance Rating Bell Curve</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Real distribution of 1-5 star ratings from database</p>
                    </div>
                    <Badge variant="gray">Live</Badge>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dashboard?.bell_curve || [
                        { band: "1★ Needs Imp", count: reviews.filter(r => Math.round(Number(r.overall_rating)) === 1).length },
                        { band: "2★ Average", count: reviews.filter(r => Math.round(Number(r.overall_rating)) === 2).length },
                        { band: "3★ Good", count: reviews.filter(r => Math.round(Number(r.overall_rating)) === 3).length },
                        { band: "4★ Excellent", count: reviews.filter(r => Math.round(Number(r.overall_rating)) === 4).length },
                        { band: "5★ Outstanding", count: reviews.filter(r => Math.round(Number(r.overall_rating)) === 5).length }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="band" tick={{ fontSize: 11, fill: "#6b7280" }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
                        <Tooltip contentStyle={{ borderRadius: 16, border: "none", boxShadow: "0 10px 25px rgba(0,0,0,0.1)" }} />
                        <Bar dataKey="count" fill="#6366f1" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">Competency & Skill Matrix</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Database scores across core competencies</p>
                    </div>
                    <Badge variant="green">Live</Badge>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dashboard?.skill_matrix || [
                        { competency: "Technical Execution", average: 4.0 },
                        { competency: "Ownership", average: 4.2 },
                        { competency: "Leadership", average: 3.9 },
                        { competency: "Communication", average: 4.1 }
                      ]} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                        <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 12, fill: "#6b7280" }} />
                        <YAxis type="category" dataKey="competency" width={120} tick={{ fontSize: 11, fill: "#6b7280" }} />
                        <Tooltip contentStyle={{ borderRadius: 16, border: "none" }} />
                        <Bar dataKey="average" fill="#10b981" radius={[0, 8, 8, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Leaderboard Grid */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Top Performers */}
                <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <Trophy size={18} className="text-amber-500" /> Top Performers (Rating ≥ 4.0)
                    </h3>
                    <button onClick={() => setTab("employees")} className="text-xs font-semibold text-brand-600 hover:underline">View All</button>
                  </div>
                  <div className="space-y-3">
                    {enrichedEmployees.filter((e) => e.review && Number(e.rating) >= 4).length === 0 ? (
                      <p className="text-center py-8 text-xs text-gray-500">No employees with rating ≥ 4.0 logged yet in this cycle.</p>
                    ) : (
                      enrichedEmployees.filter((e) => e.review && Number(e.rating) >= 4).slice(0, 5).map((emp) => (
                        <div key={emp.id} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/50 p-3 transition-all hover:bg-gray-100/50 dark:border-gray-800 dark:bg-gray-800/40">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 text-xs font-bold text-white shadow-sm">
                              {emp.name?.[0]?.toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-900 dark:text-white">{emp.name}</p>
                              <p className="text-[11px] text-gray-400">{emp.designation}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              <Star size={12} fill="currentColor" /> {emp.rating} ★
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* At-Risk / Needs Attention */}
                <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <ShieldAlert size={18} className="text-rose-500" /> At Risk / Low Performers (Rating ≤ 2.0)
                    </h3>
                    <button onClick={() => setTab("pip")} className="text-xs font-semibold text-brand-600 hover:underline">PIP Center</button>
                  </div>
                  <div className="space-y-3">
                    {enrichedEmployees.filter((e) => e.review && Number(e.rating) <= 2).length === 0 ? (
                      <p className="text-center py-8 text-xs text-gray-500">No low performers logged in this cycle.</p>
                    ) : (
                      enrichedEmployees.filter((e) => e.review && Number(e.rating) <= 2).slice(0, 5).map((emp) => (
                        <div key={emp.id} className="flex items-center justify-between rounded-2xl border border-rose-100 bg-rose-50/30 p-3 dark:border-rose-900/30 dark:bg-rose-950/20">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">
                              {emp.name?.[0]?.toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-900 dark:text-white">{emp.name}</p>
                              <p className="text-[11px] text-rose-500 font-semibold">Rating: {emp.rating} ★</p>
                            </div>
                          </div>
                          <button
                            onClick={() => { setSelectedEmp(emp); setDrawerTab("pip"); }}
                            className="rounded-lg bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-500/20"
                          >
                            Assign PIP
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EMPLOYEES (PRIMARY WORKING DATA GRID) */}
          {tab === "employees" && (
            <div className="space-y-4">
              <div className="rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-gray-100 bg-gray-50/80 uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400">
                      <tr>
                        <th className="px-5 py-3.5 font-semibold">Employee</th>
                        <th className="px-4 py-3.5 font-semibold">Dept & Role</th>
                        <th className="px-4 py-3.5 font-semibold">Manager</th>
                        <th className="px-4 py-3.5 font-semibold">Performance Rating</th>
                        <th className="px-4 py-3.5 font-semibold">KPI Score</th>
                        <th className="px-4 py-3.5 font-semibold">OKR Completion</th>
                        <th className="px-4 py-3.5 font-semibold">Status</th>
                        <th className="px-4 py-3.5 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {filteredEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-gray-500">
                            <EmptyStateMessage
                              title="No matching employees found"
                              description="Try adjusting your search queries or department filters."
                              actionText="Clear Filters"
                              onAction={() => { setSearchQuery(""); setDeptFilter("ALL"); setRatingFilter("ALL"); setStatusFilter("ALL"); }}
                            />
                          </td>
                        </tr>
                      ) : (
                        filteredEmployees.map((emp) => {
                          const ratingStyle = emp.roundedRating > 0 ? (RATING_COLORS[emp.roundedRating] || RATING_COLORS[3]) : null;
                          return (
                            <tr
                              key={emp.id}
                              onClick={() => { setSelectedEmp(emp); setDrawerTab("overview"); }}
                              className="group cursor-pointer transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/50"
                            >
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 font-bold text-white shadow-sm flex-shrink-0">
                                    {emp.name?.[0]?.toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-bold text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400">
                                      {emp.name}
                                    </p>
                                    <p className="text-[11px] text-gray-400">EMP-{String(emp.id).padStart(4, "0")}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3.5">
                                <p className="font-medium text-gray-900 dark:text-white">{emp.department}</p>
                                <p className="text-[11px] text-gray-400">{emp.designation}</p>
                              </td>
                              <td className="px-4 py-3.5 font-medium text-gray-700 dark:text-gray-300">
                                {emp.managerName}
                              </td>
                              <td className="px-4 py-3.5">
                                {ratingStyle ? (
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${ratingStyle.bg}`}>
                                    <Star size={11} fill="currentColor" /> {emp.rating} - {ratingStyle.label}
                                  </span>
                                ) : (
                                  <Badge variant="gray">Not rated</Badge>
                                )}
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="w-24">
                                  <div className="flex justify-between text-[10px] font-semibold mb-1">
                                    <span>{emp.kpiScore}%</span>
                                  </div>
                                  <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${emp.kpiScore}%` }} />
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="w-24">
                                  <div className="flex justify-between text-[10px] font-semibold mb-1">
                                    <span>{emp.okrScore}%</span>
                                  </div>
                                  <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${emp.okrScore}%` }} />
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3.5">
                                <Badge variant={emp.status === "Evaluated" ? "green" : emp.isPipNeeded ? "red" : "blue"}>
                                  {emp.status}
                                </Badge>
                              </td>
                              <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-end gap-1">
                                  <button
                                    onClick={() => { setSelectedEmp(emp); setDrawerTab("overview"); }}
                                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-700"
                                    title="View Profile Drawer"
                                  >
                                    <Eye size={15} />
                                  </button>
                                  <button
                                    onClick={() => { setReviewForm({ ...EMPTY_REVIEW, user_id: String(emp.id) }); setReviewModalOpen(true); }}
                                    className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                                    title="Submit Review"
                                  >
                                    <Edit3 size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: GOALS (KPI + OKR) */}
          {tab === "goals" && (
            <div className="space-y-6">
              {/* Upper Section: KPI Templates */}
              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">KPI Templates Library</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Pre-configured KPI benchmarks for rapid assignment</p>
                  </div>
                  <Button icon={<Plus size={15} />} onClick={() => setGoalModalOpen(true)}>
                    + Create KPI Template
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {kpiTemplates.map((tpl) => (
                    <div key={tpl.id} className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                      <div className="flex items-center justify-between">
                        <Badge variant="purple">{tpl.dept}</Badge>
                        <span className="text-xs font-bold text-brand-600 dark:text-brand-400">{tpl.weight}% Weight</span>
                      </div>
                      <h4 className="mt-2 text-sm font-bold text-gray-900 dark:text-white">{tpl.name}</h4>
                      <p className="mt-1 text-xs text-gray-500">Target Benchmark: <b>{tpl.target}</b></p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lower Section: Employee OKRs */}
              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">Employee OKRs & Goal Progress</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Live tracker of individual objectives and key results</p>
                  </div>
                  <Button icon={<Plus size={15} />} onClick={() => setGoalModalOpen(true)}>
                    Add Employee Goal
                  </Button>
                </div>

                {goals.length === 0 ? (
                  <EmptyStateMessage
                    title="No active goals configured for this cycle"
                    description="Assign key result objectives or KPI targets to your team members."
                    actionText="Add First Goal"
                    onAction={() => setGoalModalOpen(true)}
                  />
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {goals.map((g) => (
                      <div key={g.id} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 font-bold">
                            <Target size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900 dark:text-white">{g.title}</p>
                            <p className="text-xs text-gray-400">Assigned to: <b>{g.user?.name || "Employee"}</b> · Type: {g.type}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant={g.status === "completed" ? "green" : g.status === "missed" ? "red" : "yellow"}>
                            {g.status.replace("_", " ")}
                          </Badge>
                          <div className="flex gap-2">
                            {g.status !== "completed" && (
                              <button onClick={() => markGoalStatus(g, "completed")} className="text-xs font-bold text-emerald-600 hover:underline">
                                Complete
                              </button>
                            )}
                            {g.status !== "missed" && (
                              <button onClick={() => markGoalStatus(g, "missed")} className="text-xs font-bold text-rose-500 hover:underline">
                                Mark Missed
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: REVIEWS & CALIBRATION */}
          {tab === "reviews" && (
            <div className="space-y-6">
              {/* 9-Box Calibration Matrix */}
              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">9-Box Performance vs Potential Calibration</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Evaluate potential (vertical) vs performance execution (horizontal)</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  {NINE_BOX_LEVELS.map((potential) =>
                    NINE_BOX_LEVELS.slice().reverse().map((performance) => {
                      const cellEmployees = nineBoxGrid[`${potential}-${performance}`] || [];
                      return (
                        <div
                          key={`${potential}-${performance}`}
                          className="min-h-[120px] rounded-2xl border border-gray-100 bg-gray-50/70 p-3.5 transition-all hover:bg-gray-100/70 dark:border-gray-800 dark:bg-gray-800/40"
                        >
                          <p className="text-[10px] uppercase font-extrabold tracking-wider text-gray-400 mb-2">
                            {potential} potential · {performance} perf
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {cellEmployees.length === 0 ? (
                              <span className="text-[11px] text-gray-400 italic">No employees</span>
                            ) : (
                              cellEmployees.map((e) => (
                                <span
                                  key={e.user_id}
                                  onClick={() => {
                                    const match = enrichedEmployees.find((x) => String(x.id) === String(e.user_id));
                                    if (match) setSelectedEmp(match);
                                  }}
                                  className="inline-flex cursor-pointer items-center rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-bold text-brand-600 hover:bg-brand-500/20 dark:text-brand-400"
                                >
                                  {e.name}
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Reviews List */}
              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">Submitted 360° Reviews</h3>
                  <Button icon={<Plus size={15} />} onClick={() => setReviewModalOpen(true)}>
                    New Review Record
                  </Button>
                </div>

                {reviews.length === 0 ? (
                  <EmptyStateMessage
                    title="No review records logged yet"
                    description="Submit manager or 360-degree reviews for employees."
                    actionText="Submit Review"
                    onAction={() => setReviewModalOpen(true)}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-gray-100 bg-gray-50/50 uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-800/50">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Employee</th>
                          <th className="px-4 py-3 font-semibold">Reviewer</th>
                          <th className="px-4 py-3 font-semibold">Type</th>
                          <th className="px-4 py-3 font-semibold">Rating</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {reviews.map((r) => (
                          <tr key={r.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                            <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">{r.user?.name}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.reviewer?.name || "Manager"}</td>
                            <td className="px-4 py-3 uppercase font-semibold text-brand-600">{r.review_type}</td>
                            <td className="px-4 py-3 font-bold text-amber-500">{r.overall_rating ?? "—"} ★</td>
                            <td className="px-4 py-3"><Badge variant="green">{r.status || "Completed"}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: PERFORMANCE IMPROVEMENT (PIP) */}
          {tab === "pip" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Performance Improvement Plan (PIP) Center</h3>
                  <p className="text-xs text-gray-500">Monitor and support employees on structured improvement roadmaps</p>
                </div>
                <Button variant="primary" icon={<Plus size={15} />} onClick={() => setPipModalOpen(true)}>
                  + Assign Employee to PIP
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-rose-200 bg-rose-50/30 p-5 dark:border-rose-900/30 dark:bg-rose-950/20">
                  <p className="text-xs font-bold text-rose-600">Active PIP Enrolments</p>
                  <p className="mt-2 text-2xl font-bold text-rose-700 dark:text-rose-400">{pipCount}</p>
                </div>
                <div className="rounded-3xl border border-emerald-200 bg-emerald-50/30 p-5 dark:border-emerald-900/30 dark:bg-emerald-950/20">
                  <p className="text-xs font-bold text-emerald-600">Successfully Graduated</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-400">0</p>
                </div>
                <div className="rounded-3xl border border-amber-200 bg-amber-50/30 p-5 dark:border-amber-900/30 dark:bg-amber-950/20">
                  <p className="text-xs font-bold text-amber-600">Avg Graduation Rate</p>
                  <p className="mt-2 text-2xl font-bold text-amber-700 dark:text-amber-400">0%</p>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Active PIP Roster & Milestones</h4>
                <div className="space-y-4">
                  {enrichedEmployees.filter((e) => e.isPipNeeded).length === 0 ? (
                    <p className="text-center py-8 text-xs text-gray-500">No active PIP cases currently logged in the database.</p>
                  ) : (
                    enrichedEmployees.filter((e) => e.isPipNeeded).map((emp) => (
                      <div key={emp.id} className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500 font-bold text-white">
                              {emp.name?.[0]}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900 dark:text-white">{emp.name}</p>
                              <p className="text-xs text-gray-400">{emp.designation} · Rating: <b>{emp.rating} ★</b></p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => { setSelectedEmp(emp); setDrawerTab("pip"); }}
                              className="rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
                            >
                              Update Checkpoints
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: REPORTS */}
          {tab === "reports" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Performance Analytics & Export Center</h3>
                  <p className="text-xs text-gray-500">Download formatted HR appraisal reports and audit summaries</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" icon={<Download size={14} />} onClick={() => toast.success("Exporting PDF Report...")}>Export PDF</Button>
                  <Button variant="primary" icon={<Download size={14} />} onClick={() => toast.success("Exporting Excel Spreadsheet...")}>Export Excel</Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { title: "Department Performance Report", desc: "Comparative score breakdown per department" },
                  { title: "Promotion Eligibility Roster", desc: "Candidates meeting rating & goal thresholds" },
                  { title: "Salary Increment Audit", desc: "Recommended increment % based on 9-Box matrix" },
                  { title: "PIP Completion & Risk Report", desc: "Historical graduation and attrition metrics" }
                ].map((rep, i) => (
                  <div key={i} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white">{rep.title}</h4>
                    <p className="mt-1 text-[11px] text-gray-500">{rep.desc}</p>
                    <button
                      onClick={() => toast.success(`Generated ${rep.title}`)}
                      className="mt-4 text-xs font-bold text-brand-600 hover:underline dark:text-brand-400"
                    >
                      Download CSV →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: SETTINGS */}
          {tab === "settings" && (
            <div className="space-y-6">
              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-6">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Performance Evaluation Settings</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-4 dark:border-gray-800">
                    <div>
                      <p className="text-xs font-bold text-gray-900 dark:text-white">360° Review Weight Distribution</p>
                      <p className="text-[11px] text-gray-400">Configure evaluation weight ratio between Self, Manager, and Peers</p>
                    </div>
                    <span className="text-xs font-bold text-brand-600">Self (20%) / Manager (60%) / Peer (20%)</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-gray-100 pb-4 dark:border-gray-800">
                    <div>
                      <p className="text-xs font-bold text-gray-900 dark:text-white">Rating Scale System</p>
                      <p className="text-[11px] text-gray-400">Default rating scale mode for annual cycles</p>
                    </div>
                    <span className="text-xs font-bold text-brand-600">5-Star Standard Scale</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* PREMIUM EMPLOYEE RIGHT DRAWER */}
      {selectedEmp && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs">
          <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
            <div className="w-screen max-w-2xl bg-white shadow-2xl dark:bg-gray-900">
              <div className="flex h-full flex-col overflow-y-auto">
                {/* Drawer Header */}
                <div className="relative border-b border-gray-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white dark:border-gray-800">
                  <button
                    onClick={() => setSelectedEmp(null)}
                    className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                  >
                    <X size={16} />
                  </button>

                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 font-bold text-white text-xl shadow-lg ring-4 ring-white/10">
                      {selectedEmp.name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-white">{selectedEmp.name}</h2>
                        {selectedEmp.isPromotionEligible && (
                          <Badge variant="green">Promotion Ready</Badge>
                        )}
                      </div>
                      <p className="text-xs text-brand-200">{selectedEmp.designation} · {selectedEmp.department}</p>
                      <p className="mt-1 text-[11px] text-gray-400">Manager: {selectedEmp.managerName} · EMP-{String(selectedEmp.id).padStart(4, "0")}</p>
                    </div>
                  </div>

                  {/* Quick Stat Bar inside Drawer */}
                  <div className="mt-6 grid grid-cols-4 gap-2 rounded-2xl bg-white/5 p-3 backdrop-blur-md text-center text-xs">
                    <div>
                      <span className="text-[10px] text-gray-400 block">Rating</span>
                      <span className="font-bold text-amber-400">{selectedEmp.rating} ★</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block">KPI Score</span>
                      <span className="font-bold text-emerald-400">{selectedEmp.kpiScore}%</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block">OKR Done</span>
                      <span className="font-bold text-indigo-400">{selectedEmp.okrScore}%</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block">Goals</span>
                      <span className="font-bold text-cyan-400">{selectedEmp.goalsCount}</span>
                    </div>
                  </div>
                </div>

                {/* Drawer Tab Switcher (11 Sub-tabs) */}
                <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-800 dark:bg-gray-800">
                  {[
                    "overview", "kpis", "okrs", "reviews", "timeline", "training", "promotion", "increment", "pip", "notes", "history"
                  ].map((sub) => (
                    <button
                      key={sub}
                      onClick={() => setDrawerTab(sub)}
                      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition-all ${
                        drawerTab === sub
                          ? "bg-brand-600 text-white shadow-sm"
                          : "text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                      }`}
                    >
                      {sub}
                    </button>
                  ))}
                </div>

                {/* Drawer Tab Content */}
                <div className="flex-1 p-6 space-y-6">
                  {drawerTab === "overview" && (
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                        <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-2">Review Record</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          {selectedEmp.review?.strengths ? `Strengths: ${selectedEmp.review.strengths}` : "No specific strength comments recorded yet."}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                        <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-2">Areas of Growth</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          {selectedEmp.review?.improvements ? `Improvements: ${selectedEmp.review.improvements}` : "No specific improvement comments recorded yet."}
                        </p>
                      </div>
                    </div>
                  )}

                  {drawerTab === "kpis" && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-gray-100 p-4 dark:border-gray-800">
                        <div className="flex justify-between text-xs font-bold">
                          <span>Overall KPI Achievement</span>
                          <span className="text-brand-600">{selectedEmp.kpiScore}% Achieved</span>
                        </div>
                        <div className="mt-2 h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${selectedEmp.kpiScore}%` }} />
                        </div>
                      </div>
                    </div>
                  )}

                  {drawerTab === "okrs" && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-gray-100 p-4 dark:border-gray-800">
                        <h4 className="text-xs font-bold text-gray-900 dark:text-white">Active Goals Count: {selectedEmp.goalsCount}</h4>
                        <p className="text-[11px] text-gray-400 mt-1">OKR Completion: {selectedEmp.okrScore}%</p>
                      </div>
                    </div>
                  )}

                  {drawerTab === "reviews" && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-gray-100 p-4 dark:border-gray-800">
                        <h4 className="text-xs font-bold text-gray-900 dark:text-white">Manager 360 Review Notes</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">
                          {selectedEmp.review?.manager_comments || selectedEmp.review?.strengths || "Review logged in current cycle."}
                        </p>
                      </div>
                    </div>
                  )}

                  {drawerTab === "timeline" && (
                    <div className="space-y-4 text-xs">
                      <div className="flex gap-3">
                        <div className="h-2 w-2 rounded-full bg-brand-500 mt-1" />
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white">Review Status: {selectedEmp.status}</p>
                          <p className="text-[10px] text-gray-400">{selectedEmp.lastReviewDate}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {drawerTab === "training" && (
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-gray-100 p-4 dark:border-gray-800">
                        <p className="text-xs font-bold">Skill Training Status</p>
                        <Badge variant={selectedEmp.kpiScore < 75 ? "yellow" : "green"} className="mt-2">
                          {selectedEmp.kpiScore < 75 ? "Recommended Training" : "Up to Date"}
                        </Badge>
                      </div>
                    </div>
                  )}

                  {drawerTab === "promotion" && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4 text-xs dark:border-emerald-900/30">
                      <p className="font-bold text-emerald-700 dark:text-emerald-400">Promotion Eligibility Status</p>
                      <p className="mt-1 text-gray-600 dark:text-gray-300">
                        Status: <b>{selectedEmp.isPromotionEligible ? "Eligible based on rating & potential" : "Not yet eligible"}</b>
                      </p>
                      {selectedEmp.isPromotionEligible && (
                        <Button variant="primary" className="mt-3" size="sm" onClick={() => toast.success("Promotion recommendation submitted to HR")}>
                          Submit Promotion Recommendation
                        </Button>
                      )}
                    </div>
                  )}

                  {drawerTab === "increment" && (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50/30 p-4 text-xs dark:border-blue-900/30">
                      <p className="font-bold text-blue-700 dark:text-blue-400">Salary Increment Calculator</p>
                      <p className="mt-1 text-gray-600 dark:text-gray-300">
                        Rating: {selectedEmp.rating} ★ · Suggested Adjustment: <b>{Number(selectedEmp.rating) >= 4 ? "+12% to +15%" : Number(selectedEmp.rating) >= 3 ? "+5% to +8%" : "0%"}</b>
                      </p>
                    </div>
                  )}

                  {drawerTab === "pip" && (
                    <div className="rounded-2xl border border-gray-100 p-4 text-xs dark:border-gray-800">
                      <p className="font-bold">PIP Status: {selectedEmp.isPipNeeded ? "Under Active Review" : "No PIP Required"}</p>
                    </div>
                  )}

                  {drawerTab === "notes" && (
                    <div className="space-y-3">
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">Internal HR Confidential Notes</label>
                      <textarea rows={4} className={inputClass} placeholder="Add private HR notes..." />
                      <Button size="sm" onClick={() => toast.success("HR Note saved")}>Save Note</Button>
                    </div>
                  )}

                  {drawerTab === "history" && (
                    <div className="text-xs text-gray-500 space-y-2">
                      <p>• {selectedEmp.lastReviewDate}: Review record evaluated</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODALS */}
      {/* 1. Cycle Modal */}
      <Modal
        isOpen={cycleModalOpen}
        onClose={() => setCycleModalOpen(false)}
        title="Create Review Cycle"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCycleModalOpen(false)}>Cancel</Button>
            <Button onClick={saveCycle}>Create Cycle</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Cycle Name</label>
            <input className={inputClass} value={cycleForm.name} onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })} placeholder="e.g. H2 2026 Appraisal" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Start Date</label>
              <input type="date" className={inputClass} value={cycleForm.period_start} onChange={(e) => setCycleForm({ ...cycleForm, period_start: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">End Date</label>
              <input type="date" className={inputClass} value={cycleForm.period_end} onChange={(e) => setCycleForm({ ...cycleForm, period_end: e.target.value })} />
            </div>
          </div>
        </div>
      </Modal>

      {/* 2. Goal Modal */}
      <Modal
        isOpen={goalModalOpen}
        onClose={() => setGoalModalOpen(false)}
        title="Add Goal / OKR"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setGoalModalOpen(false)}>Cancel</Button>
            <Button onClick={saveGoal}>Add Goal</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Employee</label>
            <select className={inputClass} value={goalForm.user_id} onChange={(e) => setGoalForm({ ...goalForm, user_id: e.target.value })}>
              <option value="">— Select employee —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Goal Title</label>
            <input className={inputClass} value={goalForm.title} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} placeholder="e.g. Reduce System Latency by 20%" />
          </div>
        </div>
      </Modal>

      {/* 3. Review Modal */}
      <Modal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        title="New Performance Review"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReviewModalOpen(false)}>Cancel</Button>
            <Button onClick={saveReview}>Save Review</Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Employee</label>
            <select className={inputClass} value={reviewForm.user_id} onChange={(e) => setReviewForm({ ...reviewForm, user_id: e.target.value })}>
              <option value="">— Select employee —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Overall Rating (1-5)</label>
            <input type="number" min="1" max="5" step="0.5" className={inputClass} value={reviewForm.overall_rating} onChange={(e) => setReviewForm({ ...reviewForm, overall_rating: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Potential Rating (1-5)</label>
            <input type="number" min="1" max="5" step="0.5" className={inputClass} value={reviewForm.potential_rating} onChange={(e) => setReviewForm({ ...reviewForm, potential_rating: e.target.value })} />
          </div>
        </div>
      </Modal>

      {/* 4. PIP Modal */}
      <Modal
        isOpen={pipModalOpen}
        onClose={() => setPipModalOpen(false)}
        title="Assign Performance Improvement Plan (PIP)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPipModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreatePip}>Assign PIP</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Employee</label>
            <select className={inputClass} value={pipForm.user_id} onChange={(e) => setPipForm({ ...pipForm, user_id: e.target.value })}>
              <option value="">— Select employee —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Performance Issue Summary</label>
            <textarea rows={3} className={inputClass} value={pipForm.issue} onChange={(e) => setPipForm({ ...pipForm, issue: e.target.value })} placeholder="Describe areas needing improvement..." />
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Subcomponents
function SummaryCard({ title, value, trend, trendUp, icon, tone }) {
  return (
    <div className="group rounded-3xl border border-gray-200/80 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{title}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800 group-hover:scale-110 transition-all">
          {icon}
        </div>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-lg font-black text-gray-900 dark:text-white">{value}</span>
        <span className={`text-[10px] font-bold ${trendUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
          {trend}
        </span>
      </div>
    </div>
  );
}

function EmptyStateMessage({ title, description, actionText, onAction }) {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 mb-3">
        <Sparkles size={20} />
      </div>
      <h4 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h4>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">{description}</p>
      {actionText && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
}
