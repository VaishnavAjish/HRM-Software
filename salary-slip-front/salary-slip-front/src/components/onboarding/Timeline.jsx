import { Check } from "lucide-react";

const DOT_TONES = {
  ok: "border-emerald-600 text-emerald-600 dark:border-emerald-500 dark:text-emerald-400",
  warn: "border-amber-500 text-amber-600 dark:text-amber-400",
  bad: "border-rose-600 text-rose-600 dark:border-rose-500 dark:text-rose-400",
  brand: "border-brand-500 text-brand-600 dark:text-brand-400",
  idle: "border-gray-300 text-gray-400 dark:border-gray-700 dark:text-gray-600",
};

export default function Timeline({ items = [] }) {
  if (items.length === 0) {
    return <p className="text-[12.5px] text-gray-400 dark:text-gray-500">No recent activity.</p>;
  }
  return (
    <ol className="flex flex-col">
      {items.map((item, i) => (
        <li key={`${item.title}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
          {i < items.length - 1 ? (
            <span className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-800" />
          ) : null}
          <span
            className={`relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 bg-white dark:bg-gray-900 ${
              DOT_TONES[item.tone] || DOT_TONES.idle
            }`}
          >
            <Check size={11} strokeWidth={2.6} />
          </span>
          <div className="min-w-0 pt-px">
            <b className="text-[13px] font-semibold">{item.title}</b>
            {item.description ? (
              <p className="mt-px text-[12.5px] text-gray-500 dark:text-gray-400">{item.description}</p>
            ) : null}
            {item.at ? (
              <time className="font-mono text-[11px] text-gray-400 dark:text-gray-500">{item.at}</time>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
