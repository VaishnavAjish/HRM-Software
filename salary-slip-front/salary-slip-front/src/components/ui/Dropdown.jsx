import { useEffect, useRef, useState } from "react";

export default function Dropdown({
  trigger,
  items = [],
  align = "right",
  label = "Options",
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative inline-block" ref={containerRef}>
      {trigger({ open, toggle: () => setOpen((prev) => !prev) })}

      {open && (
        <div
          className={`absolute z-20 mt-2 w-64 rounded-2xl border border-gray-100 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-800 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {label && (
            <p className="px-3 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              {label}
            </p>
          )}

          <div className="flex flex-col">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-gray-50 dark:hover:bg-gray-700/60"
              >
                <span
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                    item.iconBg || "bg-gray-100 dark:bg-gray-700"
                  } ${item.iconColor || "text-gray-600 dark:text-gray-300"}`}
                >
                  {item.icon}
                </span>
                <span className={item.labelColor || "text-gray-700 dark:text-gray-200"}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
