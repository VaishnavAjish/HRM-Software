import { useState } from "react";
import toast from "react-hot-toast";
import { Settings, Settings2, ShieldAlert, BellRing, Plus, Trash2, Edit2, Check, X } from "lucide-react";
import Button from "../../../components/ui/Button";

export default function HrSettings() {
  const [activeTab, setActiveTab] = useState("stages");

  // Hiring Stages State
  const [stages, setStages] = useState([
    { id: 1, name: "Screening", code: "screening", active: true, color: "blue" },
    { id: 2, name: "Technical Interview", code: "tech_interview", active: true, color: "indigo" },
    { id: 3, name: "Managerial Round", code: "managerial", active: true, color: "purple" },
    { id: 4, name: "HR Interview", code: "hr_interview", active: true, color: "pink" },
    { id: 5, name: "Offer Extended", code: "offer", active: true, color: "yellow" },
  ]);
  const [newStageName, setNewStageName] = useState("");
  const [editingStageId, setEditingStageId] = useState(null);
  const [editingStageName, setEditingStageName] = useState("");

  // Approval Chains State
  const [approvalRules, setApprovalRules] = useState({
    requisitions: "hr_manager", // hr_manager | super_admin | two_tier
    offers: "super_admin",
    exitRequests: "hr_manager",
  });

  // Notification Rules State
  const [notifications, setNotifications] = useState({
    onNewRequisition: true,
    onOfferAccepted: true,
    onInterviewScheduled: true,
    onCandidateApply: false,
    onExitRequested: true,
  });

  const handleAddStage = (e) => {
    e.preventDefault();
    if (!newStageName.trim()) return;
    const code = newStageName.toLowerCase().replace(/\s+/g, "_");
    if (stages.some(s => s.code === code)) {
      toast.error("A stage with this name or code already exists.");
      return;
    }
    const colors = ["blue", "indigo", "purple", "pink", "yellow", "green", "teal"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    setStages([
      ...stages,
      {
        id: Date.now(),
        name: newStageName.trim(),
        code,
        active: true,
        color: randomColor
      }
    ]);
    setNewStageName("");
    toast.success("Hiring stage added successfully.");
  };

  const handleStartEditStage = (stage) => {
    setEditingStageId(stage.id);
    setEditingStageName(stage.name);
  };

  const handleSaveEditStage = (id) => {
    if (!editingStageName.trim()) return;
    setStages(stages.map(s => s.id === id ? { ...s, name: editingStageName.trim() } : s));
    setEditingStageId(null);
    setEditingStageName("");
    toast.success("Hiring stage updated.");
  };

  const handleToggleStage = (id) => {
    setStages(stages.map(s => s.id === id ? { ...s, active: !s.active } : s));
    toast.success("Stage visibility toggled.");
  };

  const handleDeleteStage = (id) => {
    if (stages.length <= 1) {
      toast.error("You must keep at least one hiring stage.");
      return;
    }
    setStages(stages.filter(s => s.id !== id));
    toast.success("Hiring stage deleted.");
  };

  const handleSaveApprovals = () => {
    toast.success("Approval chains configuration saved.");
  };

  const handleToggleNotification = (key) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
    toast.success("Notification settings updated.");
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Configure hiring pipelines, multi-level approvals, and automated notifications for the HR module.
        </p>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl p-1 shadow-sm gap-2">
        <button
          onClick={() => setActiveTab("stages")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "stages"
              ? "bg-brand-600 text-white shadow-md shadow-brand-600/20"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
          }`}
        >
          <Settings2 size={16} />
          Hiring Stages
        </button>
        <button
          onClick={() => setActiveTab("approvals")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "approvals"
              ? "bg-brand-600 text-white shadow-md shadow-brand-600/20"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
          }`}
        >
          <ShieldAlert size={16} />
          Approval Chains
        </button>
        <button
          onClick={() => setActiveTab("notifications")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "notifications"
              ? "bg-brand-600 text-white shadow-md shadow-brand-600/20"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
          }`}
        >
          <BellRing size={16} />
          Notification Rules
        </button>
      </div>

      {/* Tab Contents */}
      <div className="grid grid-cols-12 gap-6">
        {/* Stages Tab */}
        {activeTab === "stages" && (
          <>
            {/* List Stages */}
            <div className="col-span-12 lg:col-span-8 space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-4">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Active Hiring Pipeline Stages</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  These stages define the columns in your recruitment funnel. Active stages will appear in the Candidate Pipeline view.
                </p>

                <div className="space-y-2">
                  {stages.map((stage, idx) => (
                    <div
                      key={stage.id}
                      className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                        stage.active
                          ? "bg-gray-50/50 border-gray-100 dark:bg-gray-700/20 dark:border-gray-700"
                          : "bg-gray-50/20 border-gray-100/50 opacity-60 dark:bg-gray-800/10 dark:border-gray-800/40"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
                          {idx + 1}
                        </span>

                        {editingStageId === stage.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editingStageName}
                              onChange={(e) => setEditingStageName(e.target.value)}
                              className="text-sm font-semibold px-2 py-1 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-500 text-gray-900 dark:text-white"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveEditStage(stage.id)}
                              className="p-1 text-green-500 hover:bg-green-50 dark:hover:bg-green-950/20 rounded"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingStageId(null)}
                              className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div>
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">{stage.name}</span>
                            <span className="ml-2.5 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                              {stage.code}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleStage(stage.id)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold transition-all ${
                            stage.active
                              ? "text-green-600 bg-green-50/50 border-green-100 dark:text-green-400 dark:bg-green-900/10 dark:border-green-900/30"
                              : "text-gray-400 bg-gray-100/50 border-gray-200 dark:text-gray-500 dark:bg-gray-800 dark:border-gray-700"
                          }`}
                        >
                          {stage.active ? "Active" : "Inactive"}
                        </button>
                        <button
                          title="Edit Stage Name"
                          onClick={() => handleStartEditStage(stage)}
                          className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-all"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          title="Delete Stage"
                          onClick={() => handleDeleteStage(stage.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Add Stage Form */}
            <div className="col-span-12 lg:col-span-4">
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-4">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Add Custom Stage</h3>
                <form onSubmit={handleAddStage} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                      Stage Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Technical Coding Round"
                      value={newStageName}
                      onChange={(e) => setNewStageName(e.target.value)}
                      className="w-full text-sm px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-200 dark:bg-gray-700/50 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-400"
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full" icon={<Plus size={15} />}>
                    Create Stage
                  </Button>
                </form>
              </div>
            </div>
          </>
        )}

        {/* Approvals Tab */}
        {activeTab === "approvals" && (
          <div className="col-span-12 max-w-2xl mx-auto w-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 pb-4">
              <div className="p-2.5 bg-brand-50 dark:bg-brand-900/30 rounded-xl text-brand-600 dark:text-brand-400">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Approval Workflows</h3>
                <p className="text-xs text-gray-500">Configure authority level required to approve critical requests.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Job Requisition Approvals
                </label>
                <select
                  value={approvalRules.requisitions}
                  onChange={(e) => setApprovalRules(prev => ({ ...prev, requisitions: e.target.value }))}
                  className="w-full text-sm px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="hr_manager">HR Manager Only</option>
                  <option value="super_admin">Super Administrator Approval</option>
                  <option value="two_tier">Two-Tier (HR Manager & Super Admin)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Candidate Offer Approvals
                </label>
                <select
                  value={approvalRules.offers}
                  onChange={(e) => setApprovalRules(prev => ({ ...prev, offers: e.target.value }))}
                  className="w-full text-sm px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="hr_manager">HR Manager Only</option>
                  <option value="super_admin">Super Administrator Approval</option>
                  <option value="two_tier">Two-Tier Approval</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Employee Separation & Exit Approvals
                </label>
                <select
                  value={approvalRules.exitRequests}
                  onChange={(e) => setApprovalRules(prev => ({ ...prev, exitRequests: e.target.value }))}
                  className="w-full text-sm px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="hr_manager">HR Manager Only</option>
                  <option value="super_admin">Super Administrator Approval</option>
                  <option value="two_tier">Two-Tier Approval</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-end">
              <Button onClick={handleSaveApprovals}>Save Configurations</Button>
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === "notifications" && (
          <div className="col-span-12 max-w-2xl mx-auto w-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 pb-4">
              <div className="p-2.5 bg-brand-50 dark:bg-brand-900/30 rounded-xl text-brand-600 dark:text-brand-400">
                <BellRing size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Email & System Notifications</h3>
                <p className="text-xs text-gray-500">Configure trigger events to fire automatic emails to relevant actors.</p>
              </div>
            </div>

            <div className="space-y-4">
              {[
                { key: "onNewRequisition", title: "New Requisition Request", desc: "Notify Super Admins when a new Job Requisition is submitted for approval." },
                { key: "onOfferAccepted", title: "Offer Acceptance Alert", desc: "Send notification when a candidate accepts their official offer letter." },
                { key: "onInterviewScheduled", title: "Interview Scheduling Reminder", desc: "Notify panelists and candidate when an interview session is locked in." },
                { key: "onCandidateApply", title: "New Job Applicant", desc: "Send an instant alert to recruiters for every new job application received." },
                { key: "onExitRequested", title: "Separation Request Alert", desc: "Notify HR team when an employee submits their formal resignation." },
              ].map((item) => (
                <div key={item.key} className="flex items-start justify-between gap-4 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/20 rounded-xl transition-all">
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{item.title}</h4>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{item.desc}</p>
                  </div>
                  <button
                    onClick={() => handleToggleNotification(item.key)}
                    className={`flex-shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      notifications[item.key] ? "bg-brand-600" : "bg-gray-200 dark:bg-gray-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        notifications[item.key] ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
