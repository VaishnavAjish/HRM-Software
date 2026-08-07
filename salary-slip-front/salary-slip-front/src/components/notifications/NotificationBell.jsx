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
      className="relative p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700/80 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/30"
    >
      <Bell
        size={19}
        className={`transition-transform duration-200 ${
          hasUnread ? "animate-bounce text-brand-600 dark:text-brand-400" : "hover:scale-105"
        }`}
      />

      {hasUnread && (
        <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-extrabold text-white shadow-md shadow-rose-500/30 animate-pulse">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
