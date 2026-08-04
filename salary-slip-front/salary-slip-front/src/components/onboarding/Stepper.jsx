export default function Stepper({ steps = [] }) {
  return (
    <ol className="flex overflow-x-auto py-1">
      {steps.map((step, i) => {
        const done = step.state === "done";
        const now = step.state === "now";
        return (
          <li key={step.label} className="relative flex min-w-[132px] flex-1 items-start gap-2.5">
            {i < steps.length - 1 ? (
              <span
                className={`absolute top-[13px] h-0.5 ${done ? "bg-emerald-600" : "bg-gray-200 dark:bg-gray-800"}`}
                style={{ left: "calc(50% + 18px)", right: "calc(-50% + 18px)" }}
              />
            ) : null}
            <span
              className={`relative z-10 grid h-[27px] w-[27px] shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold ${
                done
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : now
                    ? "border-brand-500 bg-white text-brand-600 ring-4 ring-brand-500/15 dark:bg-gray-900 dark:text-brand-400"
                    : "border-gray-300 bg-white text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-600"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className="pt-0.5">
              <b className="block text-[12.5px] font-semibold">{step.label}</b>
              {step.caption ? (
                <small className="text-[11px] text-gray-400 dark:text-gray-500">{step.caption}</small>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
