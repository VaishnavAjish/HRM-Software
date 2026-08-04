import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown } from "lucide-react";

/**
 * Same isOpen/onClose/title/footer/children contract as Modal, but slides in
 * from the right as a fixed-width panel instead of a centered box — the
 * vehicle for "click a row to see everything, without leaving the page."
 */
export default function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  headerExtra,
}) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: "max-w-md",
    md: "max-w-xl",
    lg: "max-w-3xl",
    xl: "max-w-5xl",
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex justify-end bg-black/50 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className={`drawer-panel relative bg-white dark:bg-gray-800 shadow-2xl w-full ${sizes[size]} h-full flex flex-col overflow-hidden`}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {headerExtra}
            <button
              onClick={onClose}
              aria-label="Close panel"
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">{children}</div>

        {footer && (
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 px-5 py-3 bg-gray-50 dark:bg-gray-800/80">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Simple expand/collapse section — the drawer's building block so a
 *  candidate/requisition profile never becomes one long scroll. */
export function CollapsibleSection({ title, icon, defaultOpen = true, count, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-900/30 hover:bg-gray-100 dark:hover:bg-gray-900/50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
          {icon}
          {title}
          {count != null && (
            <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">({count})</span>
          )}
        </span>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 py-3 space-y-3">{children}</div>}
    </div>
  );
}
