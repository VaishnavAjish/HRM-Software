import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

export default function ValidationBanner({ issues }) {
  const [open, setOpen] = useState(false);

  const errors = (issues ?? []).filter((issue) => issue.severity === "ERROR");
  const warnings = (issues ?? []).filter((issue) => issue.severity === "WARNING");

  if (errors.length === 0 && warnings.length === 0) return null;

  const tone = errors.length > 0
    ? "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
    : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300";

  return (
    <section className={`rounded-xl border px-4 py-3 text-xs ${tone}`}>
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left font-medium"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        <AlertTriangle size={14} aria-hidden="true" />
        Authorization coverage: {errors.length} error{errors.length === 1 ? "" : "s"}, {warnings.length} warning{warnings.length === 1 ? "" : "s"}
      </button>

      {open && (
        <ul className="mt-2 max-h-56 space-y-1 overflow-auto pl-6">
          {[...errors, ...warnings].map((issue, index) => (
            <li key={`${issue.code}-${issue.subject}-${index}`} className="flex gap-2">
              <span className="font-semibold">[{issue.code}]</span>
              <span className="min-w-0 flex-1">
                {issue.message}{" "}
                <code className="font-mono text-[10px] opacity-80">{issue.subject}</code>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
