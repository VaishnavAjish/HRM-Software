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
}) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

  return createPortal(
    <div className="modal-overlay fixed bottom-0 left-0 right-0 top-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className="absolute bottom-0 left-0 right-0 top-0"
        onClick={onClose}
      />
      <div
        className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full ${sizes[size]} max-h-[90vh] flex flex-col`}
      >
        {/* Header */}
        {!noHeader && (
          <div className="flex items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <h3 className="min-w-0 flex-1 text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
              {title}
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors flex-shrink-0"
            >
              <X size={18} />
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
