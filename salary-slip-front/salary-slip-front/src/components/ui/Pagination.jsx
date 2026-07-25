import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({ current, total, pageSize, onChange }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;

  const start = (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);

  const getPageNumbers = () => {
    const nums = [];
    if (pages <= 7) {
      for (let i = 1; i <= pages; i++) nums.push(i);
    } else {
      nums.push(1);
      if (current > 3) nums.push("...");
      for (
        let i = Math.max(2, current - 1);
        i <= Math.min(pages - 1, current + 1);
        i++
      )
        nums.push(i);
      if (current < pages - 2) nums.push("...");
      nums.push(pages);
    }
    return nums;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 mt-2 sm:mt-4 pb-2">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Showing{" "}
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {start}–{end}
        </span>{" "}
        of{" "}
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {total}
        </span>
      </p>
      <div className="flex flex-wrap justify-center items-center gap-1">
        <button
          onClick={() => onChange(current - 1)}
          disabled={current === 1}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300 transition"
        >
          <ChevronLeft size={16} />
        </button>
        {getPageNumbers().map((n, i) =>
          n === "..." ? (
            <span key={i} className="px-2 text-gray-400 text-sm">
              …
            </span>
          ) : (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={`w-8 h-8 text-sm rounded-lg font-medium transition ${n === current ? "bg-brand-600 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"}`}
            >
              {n}
            </button>
          ),
        )}
        <button
          onClick={() => onChange(current + 1)}
          disabled={current === pages}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300 transition"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
