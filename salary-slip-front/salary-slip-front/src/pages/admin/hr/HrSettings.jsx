import { useState, useEffect, useMemo } from "react";
import toast from "react-hot-toast";
import {
  Settings,
  Settings2,
  ShieldAlert,
  BellRing,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  Download,
  Upload,
  RotateCcw,
  Save,
  FileText,
  Layers,
  Zap,
  UserCheck,
  Sparkles,
  Clock,
  Lock,
  FileCheck,
  Eye,
  Building2,
  Shield,
  Workflow,
  CheckCircle2,
  ArrowRight
} from "lucide-react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";

const inputClass =
  "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-xs font-semibold text-gray-900 dark:text-white placeholder-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all duration-150 outline-none";

const selectClass =
  "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none shadow-sm transition-all";

const STORAGE_KEY = "hr_settings_config_v1";

const DEFAULT_STAGES = [
  { id: 1, name: "Screening", code: "screening", active: true, color: "blue", candidateCount: 14 },
  { id: 2, name: "Technical Interview", code: "tech_interview", active: true, color: "indigo", candidateCount: 8 },
  { id: 3, name: "Managerial Round", code: "managerial", active: true, color: "purple", candidateCount: 5 },
  { id: 4, name: "HR Interview", code: "hr_interview", active: true, color: "pink", candidateCount: 3 },
  { id: 5, name: "Offer Extended", code: "offer", active: true, color: "emerald", candidateCount: 2 }
];

const DEFAULT_APPROVALS = {
  requisitions: "hr_manager",
  offers: "super_admin",
  exitRequests: "hr_manager",
  leave: "manager",
  promotion: "two_tier",
  increment: "two_tier"
};

const DEFAULT_NOTIFICATIONS = {
  onNewRequisition: true,
  onOfferAccepted: true,
  onInterviewScheduled: true,
  onCandidateApply: false,
  onExitRequested: true,
  onDocumentSubmitted: true
};

const DEFAULT_GENERAL = {
  probationDays: "90",
  defaultNoticeDays: "30",
  workingDaysPerWeek: "5",
  defaultShift: "09:00 AM - 06:00 PM",
  autoEmpIdPrefix: "EMP-2026-",
  reviewCycle: "Annual",
  joiningChecklist: true,
  enableExitDesk: true,
  enableAssetTracking: true
};

const DEFAULT_DOC_TYPES = [
  { id: "aadhaar", name: "Aadhaar Card", mandatory: true, expiryTracked: false, allowed: "PDF, JPG, PNG", maxSize: "5 MB" },
  { id: "pan", name: "PAN Card", mandatory: true, expiryTracked: false, allowed: "PDF, JPG, PNG", maxSize: "5 MB" },
  { id: "passport", name: "Passport", mandatory: false, expiryTracked: true, allowed: "PDF", maxSize: "10 MB" },
  { id: "driving", name: "Driving License", mandatory: false, expiryTracked: true, allowed: "PDF, JPG", maxSize: "5 MB" },
  { id: "education", name: "Degree Certificates", mandatory: true, expiryTracked: false, allowed: "PDF", maxSize: "10 MB" },
  { id: "experience", name: "Relieving & Experience Letters", mandatory: true, expiryTracked: false, allowed: "PDF", maxSize: "10 MB" }
];

const DEFAULT_TEMPLATES = [
  {
    id: "offer",
    name: "Standard Offer Letter",
    category: "Hiring",
    updated: "Aug 02, 2026",
    vars: "{candidate_name}, {role}, {ctc}, {joining_date}",
    body: "Dear {candidate_name},\n\nWe are pleased to offer you the position of {role} with an annual CTC of {ctc}. Your tentative joining date will be {joining_date}.\n\nWelcome aboard!\nHR Department"
  },
  {
    id: "appointment",
    name: "Appointment Letter",
    category: "Onboarding",
    updated: "Jul 28, 2026",
    vars: "{employee_name}, {dept}, {designation}",
    body: "Dear {employee_name},\n\nThis is your formal appointment letter as {designation} in the {dept} department.\n\nRegards,\nManagement"
  },
  {
    id: "experience",
    name: "Experience Certificate",
    category: "Exit",
    updated: "Jun 14, 2026",
    vars: "{employee_name}, {tenure}, {designation}",
    body: "To Whom It May Concern,\n\nThis is to certify that {employee_name} served as {designation} for a tenure of {tenure}.\n\nHR Team"
  },
  {
    id: "promotion",
    name: "Promotion & Band Revision",
    category: "Performance",
    updated: "May 10, 2026",
    vars: "{employee_name}, {new_role}, {revised_ctc}",
    body: "Dear {employee_name},\n\nCongratulations! You have been promoted to {new_role} with a revised annual CTC of {revised_ctc}.\n\nLeadership Team"
  }
];

export default function HrSettings() {
  const [activeTab, setActiveTab] = useState("general");
  const [searchQuery, setSearchQuery] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // States
  const [stages, setStages] = useState(DEFAULT_STAGES);
  const [approvalRules, setApprovalRules] = useState(DEFAULT_APPROVALS);
  const [notifications, setNotifications] = useState(DEFAULT_NOTIFICATIONS);
  const [generalConfig, setGeneralConfig] = useState(DEFAULT_GENERAL);
  const [docTypes, setDocTypes] = useState(DEFAULT_DOC_TYPES);
  const [letterTemplates, setLetterTemplates] = useState(DEFAULT_TEMPLATES);

  // Stage editing & modals
  const [newStageName, setNewStageName] = useState("");
  const [editingStageId, setEditingStageId] = useState(null);
  const [editingStageName, setEditingStageName] = useState("");

  // Modals state
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocMandatory, setNewDocMandatory] = useState(true);
  const [newDocExpiry, setNewDocExpiry] = useState(false);
  const [newDocAllowed, setNewDocAllowed] = useState("PDF, JPG");

  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [newTplName, setNewTplName] = useState("");
  const [newTplCategory, setNewTplCategory] = useState("Hiring");
  const [newTplVars, setNewTplVars] = useState("{employee_name}, {designation}");
  const [newTplBody, setNewTplBody] = useState("");

  const [previewTpl, setPreviewTpl] = useState(null);

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.stages) setStages(parsed.stages);
        if (parsed.approvalRules) setApprovalRules(parsed.approvalRules);
        if (parsed.notifications) setNotifications(parsed.notifications);
        if (parsed.generalConfig) setGeneralConfig(parsed.generalConfig);
        if (parsed.docTypes) setDocTypes(parsed.docTypes);
        if (parsed.letterTemplates) setLetterTemplates(parsed.letterTemplates);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  }, []);

  // Save all settings to localStorage
  const handleSaveAll = () => {
    try {
      const payload = {
        stages,
        approvalRules,
        notifications,
        generalConfig,
        docTypes,
        letterTemplates
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setHasUnsavedChanges(false);
      toast.success("All HR Settings successfully saved!");
    } catch (err) {
      toast.error("Failed to save configuration");
    }
  };

  // Reset defaults
  const handleResetDefaults = () => {
    if (!window.confirm("Reset all HR Settings to factory defaults?")) return;
    setStages(DEFAULT_STAGES);
    setApprovalRules(DEFAULT_APPROVALS);
    setNotifications(DEFAULT_NOTIFICATIONS);
    setGeneralConfig(DEFAULT_GENERAL);
    setDocTypes(DEFAULT_DOC_TYPES);
    setLetterTemplates(DEFAULT_TEMPLATES);
    localStorage.removeItem(STORAGE_KEY);
    setHasUnsavedChanges(false);
    toast.success("All settings reset to defaults.");
  };

  // Export JSON file
  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
      stages, approvalRules, notifications, generalConfig, docTypes, letterTemplates
    }, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `hr-settings-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast.success("Configuration exported successfully!");
  };

  // Stage Handlers
  const handleAddStage = (e) => {
    e.preventDefault();
    if (!newStageName.trim()) return;
    const code = newStageName.toLowerCase().replace(/\s+/g, "_");
    if (stages.some((s) => s.code === code)) {
      toast.error("A stage with this name or code already exists.");
      return;
    }
    const colors = ["blue", "indigo", "purple", "pink", "amber", "emerald", "teal"];
    setStages([
      ...stages,
      {
        id: Date.now(),
        name: newStageName.trim(),
        code,
        active: true,
        color: colors[Math.floor(Math.random() * colors.length)],
        candidateCount: 0
      }
    ]);
    setNewStageName("");
    setHasUnsavedChanges(true);
    toast.success("Hiring stage created!");
  };

  const handleStartEditStage = (stage) => {
    setEditingStageId(stage.id);
    setEditingStageName(stage.name);
  };

  const handleSaveEditStage = (id) => {
    if (!editingStageName.trim()) return;
    setStages(stages.map((s) => (s.id === id ? { ...s, name: editingStageName.trim() } : s)));
    setEditingStageId(null);
    setEditingStageName("");
    setHasUnsavedChanges(true);
    toast.success("Stage updated!");
  };

  const handleToggleStage = (id) => {
    setStages(stages.map((s) => (s.id === id ? { ...s, active: !s.active } : s)));
    setHasUnsavedChanges(true);
    toast.success("Stage visibility toggled!");
  };

  const handleDeleteStage = (id) => {
    if (stages.length <= 1) {
      toast.error("At least one stage is required.");
      return;
    }
    setStages(stages.filter((s) => s.id !== id));
    setHasUnsavedChanges(true);
    toast.success("Stage deleted!");
  };

  // Document Handlers
  const handleAddDocument = () => {
    if (!newDocName.trim()) {
      toast.error("Document name is required");
      return;
    }
    const newDoc = {
      id: newDocName.toLowerCase().replace(/\s+/g, "_"),
      name: newDocName.trim(),
      mandatory: newDocMandatory,
      expiryTracked: newDocExpiry,
      allowed: newDocAllowed,
      maxSize: "5 MB"
    };
    setDocTypes([...docTypes, newDoc]);
    setDocModalOpen(false);
    setNewDocName("");
    setHasUnsavedChanges(true);
    toast.success("Document verification rule added!");
  };

  const handleToggleDocMandatory = (id) => {
    setDocTypes(docTypes.map((d) => (d.id === id ? { ...d, mandatory: !d.mandatory } : d)));
    setHasUnsavedChanges(true);
  };

  const handleDeleteDoc = (id) => {
    setDocTypes(docTypes.filter((d) => d.id !== id));
    setHasUnsavedChanges(true);
    toast.success("Document type removed!");
  };

  // Template Handlers
  const handleAddTemplate = () => {
    if (!newTplName.trim()) {
      toast.error("Template name is required");
      return;
    }
    const newTpl = {
      id: Date.now().toString(),
      name: newTplName.trim(),
      category: newTplCategory,
      updated: "Just now",
      vars: newTplVars,
      body: newTplBody || `Sample body for ${newTplName}`
    };
    setLetterTemplates([...letterTemplates, newTpl]);
    setTplModalOpen(false);
    setNewTplName("");
    setNewTplBody("");
    setHasUnsavedChanges(true);
    toast.success("Letter template created!");
  };

  const handleDeleteTemplate = (id) => {
    setLetterTemplates(letterTemplates.filter((t) => t.id !== id));
    setHasUnsavedChanges(true);
    toast.success("Template removed!");
  };

  // Search filtering
  const filteredStages = useMemo(
    () => stages.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [stages, searchQuery]
  );

  const filteredDocs = useMemo(
    () => docTypes.filter((d) => d.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [docTypes, searchQuery]
  );

  const filteredTpls = useMemo(
    () => letterTemplates.filter((t) => t.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [letterTemplates, searchQuery]
  );

  return (
    <div className="space-y-6 pb-24 font-sans text-gray-900 dark:text-gray-100">
      {/* TOP HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white">
              HR Administration Center
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400 border border-brand-500/20">
              <Sparkles size={13} /> Live System Config
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Configure pipeline stages, multi-level approvals, email triggers, document verification, and official letter templates.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search setting..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50/50 py-2 pl-9 pr-3 text-xs text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:bg-white focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <button
            onClick={handleExportJSON}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 shadow-xs"
          >
            <Download size={14} /> Export Config
          </button>
          <button
            onClick={handleResetDefaults}
            className="rounded-xl border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 shadow-xs"
            title="Reset Defaults"
          >
            <RotateCcw size={15} />
          </button>
          <Button variant="primary" icon={<Save size={15} />} onClick={handleSaveAll}>
            Save Changes
          </Button>
        </div>
      </div>

      {/* SUMMARY METRIC CARDS (6 CARDS GRID) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryCard title="Hiring Stages" count={stages.length} status="Active" icon={<Workflow size={18} className="text-brand-500" />} />
        <SummaryCard title="Approvals" count={Object.keys(approvalRules).length} status="Configured" icon={<ShieldAlert size={18} className="text-indigo-500" />} />
        <SummaryCard title="Notifications" count={Object.values(notifications).filter(Boolean).length} status="Alerts Active" icon={<BellRing size={18} className="text-amber-500" />} />
        <SummaryCard title="Documents" count={docTypes.length} status="Verified" icon={<FileCheck size={18} className="text-emerald-500" />} />
        <SummaryCard title="Templates" count={letterTemplates.length} status="Merge Ready" icon={<FileText size={18} className="text-cyan-500" />} />
        <SummaryCard title="HR Parameters" count={9} status="Enforced" icon={<Building2 size={18} className="text-purple-500" />} />
      </div>

      {/* 6 NAVIGATION TABS BAR */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800 pb-px">
        {[
          { id: "general", label: "General Config", icon: Building2 },
          { id: "stages", label: `Hiring Workflow (${stages.length})`, icon: Workflow },
          { id: "approvals", label: "Approval Chains", icon: ShieldAlert },
          { id: "notifications", label: "Notifications", icon: BellRing },
          { id: "documents", label: `Document Verification (${docTypes.length})`, icon: FileCheck },
          { id: "templates", label: `Letter Templates (${letterTemplates.length})`, icon: FileText }
        ].map((t) => {
          const IconComponent = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold transition-all ${
                isActive
                  ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              <IconComponent size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT PANELS */}
      <div className="space-y-6">
        {/* TAB 1: GENERAL CONFIG */}
        {activeTab === "general" && (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-6">
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Building2 size={18} className="text-brand-500" /> Company HR Parameters
            </h3>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Probation Period (Days)</label>
                <input
                  className={inputClass}
                  value={generalConfig.probationDays}
                  onChange={(e) => { setGeneralConfig({ ...generalConfig, probationDays: e.target.value }); setHasUnsavedChanges(true); }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Default Notice Period (Days)</label>
                <input
                  className={inputClass}
                  value={generalConfig.defaultNoticeDays}
                  onChange={(e) => { setGeneralConfig({ ...generalConfig, defaultNoticeDays: e.target.value }); setHasUnsavedChanges(true); }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Working Days Per Week</label>
                <select
                  className={selectClass}
                  value={generalConfig.workingDaysPerWeek}
                  onChange={(e) => { setGeneralConfig({ ...generalConfig, workingDaysPerWeek: e.target.value }); setHasUnsavedChanges(true); }}
                >
                  <option value="5">5 Days (Mon-Fri)</option>
                  <option value="6">6 Days (Mon-Sat)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Default Shift Hours</label>
                <input
                  className={inputClass}
                  value={generalConfig.defaultShift}
                  onChange={(e) => { setGeneralConfig({ ...generalConfig, defaultShift: e.target.value }); setHasUnsavedChanges(true); }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Auto Employee ID Format</label>
                <input
                  className={inputClass}
                  value={generalConfig.autoEmpIdPrefix}
                  onChange={(e) => { setGeneralConfig({ ...generalConfig, autoEmpIdPrefix: e.target.value }); setHasUnsavedChanges(true); }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Default Review Cycle</label>
                <select
                  className={selectClass}
                  value={generalConfig.reviewCycle}
                  onChange={(e) => { setGeneralConfig({ ...generalConfig, reviewCycle: e.target.value }); setHasUnsavedChanges(true); }}
                >
                  <option value="Annual">Annual (H1 + H2)</option>
                  <option value="Quarterly">Quarterly (Q1-Q4)</option>
                </select>
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 pt-6 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Module Toggles</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { key: "joiningChecklist", label: "Automated Joining Checklist", desc: "Guide new hires through document upload steps" },
                  { key: "enableExitDesk", label: "Exit Desk & Clearances", desc: "Manage resignations and clearance workflows" },
                  { key: "enableAssetTracking", label: "IT Asset Allocation Desk", desc: "Track laptops, phones, and hardware credentials" }
                ].map((mod) => (
                  <div key={mod.key} className="flex items-center justify-between p-4 rounded-2xl border border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/40">
                    <div>
                      <p className="text-xs font-bold text-gray-900 dark:text-white">{mod.label}</p>
                      <p className="text-[11px] text-gray-400">{mod.desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={generalConfig[mod.key]}
                      onChange={(e) => { setGeneralConfig({ ...generalConfig, [mod.key]: e.target.checked }); setHasUnsavedChanges(true); }}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: HIRING WORKFLOW STAGES */}
        {activeTab === "stages" && (
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-8 space-y-4">
              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">Active Recruitment Pipeline Stages</h3>
                    <p className="text-xs text-gray-400">Configure recruitment funnel stages</p>
                  </div>
                  <Badge variant="blue">{filteredStages.filter((s) => s.active).length} Active</Badge>
                </div>

                <div className="space-y-3">
                  {filteredStages.map((stage, idx) => (
                    <div
                      key={stage.id}
                      className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                        stage.active
                          ? "bg-gray-50/60 border-gray-200/80 dark:bg-gray-800/40 dark:border-gray-800"
                          : "bg-gray-50/20 border-gray-100 opacity-60 dark:bg-gray-800/10 dark:border-gray-800/40"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-brand-500/10 text-xs font-bold text-brand-600 dark:text-brand-400">
                          {idx + 1}
                        </span>

                        {editingStageId === stage.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editingStageName}
                              onChange={(e) => setEditingStageName(e.target.value)}
                              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-500 text-gray-900 dark:text-white"
                              autoFocus
                            />
                            <button onClick={() => handleSaveEditStage(stage.id)} className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg">
                              <Check size={16} />
                            </button>
                            <button onClick={() => setEditingStageId(null)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg">
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gray-900 dark:text-white">{stage.name}</span>
                              <Badge variant="purple">{stage.candidateCount || 0} Candidates</Badge>
                            </div>
                            <span className="text-[10px] font-mono text-gray-400 uppercase">{stage.code}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleStage(stage.id)}
                          className={`text-[11px] px-3 py-1 rounded-xl border font-bold transition-all ${
                            stage.active
                              ? "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/20"
                              : "text-gray-400 bg-gray-100 border-gray-200 dark:text-gray-500 dark:bg-gray-800"
                          }`}
                        >
                          {stage.active ? "Active" : "Disabled"}
                        </button>
                        <button onClick={() => handleStartEditStage(stage)} className="p-2 text-gray-400 hover:text-brand-600 rounded-lg">
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => handleDeleteStage(stage.id)} className="p-2 text-gray-400 hover:text-rose-600 rounded-lg">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Add Custom Stage Form */}
            <div className="col-span-12 lg:col-span-4">
              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Add Custom Stage</h3>
                <form onSubmit={handleAddStage} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Stage Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Executive Board Round"
                      value={newStageName}
                      onChange={(e) => setNewStageName(e.target.value)}
                      className={inputClass}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" icon={<Plus size={15} />}>
                    Create Stage
                  </Button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: APPROVAL CHAINS */}
        {activeTab === "approvals" && (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Central Approval Chain Builder</h3>
                <p className="text-xs text-gray-400">Configure multi-level approval hierarchies across all HR modules</p>
              </div>
              <Button size="sm" onClick={() => { handleSaveAll(); toast.success("Approval chains updated!"); }}>Save Approvals</Button>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {[
                { key: "requisitions", title: "Job Requisition Approval", desc: "Authority required to open new job requisitions" },
                { key: "offers", title: "Candidate Offer Approval", desc: "Authority required to issue official candidate offer letters" },
                { key: "exitRequests", title: "Separation & Resignation Approval", desc: "Authority required to process exit requests" },
                { key: "leave", title: "Leave Request Approval", desc: "Authority required for annual leave requests" },
                { key: "promotion", title: "Promotion & Designation Revision", desc: "Authority required for band promotions" },
                { key: "increment", title: "Salary Increment Approval", desc: "Authority required for CTC revisions" }
              ].map((app) => (
                <div key={app.key} className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-800/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white">{app.title}</h4>
                    <Badge variant="purple">Multi-Level</Badge>
                  </div>
                  <p className="text-[11px] text-gray-400">{app.desc}</p>
                  <select
                    value={approvalRules[app.key] || "hr_manager"}
                    onChange={(e) => { setApprovalRules({ ...approvalRules, [app.key]: e.target.value }); setHasUnsavedChanges(true); }}
                    className={selectClass}
                  >
                    <option value="hr_manager">HR Manager Only</option>
                    <option value="super_admin">Super Administrator Approval</option>
                    <option value="two_tier">Two-Tier (HR Manager & Super Admin)</option>
                    <option value="three_tier">Three-Tier (Manager → HR → Super Admin)</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: NOTIFICATIONS */}
        {activeTab === "notifications" && (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-6">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Email & System Notification Triggers</h3>
              <p className="text-xs text-gray-400">Toggle automated event notifications</p>
            </div>

            <div className="space-y-3">
              {[
                { key: "onNewRequisition", title: "New Requisition Submitted", desc: "Alert Super Admins when a manager requests a new headcount position" },
                { key: "onOfferAccepted", title: "Candidate Offer Accepted", desc: "Notify HR & Hiring Manager when a candidate accepts an offer" },
                { key: "onInterviewScheduled", title: "Interview Scheduling Confirmation", desc: "Send calendar invite & SMS reminder to candidate and panel" },
                { key: "onCandidateApply", title: "New Applicant Alert", desc: "Send immediate notification to recruiter upon application submission" },
                { key: "onExitRequested", title: "Resignation Request Alert", desc: "Notify HR Manager when an employee submits an exit request" },
                { key: "onDocumentSubmitted", title: "Onboarding Document Uploaded", desc: "Alert HR team when candidate uploads verification documents" }
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-4 rounded-2xl border border-gray-100 bg-gray-50/40 dark:border-gray-800 dark:bg-gray-800/40">
                  <div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white">{item.title}</p>
                    <p className="text-[11px] text-gray-400">{item.desc}</p>
                  </div>
                  <button
                    onClick={() => { setNotifications({ ...notifications, [item.key]: !notifications[item.key] }); setHasUnsavedChanges(true); }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      notifications[item.key] ? "bg-brand-600" : "bg-gray-300 dark:bg-gray-700"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notifications[item.key] ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: DOCUMENTS */}
        {activeTab === "documents" && (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Document Verification Policy</h3>
                <p className="text-xs text-gray-400">Configure mandatory documents and verification parameters</p>
              </div>
              <Button size="sm" icon={<Plus size={15} />} onClick={() => setDocModalOpen(true)}>
                Add Document Rule
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredDocs.map((doc) => (
                <div key={doc.id} className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-800/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white">{doc.name}</h4>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleToggleDocMandatory(doc.id)}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-lg border hover:opacity-80 transition-all"
                      >
                        <Badge variant={doc.mandatory ? "red" : "gray"}>{doc.mandatory ? "Mandatory" : "Optional"}</Badge>
                      </button>
                      <button onClick={() => handleDeleteDoc(doc.id)} className="p-1 text-gray-400 hover:text-rose-600 rounded">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="text-[11px] text-gray-400 space-y-1">
                    <p>Allowed Formats: <b>{doc.allowed}</b></p>
                    <p>Max Size: <b>{doc.maxSize}</b></p>
                    <p>Expiry Tracked: <b>{doc.expiryTracked ? "Yes" : "No"}</b></p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: TEMPLATES */}
        {activeTab === "templates" && (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Official Letter & Document Templates</h3>
                <p className="text-xs text-gray-400">Merge variables for auto-generated letters</p>
              </div>
              <Button size="sm" icon={<Plus size={15} />} onClick={() => setTplModalOpen(true)}>
                Add Template
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {filteredTpls.map((tpl) => (
                <div key={tpl.id} className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-800/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-gray-900 dark:text-white">{tpl.name}</h4>
                      <p className="text-[10px] text-gray-400">Category: {tpl.category} · {tpl.updated}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="xs" variant="secondary" icon={<Eye size={13} />} onClick={() => setPreviewTpl(tpl)}>
                        Preview
                      </Button>
                      <button onClick={() => handleDeleteTemplate(tpl.id)} className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-gray-800 p-2.5 text-[11px] font-mono text-brand-600 dark:text-brand-400 border border-gray-200/60 dark:border-gray-700">
                    Variables: {tpl.vars}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: ADD DOCUMENT RULE */}
      <Modal isOpen={docModalOpen} onClose={() => setDocModalOpen(false)} title="Add Document Verification Rule">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Document Name</label>
            <input className={inputClass} placeholder="e.g. Passport Photograph" value={newDocName} onChange={(e) => setNewDocName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Allowed Extensions</label>
            <input className={inputClass} placeholder="e.g. PDF, JPG, PNG" value={newDocAllowed} onChange={(e) => setNewDocAllowed(e.target.value)} />
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Is Mandatory for Onboarding?</span>
            <input type="checkbox" checked={newDocMandatory} onChange={(e) => setNewDocMandatory(e.target.checked)} className="h-4 w-4 rounded text-brand-600" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Track Expiry Date?</span>
            <input type="checkbox" checked={newDocExpiry} onChange={(e) => setNewDocExpiry(e.target.checked)} className="h-4 w-4 rounded text-brand-600" />
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDocModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAddDocument}>Add Rule</Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 2: ADD LETTER TEMPLATE */}
      <Modal isOpen={tplModalOpen} onClose={() => setTplModalOpen(false)} title="Create Official Letter Template">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Template Title</label>
            <input className={inputClass} placeholder="e.g. Probation Confirmation Letter" value={newTplName} onChange={(e) => setNewTplName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Category</label>
            <select className={selectClass} value={newTplCategory} onChange={(e) => setNewTplCategory(e.target.value)}>
              <option value="Hiring">Hiring</option>
              <option value="Onboarding">Onboarding</option>
              <option value="Performance">Performance</option>
              <option value="Exit">Exit</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Merge Variables</label>
            <input className={inputClass} value={newTplVars} onChange={(e) => setNewTplVars(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Letter Body Content</label>
            <textarea rows={5} className={inputClass} placeholder="Enter letter text with merge tags..." value={newTplBody} onChange={(e) => setNewTplBody(e.target.value)} />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTplModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAddTemplate}>Create Template</Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 3: PREVIEW LETTER TEMPLATE */}
      <Modal isOpen={!!previewTpl} onClose={() => setPreviewTpl(null)} title={previewTpl?.name || "Template Preview"}>
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 border border-gray-200 dark:border-gray-700 whitespace-pre-wrap font-mono text-xs text-gray-800 dark:text-gray-200">
            {previewTpl?.body || "Template content sample..."}
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setPreviewTpl(null)}>Close Preview</Button>
          </div>
        </div>
      </Modal>

      {/* STICKY FOOTER SAVE BAR (WHEN UNSAVED CHANGES EXIST) */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 rounded-2xl border border-brand-500/30 bg-slate-900/90 px-6 py-3.5 text-white shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-400 animate-ping" />
            <span className="text-xs font-bold">You have unsaved configuration changes</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHasUnsavedChanges(false)}
              className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
            >
              Discard
            </button>
            <Button size="sm" onClick={handleSaveAll}>
              Save All Changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponents
function SummaryCard({ title, count, status, icon }) {
  return (
    <div className="rounded-3xl border border-gray-200/80 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{title}</span>
        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800">{icon}</div>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-base font-black text-gray-900 dark:text-white">{count}</span>
        <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">{status}</span>
      </div>
    </div>
  );
}
