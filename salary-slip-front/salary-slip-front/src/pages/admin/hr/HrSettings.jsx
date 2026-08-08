import { useState, useEffect, useMemo, useRef } from "react";
import toast from "react-hot-toast";
import {
  Settings,
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
  Building2,
  FileCheck,
  Sparkles,
  Eye,
  Copy,
  CheckCircle2,
  FileSpreadsheet,
  Globe
} from "lucide-react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import { useAuth } from "../../../context/AuthContext";
import { rbacApi } from "../../../utils/api";

const inputClass =
  "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-xs font-semibold text-gray-900 dark:text-white placeholder-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all duration-150 outline-none";

const selectClass =
  "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none shadow-sm transition-all";

const STORAGE_KEY = "hr_settings_config_v1";

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

const AVAILABLE_TOKENS = [
  "{candidate_name}",
  "{employee_name}",
  "{role}",
  "{designation}",
  "{dept}",
  "{ctc}",
  "{revised_ctc}",
  "{joining_date}",
  "{tenure}"
];

export default function HrSettings() {
  const [activeTab, setActiveTab] = useState("general");
  const [searchQuery, setSearchQuery] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const fileInputRef = useRef(null);

  // States
  const { user } = useAuth();
  const [notifications, setNotifications] = useState(DEFAULT_NOTIFICATIONS);
  const [generalConfig, setGeneralConfig] = useState(DEFAULT_GENERAL);
  const [docTypes, setDocTypes] = useState(DEFAULT_DOC_TYPES);
  const [letterTemplates, setLetterTemplates] = useState(DEFAULT_TEMPLATES);

  // Indeed Integration Credentials State
  const [indeedClientId, setIndeedClientId] = useState("");
  const [indeedClientSecret, setIndeedClientSecret] = useState("");
  const [indeedEmployerId, setIndeedEmployerId] = useState("");
  const [savingIntegrations, setSavingIntegrations] = useState(false);

  useEffect(() => {
    if (!user?.accessToken) return;
    rbacApi.getSettings(user.accessToken, user.tokenType, "hr")
      .then((res) => {
        const data = res.data || [];
        setIndeedClientId(data.find((s) => s.key === "hr.indeed_client_id")?.value || "");
        setIndeedClientSecret(data.find((s) => s.key === "hr.indeed_client_secret")?.value || "");
        setIndeedEmployerId(data.find((s) => s.key === "hr.indeed_employer_id")?.value || "");
      })
      .catch(() => {});
  }, [user]);

  const saveIntegrations = async () => {
    setSavingIntegrations(true);
    try {
      const res = await rbacApi.updateSettings(
        [
          { key: "hr.indeed_client_id", value: indeedClientId.trim() },
          { key: "hr.indeed_client_secret", value: indeedClientSecret.trim() },
          { key: "hr.indeed_employer_id", value: indeedEmployerId.trim() },
        ],
        user?.accessToken, user?.tokenType, "hr"
      );
      if (res.status) {
        toast.success("Indeed API Credentials Saved!");
      }
    } catch (err) {
      toast.error(err.message || "Failed to save Indeed credentials");
    } finally {
      setSavingIntegrations(false);
    }
  };

  // Document Modal state
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocMandatory, setNewDocMandatory] = useState(true);
  const [newDocExpiry, setNewDocExpiry] = useState(false);
  const [newDocAllowed, setNewDocAllowed] = useState("PDF, JPG");

  // Template Create/Edit Modal state
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [editingTplId, setEditingTplId] = useState(null);
  const [tplName, setTplName] = useState("");
  const [tplCategory, setTplCategory] = useState("Hiring");
  const [tplVars, setTplVars] = useState("{candidate_name}, {role}");
  const [tplBody, setTplBody] = useState("");

  // Preview Modal state
  const [previewTpl, setPreviewTpl] = useState(null);
  const [sampleData, setSampleData] = useState({
    candidate_name: "Rahul Sharma",
    employee_name: "Rahul Sharma",
    role: "Senior Software Engineer",
    designation: "Senior Software Engineer",
    dept: "Engineering",
    ctc: "₹18,00,000 PA",
    revised_ctc: "₹22,00,000 PA",
    joining_date: "September 01, 2026",
    tenure: "2.5 Years"
  });

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
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
    setNotifications(DEFAULT_NOTIFICATIONS);
    setGeneralConfig(DEFAULT_GENERAL);
    setDocTypes(DEFAULT_DOC_TYPES);
    setLetterTemplates(DEFAULT_TEMPLATES);
    localStorage.removeItem(STORAGE_KEY);
    setHasUnsavedChanges(false);
    toast.success("Settings reset to factory defaults!");
  };

  // Export JSON
  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
      notifications,
      generalConfig,
      docTypes,
      letterTemplates
    }, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `hr_settings_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast.success("Configuration exported as JSON");
  };

  // Import JSON
  const handleImportJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.notifications) setNotifications(parsed.notifications);
        if (parsed.generalConfig) setGeneralConfig(parsed.generalConfig);
        if (parsed.docTypes) setDocTypes(parsed.docTypes);
        if (parsed.letterTemplates) setLetterTemplates(parsed.letterTemplates);
        setHasUnsavedChanges(true);
        toast.success("Configuration imported successfully!");
      } catch (err) {
        toast.error("Invalid configuration JSON file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Document Handlers
  const handleAddDocument = () => {
    if (!newDocName.trim()) {
      toast.error("Document name is required");
      return;
    }
    const newDoc = {
      id: newDocName.toLowerCase().replace(/\s+/g, "_") + "_" + Date.now(),
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
    toast.success("Document requirement updated!");
  };

  const handleDeleteDoc = (id) => {
    setDocTypes(docTypes.filter((d) => d.id !== id));
    setHasUnsavedChanges(true);
    toast.success("Document type removed!");
  };

  // Template Handlers
  const openCreateTplModal = () => {
    setEditingTplId(null);
    setTplName("");
    setTplCategory("Hiring");
    setTplVars("{candidate_name}, {role}, {ctc}, {joining_date}");
    setTplBody("");
    setTplModalOpen(true);
  };

  const openEditTplModal = (tpl) => {
    setEditingTplId(tpl.id);
    setTplName(tpl.name);
    setTplCategory(tpl.category);
    setTplVars(tpl.vars);
    setTplBody(tpl.body);
    setTplModalOpen(true);
  };

  const handleSaveTemplate = () => {
    if (!tplName.trim()) {
      toast.error("Template name is required");
      return;
    }
    if (!tplBody.trim()) {
      toast.error("Template body content is required");
      return;
    }

    if (editingTplId) {
      setLetterTemplates(letterTemplates.map((t) => (
        t.id === editingTplId
          ? { ...t, name: tplName.trim(), category: tplCategory, vars: tplVars, body: tplBody, updated: "Just now" }
          : t
      )));
      toast.success("Letter template updated!");
    } else {
      const newTpl = {
        id: Date.now().toString(),
        name: tplName.trim(),
        category: tplCategory,
        updated: "Just now",
        vars: tplVars,
        body: tplBody
      };
      setLetterTemplates([...letterTemplates, newTpl]);
      toast.success("Letter template created!");
    }

    setTplModalOpen(false);
    setHasUnsavedChanges(true);
  };

  const handleDeleteTemplate = (id) => {
    if (!window.confirm("Delete this letter template?")) return;
    setLetterTemplates(letterTemplates.filter((t) => t.id !== id));
    setHasUnsavedChanges(true);
    toast.success("Template removed!");
  };

  const handleCopyTemplate = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Template content copied to clipboard!");
  };

  const handleDownloadTemplate = (tpl) => {
    const textBlob = new Blob([tpl.body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(textBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${tpl.name.toLowerCase().replace(/\s+/g, "_")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Template file downloaded!");
  };

  const insertTokenIntoBody = (token) => {
    setTplBody((prev) => prev + " " + token);
    if (!tplVars.includes(token)) {
      setTplVars((prev) => (prev ? `${prev}, ${token}` : token));
    }
  };

  // Render preview body replaced with sample data
  const renderedPreviewBody = useMemo(() => {
    if (!previewTpl) return "";
    let body = previewTpl.body;
    Object.entries(sampleData).forEach(([key, val]) => {
      const regex = new RegExp(`\\{${key}\\}`, "g");
      body = body.replace(regex, val);
    });
    return body;
  }, [previewTpl, sampleData]);

  // Search filtering
  const filteredDocs = useMemo(
    () => docTypes.filter((d) => d.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [docTypes, searchQuery]
  );

  const filteredTpls = useMemo(
    () => letterTemplates.filter((t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.body.toLowerCase().includes(searchQuery.toLowerCase())
    ),
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
            Configure system rules, email triggers, document verification, and official letter templates.
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

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportJSON}
            accept=".json"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 shadow-xs"
            title="Import JSON Backup"
          >
            <Upload size={14} /> Import Config
          </button>

          <button
            onClick={handleExportJSON}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 shadow-xs"
          >
            <Download size={14} /> Export Config
          </button>
          <button
            onClick={handleResetDefaults}
            className="rounded-xl border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 shadow-xs"
            title="Reset Factory Defaults"
          >
            <RotateCcw size={15} />
          </button>
          <Button variant="primary" icon={<Save size={15} />} onClick={handleSaveAll}>
            Save Changes
          </Button>
        </div>
      </div>

      {/* SUMMARY METRIC CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Notifications" count={Object.values(notifications).filter(Boolean).length} status="Alerts Active" icon={<BellRing size={18} className="text-amber-500" />} />
        <SummaryCard title="Documents" count={docTypes.length} status="Verified" icon={<FileCheck size={18} className="text-emerald-500" />} />
        <SummaryCard title="Templates" count={letterTemplates.length} status="Merge Ready" icon={<FileText size={18} className="text-cyan-500" />} />
        <SummaryCard title="HR Parameters" count={9} status="Enforced" icon={<Building2 size={18} className="text-purple-500" />} />
      </div>

      {/* NAVIGATION TABS BAR */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800 pb-px">
        {[
          { id: "general", label: "General Config", icon: Building2 },
          { id: "notifications", label: "Notifications", icon: BellRing },
          { id: "documents", label: `Document Verification (${docTypes.length})`, icon: FileCheck },
          { id: "templates", label: `Letter Templates (${letterTemplates.length})`, icon: FileText },
          { id: "integrations", label: "Job Boards (Indeed)", icon: Globe }
        ].map((t) => {
          const IconComponent = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold transition-all ${
                isActive
                  ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400 font-bold"
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

        {/* TAB 2: NOTIFICATIONS */}
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
                <div key={item.key} className="flex items-center justify-between p-4 rounded-2xl border border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/40">
                  <div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white">{item.title}</p>
                    <p className="text-[11px] text-gray-400">{item.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications[item.key]}
                    onChange={(e) => {
                      setNotifications({ ...notifications, [item.key]: e.target.checked });
                      setHasUnsavedChanges(true);
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: DOCUMENT VERIFICATION */}
        {activeTab === "documents" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Document Verification Rules</h3>
                <p className="text-xs text-gray-400">Manage required onboarding & employee compliance documents</p>
              </div>
              <Button size="sm" icon={<Plus size={14} />} onClick={() => setDocModalOpen(true)}>Add Required Document</Button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredDocs.map((doc) => (
                <div key={doc.id} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white">{doc.name}</h4>
                    <button onClick={() => handleDeleteDoc(doc.id)} className="p-1 text-gray-400 hover:text-rose-600 rounded-lg">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={doc.mandatory ? "red" : "gray"}>
                      {doc.mandatory ? "Mandatory" : "Optional"}
                    </Badge>
                    {doc.expiryTracked && <Badge variant="amber">Expiry Tracked</Badge>}
                  </div>
                  <div className="text-[11px] text-gray-400 space-y-0.5 border-t border-gray-100 dark:border-gray-800 pt-2">
                    <p>Allowed formats: <span className="font-semibold text-gray-700 dark:text-gray-300">{doc.allowed}</span></p>
                    <p>Max file size: <span className="font-semibold text-gray-700 dark:text-gray-300">{doc.maxSize}</span></p>
                  </div>
                  <button
                    onClick={() => handleToggleDocMandatory(doc.id)}
                    className="w-full text-center text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline pt-1"
                  >
                    Toggle {doc.mandatory ? "Optional" : "Mandatory"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: LETTER TEMPLATES */}
        {activeTab === "templates" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Official Letter Templates</h3>
                <p className="text-xs text-gray-400">Manage dynamic variables and document templates for hiring, onboarding, and exit</p>
              </div>
              <Button size="sm" icon={<Plus size={14} />} onClick={openCreateTplModal}>Create Template</Button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {filteredTpls.map((tpl) => (
                <div key={tpl.id} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-brand-500" />
                      <h4 className="text-xs font-bold text-gray-900 dark:text-white">{tpl.name}</h4>
                    </div>
                    <Badge variant="purple">{tpl.category}</Badge>
                  </div>

                  <p className="text-[11px] font-mono text-brand-600 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-950/30 p-2 rounded-xl truncate">
                    {tpl.vars}
                  </p>

                  <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-3 bg-gray-50 dark:bg-gray-800/60 p-3 rounded-xl font-mono text-[11px]">
                    {tpl.body}
                  </p>

                  <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 pt-3 text-[11px]">
                    <span className="text-gray-400">Updated {tpl.updated}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPreviewTpl(tpl)}
                        className="flex items-center gap-1 font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                        title="Live Rendered Preview"
                      >
                        <Eye size={13} /> Preview
                      </button>
                      <button
                        onClick={() => openEditTplModal(tpl)}
                        className="p-1 text-gray-400 hover:text-brand-600 rounded-lg"
                        title="Edit Template"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleCopyTemplate(tpl.body)}
                        className="p-1 text-gray-400 hover:text-emerald-600 rounded-lg"
                        title="Copy Body Text"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={() => handleDownloadTemplate(tpl)}
                        className="p-1 text-gray-400 hover:text-cyan-600 rounded-lg"
                        title="Download .TXT File"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(tpl.id)}
                        className="p-1 text-gray-400 hover:text-rose-600 rounded-lg"
                        title="Delete Template"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: INTEGRATIONS */}
        {activeTab === "integrations" && (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Globe size={18} className="text-blue-600" /> Indeed Partner API Credentials
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Enter your Indeed Developer API keys here to enable 1-Click direct job posting from NISS HRMS to Indeed.
                </p>
              </div>
              <Button size="sm" icon={<Save size={14} />} onClick={saveIntegrations} disabled={savingIntegrations}>
                {savingIntegrations ? "Saving..." : "Save Indeed Keys"}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Indeed Client ID</label>
                <input
                  type="text"
                  placeholder="e.g. 1a2b3c4d-5e6f-7g8h"
                  value={indeedClientId}
                  onChange={(e) => setIndeedClientId(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Indeed Client Secret</label>
                <input
                  type="password"
                  placeholder="••••••••••••••••"
                  value={indeedClientSecret}
                  onChange={(e) => setIndeedClientSecret(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Indeed Employer ID</label>
                <input
                  type="text"
                  placeholder="e.g. emp_89271923"
                  value={indeedEmployerId}
                  onChange={(e) => setIndeedEmployerId(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/40 p-4 border border-blue-100 dark:border-blue-900/50 text-xs text-blue-800 dark:text-blue-200 flex items-start gap-3">
              <Sparkles size={16} className="text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">How Indeed Automated Job Sync Works:</p>
                <p className="mt-1 opacity-90">
                  Once saved, HR admins can click the <strong>"Indeed Post"</strong> button on any Approved Job Requisition in <strong>HR Management &gt; Hiring &gt; Job Requisitions</strong>. NISS HRMS will automatically push the job title, description, branch location, and salary to your Indeed Employer account!
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ADD DOCUMENT MODAL */}
      <Modal
        isOpen={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        title="Add Required Verification Document"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDocModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAddDocument}>Add Document</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Document Name</label>
            <input
              type="text"
              placeholder="e.g. Cancelled Cheque / Bank Passbook"
              value={newDocName}
              onChange={(e) => setNewDocName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
            <div>
              <p className="text-xs font-bold text-gray-900 dark:text-white">Mandatory Requirement</p>
              <p className="text-[11px] text-gray-400">Require candidates to upload before onboarding</p>
            </div>
            <input
              type="checkbox"
              checked={newDocMandatory}
              onChange={(e) => setNewDocMandatory(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
            <div>
              <p className="text-xs font-bold text-gray-900 dark:text-white">Expiry Tracking</p>
              <p className="text-[11px] text-gray-400">Track validity and expiration dates</p>
            </div>
            <input
              type="checkbox"
              checked={newDocExpiry}
              onChange={(e) => setNewDocExpiry(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
          </div>
        </div>
      </Modal>

      {/* CREATE / EDIT TEMPLATE MODAL */}
      <Modal
        isOpen={tplModalOpen}
        onClose={() => setTplModalOpen(false)}
        title={editingTplId ? "Edit Letter Template" : "Create Official Letter Template"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTplModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTemplate}>{editingTplId ? "Update Template" : "Create Template"}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Template Name</label>
            <input
              type="text"
              placeholder="e.g. Internship Completion Letter"
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Category</label>
            <select className={selectClass} value={tplCategory} onChange={(e) => setTplCategory(e.target.value)}>
              <option value="Hiring">Hiring</option>
              <option value="Onboarding">Onboarding</option>
              <option value="Exit">Exit</option>
              <option value="Performance">Performance</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Available Token Chips (Click to insert)</label>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_TOKENS.map((tok) => (
                <button
                  type="button"
                  key={tok}
                  onClick={() => insertTokenIntoBody(tok)}
                  className="rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400 text-[11px] font-mono font-bold px-2 py-1 transition-all"
                >
                  + {tok}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Letter Body Content</label>
            <textarea
              rows={6}
              placeholder="Enter letter template text with dynamic placeholders..."
              value={tplBody}
              onChange={(e) => setTplBody(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </Modal>

      {/* PREVIEW TEMPLATE MODAL WITH LIVE TEST DATA */}
      {previewTpl && (
        <Modal
          isOpen={!!previewTpl}
          onClose={() => setPreviewTpl(null)}
          title={`Live Template Preview — ${previewTpl.name}`}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => handleCopyTemplate(renderedPreviewBody)} icon={<Copy size={14} />}>Copy Output</Button>
              <Button variant="secondary" onClick={() => setPreviewTpl(null)}>Close</Button>
            </div>
          }
        >
          <div className="space-y-4 font-sans">
            <div className="flex items-center justify-between">
              <Badge variant="purple">{previewTpl.category}</Badge>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">✓ Merged & Validated</span>
            </div>

            {/* Test Variable Controls */}
            <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3.5 dark:border-gray-800 dark:bg-gray-800/40 space-y-2">
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Live Test Data Overrides</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-gray-400">Name</span>
                  <input
                    type="text"
                    value={sampleData.candidate_name}
                    onChange={(e) => setSampleData({ ...sampleData, candidate_name: e.target.value, employee_name: e.target.value })}
                    className="w-full rounded-lg border px-2 py-1 text-xs dark:bg-gray-700"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-gray-400">Role</span>
                  <input
                    type="text"
                    value={sampleData.role}
                    onChange={(e) => setSampleData({ ...sampleData, role: e.target.value, designation: e.target.value })}
                    className="w-full rounded-lg border px-2 py-1 text-xs dark:bg-gray-700"
                  />
                </div>
              </div>
            </div>

            {/* Live Rendered Output */}
            <div className="p-5 rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 font-mono text-xs whitespace-pre-wrap text-gray-900 dark:text-gray-100 leading-relaxed shadow-inner">
              {renderedPreviewBody}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SummaryCard({ title, count, status, icon }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800 dark:bg-gray-900 flex items-center justify-between">
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">{count}</p>
        <span className="inline-block text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-1">{status}</span>
      </div>
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
        {icon}
      </div>
    </div>
  );
}
