import { useEffect, useState } from "react";
import {
  Users,
  ShieldCheck,
  Key,
  Building2,
  MapPin,
  ClipboardCheck,
  Activity,
  Settings2,
  ShieldAlert,
} from "lucide-react";
import toast from "react-hot-toast";
import Modal from "../../../components/ui/Modal";
import Button from "../../../components/ui/Button";
import { rbacApi } from "../../../utils/api";
import { useAuth } from "../../../context/AuthContext";

const CARDS = [
  { key: "totalUsers", label: "Total Users", icon: Users, settingKey: "dashboard.show_total_users" },
  { key: "activeUsers", label: "Active Users", icon: Activity, settingKey: "dashboard.show_active_users" },
  { key: "totalRoles", label: "Total Roles", icon: ShieldCheck, settingKey: "dashboard.show_total_roles" },
  { key: "totalPermissions", label: "Total Permissions", icon: Key, settingKey: "dashboard.show_total_permissions" },
  { key: "totalDepartments", label: "Departments", icon: Building2, settingKey: "dashboard.show_departments" },
  { key: "totalLocations", label: "Locations", icon: MapPin, settingKey: "dashboard.show_locations" },
  { key: "pendingApprovals", label: "Approval Levels", icon: ClipboardCheck, settingKey: "dashboard.show_approval_levels" },
];

const SETTING_LABELS = {
  "dashboard.show_total_users": "Total Users card",
  "dashboard.show_active_users": "Active Users card",
  "dashboard.show_total_roles": "Total Roles card",
  "dashboard.show_total_permissions": "Total Permissions card",
  "dashboard.show_departments": "Departments card",
  "dashboard.show_locations": "Locations card",
  "dashboard.show_approval_levels": "Approval Levels card",
  "dashboard.show_users_by_role_chart": "Users by Role chart",
  "dashboard.show_users_by_department_chart": "Users by Department chart",
  "dashboard.show_recent_activity": "Recent Activity feed",
};

const SECURITY_LABELS = {
  "rbac.require_2fa": { label: "Require Two-Factor Authentication", type: "boolean" },
  "rbac.session_timeout_minutes": { label: "Session Timeout (minutes)", type: "number" },
  "rbac.enable_audit_logging": { label: "Enable Audit Logging", type: "boolean" },
  "rbac.max_failed_login_attempts": { label: "Max Failed Login Attempts", type: "number" },
};

const MAIN_DASHBOARD_LABELS = {
  "main_dashboard.show_current_date": "Show Current Date",
  "main_dashboard.show_total_salary": "Show Last Month Salary Paid",
  "main_dashboard.show_employee_count": "Show Employee Count",
  "main_dashboard.show_departments": "Show Departments Breakdown",
  "main_dashboard.show_salary_trend_chart": "Show Salary Trend Chart",
  "main_dashboard.show_department_chart": "Show Department Chart",
};

export default function RbacDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState([]);
  const [draftSecurity, setDraftSecurity] = useState([]);
  const [draftMainDashboard, setDraftMainDashboard] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadSettings = () => {
    Promise.all([
      rbacApi.getSettings(user?.accessToken, user?.tokenType, "dashboard").catch(() => ({ status: false })),
      rbacApi.getSettings(user?.accessToken, user?.tokenType, "main_dashboard").catch(() => ({ status: false })),
    ]).then(([dashRes, mainDashRes]) => {
      const map = {};
      if (dashRes.status) {
        (dashRes.data || []).forEach((s) => {
          map[s.key] = s.value !== "false";
        });
      }
      if (mainDashRes.status) {
        (mainDashRes.data || []).forEach((s) => {
          map[s.key] = s.value !== "false";
        });
      }
      setSettings(map);
    });
  };

  useEffect(() => {
    rbacApi
      .getDashboard(user?.accessToken, user?.tokenType)
      .then((res) => {
        if (res.status) setStats(res.data);
      })
      .catch(() => toast.error("Failed to load RBAC dashboard"))
      .finally(() => setLoading(false));
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isVisible = (settingKey) => settings[settingKey] !== false;

  const openSettings = async () => {
    try {
      const [dashboardRes, securityRes, mainDashboardRes] = await Promise.all([
        rbacApi.getSettings(user?.accessToken, user?.tokenType, "dashboard"),
        rbacApi.getSettings(user?.accessToken, user?.tokenType, "rbac"),
        rbacApi.getSettings(user?.accessToken, user?.tokenType, "main_dashboard"),
      ]);
      if (dashboardRes.status) setDraftSettings(dashboardRes.data || []);
      if (securityRes.status) setDraftSecurity(securityRes.data || []);
      if (mainDashboardRes.status) setDraftMainDashboard(mainDashboardRes.data || []);
      setSettingsOpen(true);
    } catch {
      toast.error("Failed to load settings");
    }
  };

  const toggleDraft = (key, group = "dashboard") => {
    if (group === "main_dashboard") {
      setDraftMainDashboard((prev) =>
        prev.map((s) => (s.key === key ? { ...s, value: s.value === "true" ? "false" : "true" } : s)),
      );
    } else {
      setDraftSettings((prev) =>
        prev.map((s) => (s.key === key ? { ...s, value: s.value === "true" ? "false" : "true" } : s)),
      );
    }
  };

  const updateSecurity = (key, value) => {
    setDraftSecurity((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)));
  };

  const [savingWidget, setSavingWidget] = useState(null);

  const toggleMainDashboardSetting = async (key) => {
    const currentValue = isVisible(key);
    const newValue = !currentValue;
    
    // Optimistic UI update
    setSettings(prev => ({ ...prev, [key]: newValue }));
    setSavingWidget(key);

    try {
      const payload = [{ key, value: newValue ? "true" : "false" }];
      const res = await rbacApi.updateSettings(payload, user?.accessToken, user?.tokenType, "main_dashboard");
      if (!res.status) {
        setSettings(prev => ({ ...prev, [key]: currentValue }));
        toast.error("Failed to update widget setting");
      }
    } catch (err) {
      setSettings(prev => ({ ...prev, [key]: currentValue }));
      toast.error("Failed to update widget setting");
    } finally {
      setSavingWidget(null);
    }
  };

  const toggleSecurity = (key) => {
    setDraftSecurity((prev) =>
      prev.map((s) => (s.key === key ? { ...s, value: s.value === "true" ? "false" : "true" } : s)),
    );
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const [dashboardRes, securityRes, mainDashboardRes] = await Promise.all([
        rbacApi.updateSettings(draftSettings, user?.accessToken, user?.tokenType, "dashboard"),
        rbacApi.updateSettings(draftSecurity, user?.accessToken, user?.tokenType, "rbac"),
        rbacApi.updateSettings(draftMainDashboard, user?.accessToken, user?.tokenType, "main_dashboard"),
      ]);
      if (dashboardRes.status && securityRes.status && mainDashboardRes.status) {
        toast.success("Settings saved");
        setSettingsOpen(false);
        loadSettings();
      } else {
        toast.error("Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const visibleCards = CARDS.filter((c) => isVisible(c.settingKey));

  if (user?.rawRole !== 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert size={32} className="text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Only a Super Admin can access RBAC.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">RBAC Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Enterprise-wide overview of users, roles, and access control.
          </p>
        </div>
        <Button variant="secondary" size="sm" icon={<Settings2 size={14} />} onClick={openSettings}>
          Settings
        </Button>
      </div>

      {visibleCards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {visibleCards.map(({ key, label, icon: Icon }) => (
            <div
              key={key}
              className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {label}
                </span>
                <Icon size={16} className="text-brand-600" />
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {loading ? "…" : (stats?.[key] ?? 0)}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="col-span-1 lg:col-span-2">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Main Dashboard Configuration</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Customize the widgets and charts that appear on the main Admin Dashboard. Changes are saved automatically.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Object.entries(MAIN_DASHBOARD_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-start justify-between gap-4 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/50">
                    <div>
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 block">{label}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 block">
                        Toggle to {isVisible(key) ? "hide" : "show"} this widget
                      </span>
                    </div>
                    <button
                      onClick={() => toggleMainDashboardSetting(key)}
                      disabled={savingWidget === key}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                        isVisible(key) ? "bg-brand-600" : "bg-gray-300 dark:bg-gray-600"
                      } ${savingWidget === key ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                          isVisible(key) ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}

      {isVisible("dashboard.show_recent_activity") && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Recent Activity</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {loading ? (
              <p className="px-5 py-6 text-sm text-gray-500 dark:text-gray-400">Loading...</p>
            ) : !stats?.recentActivity?.length ? (
              <p className="px-5 py-6 text-sm text-gray-500 dark:text-gray-400">No recent RBAC activity yet.</p>
            ) : (
              stats.recentActivity.map((log) => (
                <div key={log.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="text-gray-700 dark:text-gray-200">
                    <span className="font-medium">{log.user?.name ?? "System"}</span> {log.action.toLowerCase()}d{" "}
                    {log.module}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500 text-xs">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <Modal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Dashboard Settings"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSettingsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
              Widgets
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Choose which widgets show on this dashboard.
            </p>
            <div className="space-y-3">
              {draftSettings.map((setting) => (
                <div key={setting.key} className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {SETTING_LABELS[setting.key] || setting.key}
                  </span>
                  <button
                    onClick={() => toggleDraft(setting.key)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                      setting.value === "true" ? "bg-brand-600" : "bg-gray-300 dark:bg-gray-600"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        setting.value === "true" ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>



          <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
              Security
            </h4>
            <div className="space-y-3">
              {draftSecurity.map((setting) => {
                const meta = SECURITY_LABELS[setting.key] || { label: setting.key, type: "text" };
                return (
                  <div key={setting.key} className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{meta.label}</span>
                    {meta.type === "boolean" ? (
                      <button
                        onClick={() => toggleSecurity(setting.key)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                          setting.value === "true" ? "bg-brand-600" : "bg-gray-300 dark:bg-gray-600"
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                            setting.value === "true" ? "translate-x-5" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    ) : (
                      <input
                        type="number"
                        value={setting.value}
                        onChange={(e) => updateSecurity(setting.key, e.target.value)}
                        className="w-24 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm text-gray-900 dark:text-white text-right focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
