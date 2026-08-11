import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import { useAuth } from "./AuthContext";
import { getSocket, subscribeSocketEvent, emitSocketEvent } from "../utils/socket";
import { notificationApi } from "../utils/api";

/** How often the bell re-checks the server for new activity. */
const POLL_MS = 30000;

const NotificationContext = createContext(null);

// No storage key for notifications: the server owns them now.
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

/*
 * The activity feed is served by /api/notifications, so there is no seed list
 * here. Three fabricated events used to live at this spot — a salary credit, a
 * ticket escalation for TK-9041, and an HR policy — and every user saw them on
 * first load regardless of what had actually happened.
 */

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
  /*
   * The activity feed comes from the server, so it starts empty rather than
   * from a seed array. It used to be initialised with three fabricated events
   * (a July salary credit, ticket TK-9041 escalating, an HR policy) that every
   * user saw on first load and that no action could ever produce. Delivery is
   * now real: TicketNotifier writes a row per recipient, and this polls for it.
   */
  const [notifications, setNotifications] = useState([]);
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

  // Load state from localStorage on mount.
  //
  // Notifications are deliberately absent here: the server owns them, and a
  // cached copy would resurrect rows another device has already read.
  useEffect(() => {
    try {
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

  // Local-only update. Used to reflect a server change we already made, never
  // to invent a notification the server does not have.
  const saveNotifications = useCallback((newNotifs) => {
    setNotifications(newNotifs);
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

  /*
   * Poll the server for this user's feed.
   *
   * Polling rather than pushing because there is no notification socket on the
   * server yet — the socket subscription below only fires if something else is
   * emitting. A 30-second interval is well inside the endpoint's rate limit and
   * is why an admin sees a newly raised ticket without reloading the page.
   *
   * A chime plays only when the unread count actually rises, so a poll that
   * finds nothing new stays silent.
   */
  const previousUnreadRef = useRef(null);

  // Signing out (or in as someone else) empties the feed during render rather
  // than inside the effect — a synchronous setState in an effect body is the
  // cascading render React warns about, and the previous user's notifications
  // must not linger on screen for even one frame.
  const token = user?.accessToken ?? null;
  const [tokenSeen, setTokenSeen] = useState(token);
  if (tokenSeen !== token) {
    setTokenSeen(token);
    setNotifications([]);
  }

  useEffect(() => {
    // Reset here rather than during render: a ref must not be written while
    // rendering. This runs on every identity change, which is exactly when the
    // previous user's unread baseline stops being meaningful.
    previousUnreadRef.current = null;

    if (!user?.accessToken) return undefined;

    let cancelled = false;

    const pull = async () => {
      // Pause polling when tab is inactive/hidden to conserve server CPU, bandwidth, and battery
      if (typeof document !== "undefined" && document.hidden) return;

      try {
        const res = await notificationApi.list(user.accessToken, user.tokenType, { limit: 50 });
        if (cancelled || !res?.status) return;

        const rows = res.data || [];
        setNotifications(rows);

        const unread = res.meta?.unread ?? rows.filter((n) => !n.isRead).length;
        const previous = previousUnreadRef.current;
        previousUnreadRef.current = unread;

        // Null on the first pull — an existing backlog must not chime on login.
        if (previous !== null && unread > previous) {
          playNotificationChime();
          const newest = rows.find((n) => !n.isRead);
          if (newest) triggerDesktopPush(newest.title, newest.description);
        }
      } catch {
        // Silent: a dropped poll is not worth a toast every 30 seconds, and the
        // next tick recovers.
      }
    };

    pull();
    const timer = setInterval(pull, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user?.accessToken, user?.tokenType, playNotificationChime, triggerDesktopPush]);

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

  /*
   * Actions write to the server, then reflect the change locally.
   *
   * Updated optimistically so the badge responds immediately, but the server
   * call is what makes it stick — previously these only edited React state, so
   * "mark all as read" was undone by the next page load.
   */
  const markAsRead = useCallback((id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true, status: "read", readAt: new Date().toISOString() } : n)),
    );
    if (previousUnreadRef.current !== null) {
      previousUnreadRef.current = Math.max(0, previousUnreadRef.current - 1);
    }

    notificationApi.markRead(id, user?.accessToken, user?.tokenType).catch((err) => {
      toast.error(err.message || "Could not mark as read");
    });
  }, [user?.accessToken, user?.tokenType]);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true, status: "read", readAt: n.readAt || new Date().toISOString() })),
    );
    previousUnreadRef.current = 0;

    notificationApi
      .markAllRead(user?.accessToken, user?.tokenType)
      .then(() => toast.success("All notifications marked as read"))
      .catch((err) => toast.error(err.message || "Could not mark all as read"));
  }, [user?.accessToken, user?.tokenType]);

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
    setNotifications((prev) => prev.filter((n) => n.id !== id));

    notificationApi.remove(id, user?.accessToken, user?.tokenType).catch((err) => {
      toast.error(err.message || "Could not remove notification");
    });
  }, [user?.accessToken, user?.tokenType]);

  // Clears this user's feed only — the ticket's own history is untouched.
  const clearAllNotifications = useCallback(() => {
    const ids = notifications.map((n) => n.id);
    setNotifications([]);
    previousUnreadRef.current = 0;

    Promise.allSettled(
      ids.map((id) => notificationApi.remove(id, user?.accessToken, user?.tokenType)),
    ).then((results) => {
      const failed = results.filter((r) => r.status === "rejected").length;
      failed > 0
        ? toast.error(`${failed} notification(s) could not be removed`)
        : toast.success("Notification feed cleared");
    });
  }, [notifications, user?.accessToken, user?.tokenType]);

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
