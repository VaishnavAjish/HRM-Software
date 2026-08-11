export default function Stepper({ steps = [] }) {
  if (!steps || steps.length === 0) return null;

  return (
    <ol className="flex w-full items-center justify-between overflow-x-auto py-1.5 scrollbar-none">
      {steps.map((step, i) => {
        const done = step.state === "done";
        const now = step.state === "now";
        const isLast = i === steps.length - 1;

        return (
          <li
            key={step.label || i}
            className={`flex items-center min-w-0 ${isLast ? "shrink-0" : "flex-1 min-w-[120px]"}`}
          >
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold leading-none transition-colors ${
                  done
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : now
                      ? "border-brand-500 bg-white text-brand-600 ring-4 ring-brand-500/15 dark:bg-gray-900 dark:text-brand-400"
                      : "border-gray-300 bg-white text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <div className="min-w-0 shrink-0">
                <b className="block text-[12.5px] font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                  {step.label}
                </b>
                {step.caption ? (
                  <small className="block text-[11px] text-gray-400 dark:text-gray-500 leading-tight mt-0.5">
                    {step.caption}
                  </small>
                ) : null}
              </div>
            </div>

            {!isLast && (
              <div
                className={`h-0.5 flex-1 min-w-[12px] rounded-full mx-2.5 ${
                  done ? "bg-emerald-600" : "bg-gray-200 dark:bg-gray-700/80"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
