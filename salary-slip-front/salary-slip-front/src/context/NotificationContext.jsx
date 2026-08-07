import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import { useAuth } from "./AuthContext";
import { getSocket, subscribeSocketEvent, emitSocketEvent } from "../utils/socket";

const NotificationContext = createContext(null);

const NOTIF_STORAGE_KEY = "hrms_enterprise_notifications_v3";
const ANNOUNCEMENTS_STORAGE_KEY = "hrms_enterprise_announcements_v3";
const GROUPS_STORAGE_KEY = "hrms_enterprise_groups_v3";
const PREFS_STORAGE_KEY = "hrms_enterprise_prefs_v3";

const INITIAL_GROUPS = [
  { id: "grp-1", name: "HR Team", code: "hr_team", membersCount: 12, desc: "HR Executives, Recruiter Leads, and Payroll Ops" },
  { id: "grp-2", name: "IT Team", code: "it_team", membersCount: 22, desc: "System Admins, Infrastructure, and Helpdesk Desk" },
  { id: "grp-3", name: "People Managers", code: "managers", membersCount: 15, desc: "Team Leads, Managers, and Department Heads" },
  { id: "grp-4", name: "Sales Team", code: "sales_team", membersCount: 30, desc: "Enterprise Sales & Regional Account Managers" },
  { id: "grp-5", name: "Project Alpha", code: "alpha_team", membersCount: 10, desc: "Cross-functional AI Product Engineering Squad" },
  { id: "grp-6", name: "Remote Employees", code: "remote_team", membersCount: 35, desc: "Full-time remote workers across regions" },
  { id: "grp-7", name: "Night Shift", code: "night_shift", membersCount: 14, desc: "24/7 Monitoring & Infrastructure Ops" },
  { id: "grp-8", name: "Interns", code: "interns", membersCount: 8, desc: "Graduate trainees & engineering interns" },
];

const INITIAL_PREFERENCES = {
  soundEnabled: true,
  desktopEnabled: true,
  emailEnabled: true,
  browserEnabled: true,
  channels: {
    portal: true,
    email: true,
    push: true,
    sound: true,
  },
  categories: {
    tickets: true,
    leave: true,
    payroll: true,
    recruitment: true,
    assets: true,
    performance: true,
    attendance: true,
    announcements: true,
    system: true,
  },
};

const SEED_NOTIFICATIONS = [
  {
    id: "notif-301",
    title: "July 2026 Salary Credit Released",
    description: "July monthly salary credited successfully via HDFC H2H API batch #PAY-2026-07.",
    module: "Payroll",
    priority: "Normal",
    status: "unread",
    dateGroup: "Today",
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    isRead: false,
    readAt: null,
    triggeredBy: "Finance Operations",
    relatedEmployee: "Rahul Sharma",
    department: "Finance",
    actionUrl: "/employee/payslips",
    actionLabel: "View Salary",
    requiresAck: false,
    acknowledgedAt: null,
  },
  {
    id: "notif-302",
    title: "IT Support Ticket #TK-9041 Escalated to Level 2",
    description: "SLA threshold 50% duration passed. Ticket automatically escalated to Senior Exec Vikram Mehta.",
    module: "Tickets",
    priority: "Urgent",
    status: "unread",
    dateGroup: "Today",
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    isRead: false,
    readAt: null,
    triggeredBy: "SLA Escalation Engine",
    relatedEmployee: "Vansh Chauhan",
    department: "IT",
    actionUrl: "/admin/tickets/control-center",
    actionLabel: "Open Ticket",
    requiresAck: false,
    acknowledgedAt: null,
  },
  {
    id: "notif-303",
    title: "MANDATORY: Updated HR Hybrid Work Policy 2026",
    description: "Please review and acknowledge the updated remote work & attendance regularization policy.",
    module: "Announcements",
    priority: "Critical",
    status: "unread",
    dateGroup: "Today",
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    isRead: false,
    readAt: null,
    triggeredBy: "HR Compliance Cell",
    relatedEmployee: "All Employees",
    department: "HR",
    actionUrl: "/admin/hr/settings",
    actionLabel: "Read Policy Notice",
    requiresAck: true,
    acknowledgedAt: null,
    isPinned: true,
  },
  {
    id: "notif-304",
    title: "Annual Leave Request Approved",
    description: "3-day casual leave request (Aug 14 - Aug 16) approved by HR Manager Amit Patel.",
    module: "Leave",
    priority: "Normal",
    status: "unread",
    dateGroup: "Today",
    timestamp: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
    isRead: false,
    readAt: null,
    triggeredBy: "Amit Patel (HR Lead)",
    relatedEmployee: "Nareshbhai Ghoghari",
    department: "HR",
    actionUrl: "/admin/hr/exit",
    actionLabel: "View Leave",
    requiresAck: false,
    acknowledgedAt: null,
  },
];

const SEED_ANNOUNCEMENTS = [
  {
    id: "anc-301",
    title: "Q3 Executive Town Hall & Hybrid Policy 2026",
    content: "Please join the executive team this Friday at 3:00 PM IST for our quarterly all-hands broadcast.",
    category: "Policy Notice",
    priority: "Critical",
    audience: "Entire Company",
    targetGroup: "All",
    status: "Published",
    publishedAt: "Aug 05, 2026",
    author: "HR Communications",
    requiresAck: true,
    attachments: [{ name: "Hybrid_Work_Policy_2026.pdf", size: "2.4 MB" }],
    readReceipts: [
      { employee: "Rahul Sharma", dept: "Finance", status: "Acknowledged", viewTime: "Aug 05, 10:14 AM", ackTime: "Aug 05, 10:15 AM" },
      { employee: "Vansh Chauhan", dept: "Engineering", status: "Read", viewTime: "Aug 05, 11:30 AM", ackTime: null },
    ],
  },
];

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState(SEED_NOTIFICATIONS);
  const [announcements, setAnnouncements] = useState(SEED_ANNOUNCEMENTS);
  const [groups, setGroups] = useState(INITIAL_GROUPS);
  const [preferences, setPreferences] = useState(INITIAL_PREFERENCES);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Initialize Desktop Push & Web Audio Chime Player
  useEffect(() => {
    if (preferences.desktopEnabled && typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, [preferences.desktopEnabled]);

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const savedNotifs = localStorage.getItem(NOTIF_STORAGE_KEY);
      if (savedNotifs) setNotifications(JSON.parse(savedNotifs));

      const savedAncs = localStorage.getItem(ANNOUNCEMENTS_STORAGE_KEY);
      if (savedAncs) setAnnouncements(JSON.parse(savedAncs));

      const savedGrps = localStorage.getItem(GROUPS_STORAGE_KEY);
      if (savedGrps) setGroups(JSON.parse(savedGrps));

      const savedPrefs = localStorage.getItem(PREFS_STORAGE_KEY);
      if (savedPrefs) setPreferences(JSON.parse(savedPrefs));
    } catch (err) {
      console.error("Failed to load notifications state:", err);
    }
  }, []);

  // Web Audio Chime Sound Trigger
  const playNotificationChime = useCallback(() => {
    if (!preferences.soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (err) {}
  }, [preferences.soundEnabled]);

  // Browser Desktop Push Trigger
  const triggerDesktopPush = useCallback((title, body) => {
    if (!preferences.desktopEnabled) return;
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, {
          body,
          icon: "/favicon.ico",
        });
      } catch (err) {}
    }
  }, [preferences.desktopEnabled]);

  // Sync state helpers
  const saveNotifications = useCallback((newNotifs) => {
    setNotifications(newNotifs);
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(newNotifs));
  }, []);

  const saveAnnouncements = useCallback((newAncs) => {
    setAnnouncements(newAncs);
    localStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(newAncs));
  }, []);

  const saveGroups = useCallback((newGrps) => {
    setGroups(newGrps);
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(newGrps));
  }, []);

  const savePreferences = useCallback((newPrefs) => {
    setPreferences(newPrefs);
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(newPrefs));
    toast.success("Notification preferences updated!");
  }, []);

  // Dispatch notification
  const dispatchEvent = useCallback((eventPayload) => {
    const newNotif = {
      id: `notif-${Date.now()}`,
      timestamp: new Date().toISOString(),
      dateGroup: "Today",
      isRead: false,
      status: "unread",
      readAt: null,
      priority: "Normal",
      module: "System",
      triggeredBy: user?.name || "HRMS System",
      relatedEmployee: eventPayload.relatedEmployee || user?.name || "Employee",
      department: eventPayload.department || "General",
      requiresAck: eventPayload.requiresAck || false,
      acknowledgedAt: null,
      ...eventPayload,
    };

    saveNotifications([newNotif, ...notifications]);
    playNotificationChime();
    triggerDesktopPush(newNotif.title, newNotif.description);
  }, [notifications, playNotificationChime, saveNotifications, triggerDesktopPush, user]);

  // Connect Socket.IO Real-Time Engine & Subscribe to Events
  useEffect(() => {
    getSocket(user?.accessToken);

    const unsubNotification = subscribeSocketEvent("notification:received", (data) => {
      dispatchEvent(data);
    });

    const unsubAnnouncement = subscribeSocketEvent("announcement:published", (data) => {
      dispatchEvent({
        title: `Announcement: ${data.title}`,
        description: data.content,
        module: "Announcements",
        priority: "Important",
        actionUrl: "/admin/hr/settings",
        actionLabel: "Read Announcement",
      });
    });

    return () => {
      unsubNotification();
      unsubAnnouncement();
    };
  }, [dispatchEvent, user?.accessToken]);

  // Filter notifications visible for current user role
  const visibleNotifications = useMemo(() => {
    const rawRole = user?.rawRole;
    const role = user?.role;

    return notifications.filter((n) => {
      if (rawRole === 0 || role === "admin" || role === "super_admin" || role === "owner") return true;

      const catKey = (n.module ?? "").toLowerCase();
      if (preferences.categories[catKey] === false) return false;

      if (n.targetUser && n.targetUser !== user?.id) return false;
      if (n.targetRole && n.targetRole !== role) return false;

      return true;
    });
  }, [notifications, user, preferences]);

  // Calculated unread count
  const unreadCount = useMemo(() => {
    return visibleNotifications.filter((n) => !n.isRead).length;
  }, [visibleNotifications]);

  // Actions
  const markAsRead = useCallback((id) => {
    saveNotifications(
      notifications.map((n) =>
        n.id === id ? { ...n, isRead: true, status: "read", readAt: new Date().toISOString() } : n
      )
    );
  }, [notifications, saveNotifications]);

  const markAllAsRead = useCallback(() => {
    saveNotifications(
      notifications.map((n) => ({
        ...n,
        isRead: true,
        status: "read",
        readAt: n.readAt || new Date().toISOString(),
      }))
    );
    toast.success("All notifications marked as read");
  }, [notifications, saveNotifications]);

  const acknowledgeNotification = useCallback((id) => {
    saveNotifications(
      notifications.map((n) =>
        n.id === id
          ? { ...n, isRead: true, status: "acknowledged", acknowledgedAt: new Date().toISOString(), isPinned: false }
          : n
      )
    );
    toast.success("Notification acknowledged!");
  }, [notifications, saveNotifications]);

  const deleteNotification = useCallback((id) => {
    saveNotifications(notifications.filter((n) => n.id !== id));
    toast.success("Notification removed");
  }, [notifications, saveNotifications]);

  const clearAllNotifications = useCallback(() => {
    saveNotifications([]);
    toast.success("Notification feed cleared");
  }, [saveNotifications]);

  const pushNotification = useCallback((payload) => {
    dispatchEvent(payload);
    emitSocketEvent("notification:received", payload);
  }, [dispatchEvent]);

  // Create Announcement
  const createAnnouncement = useCallback((payload) => {
    const newAnc = {
      id: `anc-${Date.now()}`,
      publishedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
      status: "Published",
      author: user?.name || "HR Director",
      attachments: [],
      readReceipts: [
        { employee: user?.name || "HR Director", dept: "HR", status: "Acknowledged", viewTime: "Just now", ackTime: "Just now" },
      ],
      ...payload,
    };
    saveAnnouncements([newAnc, ...announcements]);

    emitSocketEvent("announcement:published", newAnc);

    dispatchEvent({
      title: `Announcement: ${newAnc.title}`,
      description: newAnc.content.slice(0, 120) + "...",
      module: "Announcements",
      priority: newAnc.priority === "Critical" ? "Critical" : newAnc.priority === "Important" ? "Urgent" : "Normal",
      actionUrl: "/admin/hr/settings",
      actionLabel: "Read Announcement",
      requiresAck: newAnc.requiresAck || false,
      isPinned: newAnc.requiresAck || newAnc.priority === "Critical",
    });

    toast.success("HR Announcement broadcast published!");
  }, [announcements, dispatchEvent, saveAnnouncements, user]);

  // Create Employee Group
  const createEmployeeGroup = useCallback((payload) => {
    const newGrp = {
      id: `grp-${Date.now()}`,
      code: payload.name.toLowerCase().replace(/\s+/g, "_"),
      membersCount: payload.membersCount || 1,
      ...payload,
    };
    saveGroups([...groups, newGrp]);
    toast.success(`Employee Group '${newGrp.name}' created!`);
  }, [groups, saveGroups]);

  const deleteEmployeeGroup = useCallback((id) => {
    saveGroups(groups.filter((g) => g.id !== id));
    toast.success("Employee group removed!");
  }, [groups, saveGroups]);

  const value = useMemo(
    () => ({
      notifications: visibleNotifications,
      announcements,
      groups,
      preferences,
      unreadCount,
      drawerOpen,
      setDrawerOpen,
      markAsRead,
      markAllAsRead,
      acknowledgeNotification,
      deleteNotification,
      clearAllNotifications,
      dispatchEvent,
      pushNotification,
      createAnnouncement,
      createEmployeeGroup,
      deleteEmployeeGroup,
      savePreferences,
    }),
    [
      visibleNotifications,
      announcements,
      groups,
      preferences,
      unreadCount,
      drawerOpen,
      markAsRead,
      markAllAsRead,
      acknowledgeNotification,
      deleteNotification,
      clearAllNotifications,
      dispatchEvent,
      pushNotification,
      createAnnouncement,
      createEmployeeGroup,
      deleteEmployeeGroup,
      savePreferences,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
