import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Bell,
  CheckCheck,
  Search,
  Filter,
  Megaphone,
  Trash2,
  ExternalLink,
  LifeBuoy,
  DollarSign,
  Briefcase,
  Calendar,
  Laptop,
  Award,
  Sparkles,
  Sliders,
  Users,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Pin,
  Volume2,
  VolumeX,
  CheckSquare,
  ShieldCheck,
  FileSpreadsheet,
  Eye
} from "lucide-react";
import { useNotifications } from "../../context/NotificationContext";
import { useAuth } from "../../context/AuthContext";
import AnnouncementsModal from "./AnnouncementsModal";
import EmployeeGroupsModal from "./EmployeeGroupsModal";
import NotificationPreferencesModal from "./NotificationPreferencesModal";
import AnnouncementReadReceiptsModal from "./AnnouncementReadReceiptsModal";

const PRIORITY_BADGES = {
  Normal: { bg: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300", icon: Clock },
  Success: { bg: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300", icon: CheckCircle2 },
  Warning: { bg: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300", icon: AlertTriangle },
  Urgent: { bg: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300", icon: ShieldAlert },
  Critical: { bg: "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 animate-pulse", icon: ShieldAlert },
  Important: { bg: "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300", icon: Pin },
};

const MODULE_ICONS = {
  Tickets: LifeBuoy,
  Payroll: DollarSign,
  Recruitment: Briefcase,
  HR: Briefcase,
  Leave: Calendar,
  Attendance: Calendar,
  Assets: Laptop,
  Performance: Award,
  Announcements: Megaphone,
  System: Sparkles,
};

export default function NotificationDrawer() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    notifications,
    announcements,
    preferences,
    unreadCount,
    drawerOpen,
    setDrawerOpen,
    markAsRead,
    markAllAsRead,
    acknowledgeNotification,
    deleteNotification,
    clearAllNotifications,
    savePreferences,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState("feed"); // "feed" | "announcements"
  const [filterCategory, setFilterCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageLimit, setPageLimit] = useState(15);

  // Modals state
  const [ancModalOpen, setAncModalOpen] = useState(false);
  const [groupsModalOpen, setGroupsModalOpen] = useState(false);
  const [prefsModalOpen, setPrefsModalOpen] = useState(false);
  const [selectedAncReceipts, setSelectedAncReceipts] = useState(null);

  const isHrOrAdmin = user?.rawRole === 0 || user?.role === "admin" || user?.role === "super_admin";

  // Filtered notifications
  const filteredNotifs = useMemo(() => {
    return notifications.filter((n) => {
      // Search check
      const matchesSearch =
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (n.triggeredBy && n.triggeredBy.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (n.relatedEmployee && n.relatedEmployee.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (n.module && n.module.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      // Filter category check
      if (filterCategory === "Unread") return !n.isRead;
      if (filterCategory !== "All") return n.module === filterCategory;

      return true;
    });
  }, [notifications, searchQuery, filterCategory]);

  // Stream Grouping (Today, Yesterday, This Week, Older)
  const groupedNotifs = useMemo(() => {
    const today = filteredNotifs.filter((n) => n.dateGroup === "Today");
    const yesterday = filteredNotifs.filter((n) => n.dateGroup === "Yesterday");
    const thisWeek = filteredNotifs.filter((n) => n.dateGroup === "This Week");
    const older = filteredNotifs.filter(
      (n) => n.dateGroup === "Older" || (!n.dateGroup && n.dateGroup !== "Today" && n.dateGroup !== "Yesterday" && n.dateGroup !== "This Week")
    );

    return [
      { label: "Today", items: today },
      { label: "Yesterday", items: yesterday },
      { label: "This Week", items: thisWeek },
      { label: "Older", items: older },
    ].filter((g) => g.items.length > 0);
  }, [filteredNotifs]);

  const handleActionClick = (n) => {
    markAsRead(n.id);
    if (n.actionUrl) {
      setDrawerOpen(false);
      navigate(n.actionUrl);
    }
  };

  const handleToggleSound = () => {
    savePreferences({
      ...preferences,
      soundEnabled: !preferences.soundEnabled,
    });
  };

  if (!drawerOpen) return null;

  return (
    <>
      {/* Backdrop Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={() => setDrawerOpen(false)}
      />

      {/* Responsive Enterprise Notification Workspace Drawer */}
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-full sm:w-[480px] sm:max-w-[480px] flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-2xl transition-transform duration-300 ease-in-out font-sans"
        aria-label="Notification Center Workspace"
      >
        {/* Workspace Top Header */}
        <div className="flex flex-col border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/60 p-3.5 sm:p-4 gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 font-bold shrink-0">
                <Bell size={18} />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-extrabold text-gray-900 dark:text-white tracking-tight truncate">
                  Notification Workspace
                </h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                  {unreadCount > 0 ? `${unreadCount} unread activity events` : "All notifications caught up"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleToggleSound}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200/60 dark:hover:bg-gray-700 transition-all"
                title={preferences.soundEnabled ? "Mute Audio Chime" : "Enable Audio Chime"}
              >
                {preferences.soundEnabled ? <Volume2 size={16} className="text-emerald-500" /> : <VolumeX size={16} />}
              </button>

              <button
                type="button"
                onClick={() => setPrefsModalOpen(true)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200/60 dark:hover:bg-gray-700 transition-all"
                title="Notification Settings"
              >
                <Sliders size={16} />
              </button>

              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200/60 dark:hover:bg-gray-700 transition-all"
                title="Close Workspace"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* HR Broadcast Controls */}
          {isHrOrAdmin && (
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAncModalOpen(true)}
                className="flex-1 min-w-[130px] flex items-center justify-center gap-1.5 py-1.5 px-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                <Megaphone size={13} /> Publish Broadcast
              </button>
              <button
                type="button"
                onClick={() => setGroupsModalOpen(true)}
                className="flex items-center gap-1 py-1.5 px-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 rounded-xl text-xs font-semibold transition-all shadow-2xs"
              >
                <Users size={13} /> Groups
              </button>
            </div>
          )}

          {/* Workspace Tabs */}
          <div className="flex items-center gap-1 border-t border-gray-200/60 dark:border-gray-700/60 pt-2.5">
            <button
              onClick={() => setActiveTab("feed")}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === "feed"
                  ? "bg-white dark:bg-gray-800 text-brand-600 dark:text-brand-400 shadow-xs border border-gray-200/60 dark:border-gray-700"
                  : "text-gray-500 hover:text-gray-800 dark:text-gray-400"
              }`}
            >
              Activity Feed ({notifications.length})
            </button>
            <button
              onClick={() => setActiveTab("announcements")}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === "announcements"
                  ? "bg-white dark:bg-gray-800 text-brand-600 dark:text-brand-400 shadow-xs border border-gray-200/60 dark:border-gray-700"
                  : "text-gray-500 hover:text-gray-800 dark:text-gray-400"
              }`}
            >
              Announcements ({announcements.length})
            </button>
          </div>
        </div>

        {/* FEED TAB */}
        {activeTab === "feed" && (
          <>
            {/* Search & Multi-Filter Bar */}
            <div className="p-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 space-y-2.5">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search Employee, Module, Keyword..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800 py-2 pl-9 pr-3 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Category Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {["All", "Unread", "Tickets", "Payroll", "Leave", "Attendance", "Assets", "Performance"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                      filterCategory === cat
                        ? "bg-brand-600 text-white font-bold"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Bulk Action Controls */}
              <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="flex items-center gap-1 font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                >
                  <CheckCheck size={13} /> Mark all as read
                </button>
                <button
                  type="button"
                  onClick={clearAllNotifications}
                  className="flex items-center gap-1 text-gray-400 hover:text-rose-500 transition-colors"
                >
                  <Trash2 size={13} /> Clear feed
                </button>
              </div>
            </div>

            {/* Notification Stream Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {groupedNotifs.length === 0 ? (
                <div className="py-16 text-center">
                  <Bell size={28} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-300">No notifications found</p>
                  <p className="text-[11px] text-gray-400 mt-1">Automatic events will appear here live.</p>
                </div>
              ) : (
                groupedNotifs.map((group) => (
                  <div key={group.label} className="space-y-2">
                    <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 px-1">
                      {group.label}
                    </h3>
                    <div className="space-y-2">
                      {group.items.slice(0, pageLimit).map((n) => {
                        const IconComponent = MODULE_ICONS[n.module] || Sparkles;
                        const badgeInfo = PRIORITY_BADGES[n.priority] || PRIORITY_BADGES.Normal;
                        const BadgeIcon = badgeInfo.icon;

                        return (
                          <div
                            key={n.id}
                            className={`group relative p-3 sm:p-3.5 rounded-2xl border transition-all duration-200 shadow-2xs ${
                              n.requiresAck && !n.acknowledgedAt
                                ? "bg-rose-50/60 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 ring-2 ring-rose-500/20"
                                : n.isRead
                                ? "bg-white dark:bg-gray-800/60 border-gray-200/80 dark:border-gray-800 opacity-80"
                                : "bg-brand-50/40 dark:bg-gray-800 border-brand-200/80 dark:border-brand-900/60 ring-1 ring-brand-500/10"
                            }`}
                          >
                            <div className="flex items-start gap-2.5 sm:gap-3">
                              {/* Module Icon Badge */}
                              <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 shrink-0 mt-0.5">
                                <IconComponent size={16} />
                              </span>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${badgeInfo.bg}`}>
                                    <BadgeIcon size={11} /> {n.priority}
                                  </span>
                                  <span className="text-[10px] font-medium text-gray-400 shrink-0">
                                    {new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                </div>

                                <h4 className="text-xs font-bold text-gray-900 dark:text-white mt-1.5 leading-snug">
                                  {n.title}
                                </h4>
                                <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                                  {n.description}
                                </p>

                                {/* Metadata: Triggered By & Related Employee */}
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-400 mt-2 font-medium">
                                  <span>By {n.triggeredBy || "System"}</span>
                                  {n.relatedEmployee && <span>• For {n.relatedEmployee}</span>}
                                  {n.department && <span>• {n.department}</span>}
                                </div>

                                {/* Mandatory Acknowledgement Button */}
                                {n.requiresAck && !n.acknowledgedAt && (
                                  <div className="mt-2.5 pt-2 border-t border-rose-200/60 dark:border-rose-900/40">
                                    <button
                                      type="button"
                                      onClick={() => acknowledgeNotification(n.id)}
                                      className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all"
                                    >
                                      <ShieldCheck size={14} /> I Understand & Acknowledge
                                    </button>
                                  </div>
                                )}

                                {/* Bottom Action Bar */}
                                <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/60">
                                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    {n.acknowledgedAt ? "✓ Acknowledged" : n.isRead ? "Read" : "Unread"}
                                  </span>

                                  <div className="flex items-center gap-2">
                                    {n.actionUrl && (
                                      <button
                                        type="button"
                                        onClick={() => handleActionClick(n)}
                                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-600 text-white text-[11px] font-bold hover:bg-brand-700 transition-all shadow-xs"
                                      >
                                        {n.actionLabel || "Navigate"} <ExternalLink size={11} />
                                      </button>
                                    )}

                                    {!n.isRead && (
                                      <button
                                        type="button"
                                        onClick={() => markAsRead(n.id)}
                                        className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                                      >
                                        Mark Read
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => deleteNotification(n.id)}
                                      className="text-gray-400 hover:text-rose-500 transition-colors p-1"
                                      title="Delete"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Workspace Footer */}
            <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/60 flex items-center justify-between text-xs font-semibold">
              <button
                type="button"
                onClick={() => setPageLimit((prev) => prev + 15)}
                className="text-brand-600 dark:text-brand-400 hover:underline"
              >
                Load More Notifications
              </button>

              <button
                type="button"
                onClick={() => setPrefsModalOpen(true)}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-800 dark:text-gray-400"
              >
                <Sliders size={13} /> Preferences
              </button>
            </div>
          </>
        )}

        {/* ANNOUNCEMENTS TAB */}
        {activeTab === "announcements" && (
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
            {announcements.map((anc) => (
              <div
                key={anc.id}
                className={`p-4 rounded-2xl border bg-white dark:bg-gray-800 space-y-3 shadow-2xs ${
                  anc.priority === "Critical" ? "border-rose-300 dark:border-rose-800 ring-1 ring-rose-500/20" : "border-gray-200 dark:border-gray-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Megaphone size={16} className="text-brand-500" />
                    <span className="text-xs font-bold text-gray-900 dark:text-white">{anc.title}</span>
                  </div>
                  {anc.requiresAck && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full">
                      <ShieldCheck size={10} /> Ack Required
                    </span>
                  )}
                </div>

                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                  {anc.content}
                </p>

                {anc.attachments && anc.attachments.length > 0 && (
                  <div className="p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-700 space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Attached Files</p>
                    {anc.attachments.map((att, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs font-semibold text-brand-600 dark:text-brand-400">
                        <span>{att.name} ({att.size})</span>
                        <ExternalLink size={12} />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-2">
                  <span>By {anc.author} • {anc.publishedAt}</span>

                  {isHrOrAdmin && (
                    <button
                      type="button"
                      onClick={() => setSelectedAncReceipts(anc)}
                      className="flex items-center gap-1 font-bold text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      <Eye size={12} /> Read Receipts
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Modals */}
      <AnnouncementsModal isOpen={ancModalOpen} onClose={() => setAncModalOpen(false)} />
      <EmployeeGroupsModal isOpen={groupsModalOpen} onClose={() => setGroupsModalOpen(false)} />
      <NotificationPreferencesModal isOpen={prefsModalOpen} onClose={() => setPrefsModalOpen(false)} />
      <AnnouncementReadReceiptsModal
        isOpen={!!selectedAncReceipts}
        onClose={() => setSelectedAncReceipts(null)}
        announcement={selectedAncReceipts}
      />
    </>
  );
}
