import { Bell } from "lucide-react";
import { useNotifications } from "../../context/NotificationContext";

export default function NotificationBell() {
  const { unreadCount, drawerOpen, setDrawerOpen } = useNotifications();
  const hasUnread = unreadCount > 0;

  return (
    <button
      type="button"
      onClick={() => setDrawerOpen(!drawerOpen)}
      aria-label={`Open Notification Center (${unreadCount} unread)`}
      className="group relative flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
    >
      <Bell
        size={19}
        className={`transition-all duration-300 group-hover:rotate-12 ${
          hasUnread
            ? "animate-bell-ring text-brand-600 dark:text-brand-400"
            : "text-gray-600 dark:text-gray-300"
        }`}
      />

      {hasUnread && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 font-mono text-[10px] font-extrabold text-white shadow-sm ring-2 ring-white dark:ring-gray-800 transition-all">
          <span className="absolute inset-0 animate-ping rounded-full bg-rose-400 opacity-75" />
          <span className="relative z-10">{unreadCount > 99 ? "99+" : unreadCount}</span>
        </span>
      )}
    </button>
  );
}
