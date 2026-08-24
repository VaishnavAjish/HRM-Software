import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  noPadding = false,
  noHeader = false,
  zIndex = 1000,
}) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    "2xl": "max-w-5xl",
    "3xl": "max-w-6xl",
    "4xl": "max-w-7xl",
    full: "max-w-[calc(100vw_-_2.5rem)]",
  };

  return createPortal(
    <div className="modal-overlay fixed bottom-0 left-0 right-0 top-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" style={{ zIndex }}>
      <div
        className="absolute bottom-0 left-0 right-0 top-0"
        onClick={onClose}
      />
      <div
        className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full ${sizes[size]} modal-viewport-max-h flex flex-col overflow-hidden`}
      >
        {/* Header */}
        {!noHeader && (
          <div className="flex items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <h3 className="min-w-0 flex-1 text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
              {title}
            </h3>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors flex-shrink-0"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Scrollable body */}
        <div
          className={`overflow-y-auto overflow-x-auto flex-1 ${noPadding ? "" : "px-4 py-3 sm:px-6 sm:py-4"}`}
        >
          {children}
        </div>

        {/* Sticky footer (optional) */}
        {footer && (
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 px-4 py-3 sm:px-6 sm:py-4 bg-gray-50 dark:bg-gray-800/80">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
