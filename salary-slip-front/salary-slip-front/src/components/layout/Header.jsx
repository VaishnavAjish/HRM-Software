import { Menu, Bell, Sun, Moon, Search, Download, LogOut } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useInstallPWA } from "../../hooks/useInstallPWA";
import { useState } from "react";
import CompanyScopeDropdown from "./CompanyScopeDropdown";

export default function Header({ onMenuClick, title, isCollapsed }) {
  const { dark, toggle } = useTheme();
  const { user, logout } = useAuth();
  const { canInstall, install, isIOS, showIOSGuide, dismissIOSGuide } =
    useInstallPWA();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="h-16 bg-white dark:bg-gray-800 border-b-2 border-brand-600/20 dark:border-brand-600/30 flex items-center px-4 gap-4 sticky top-0 z-10">
      <button
        onClick={onMenuClick}
        className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 ${isCollapsed ? "" : "lg:hidden"}`}
      >
        <Menu size={20} />
      </button>

      <div className="flex-1">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h1>
      </div>

      <CompanyScopeDropdown />

      {canInstall && (
        <button
          onClick={install}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          <Download size={14} />
          Install App
        </button>
      )}

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8 bg-black/50"
          onClick={dismissIOSGuide}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-3">
              Install on iPhone / iPad
            </h3>
            <ol className="space-y-2 text-sm text-gray-700 dark:text-gray-300 list-decimal list-inside">
              <li>
                Tap the <span className="font-semibold">Share</span> button{" "}
                <span className="text-base">⎙</span> at the bottom of Safari
              </li>
              <li>
                Scroll down and tap{" "}
                <span className="font-semibold">"Add to Home Screen"</span>
              </li>
              <li>
                Tap <span className="font-semibold">Add</span> — the app icon
                will appear on your home screen
              </li>
            </ol>
            <button
              onClick={dismissIOSGuide}
              className="mt-5 w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <button
        onClick={toggle}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
      >
        {dark ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="relative">
        <button
          onClick={() => setProfileOpen(!profileOpen)}
          className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold cursor-pointer border-2 border-transparent hover:border-brand-400 focus:outline-none transition-all"
        >
          {user?.name
            ?.split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2) || "U"}
        </button>

        {profileOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setProfileOpen(false)}
            />
            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 py-2 z-50">
              <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 mb-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {user?.name || "User"}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {user?.email || ""}
                </p>
              </div>
              <button
                onClick={() => {
                  setProfileOpen(false);
                  if (logout) logout();
                }}
                className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors"
              >
                <LogOut size={16} />
                Log out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
