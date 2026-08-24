import { useState, useRef, useEffect } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const FULL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function parseMonthString(str) {
  if (!str || !/^\d{4}-\d{2}$/.test(str)) return null;
  const [y, m] = str.split("-").map(Number);
  return { year: y, month: m - 1 }; // month is 0-indexed internally
}

function formatMonthString(year, month) {
  const m = (month + 1).toString().padStart(2, '0');
  return `${year}-${m}`;
}

export function MonthYearPicker({ value, onChange, min, max, placeholder = "Select month", className = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const parsedValue = parseMonthString(value);
  const currentNavDate = new Date();
  
  const [viewYear, setViewYear] = useState(parsedValue ? parsedValue.year : currentNavDate.getFullYear());
  const popoverRef = useRef(null);

  /**
   * Opening the picker should show the year the current value is in. That is a
   * consequence of the click, not something to observe after the fact — doing
   * it in an effect meant rendering the popover on the wrong year and then
   * correcting it, one cascading render every time it opened.
   */
  const toggleOpen = () => {
    if (!isOpen) {
      setViewYear(parsedValue ? parsedValue.year : new Date().getFullYear());
    }
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const minParsed = parseMonthString(min);
  const maxParsed = parseMonthString(max);

  const isMonthDisabled = (year, monthIndex) => {
    if (minParsed) {
      if (year < minParsed.year || (year === minParsed.year && monthIndex < minParsed.month)) return true;
    }
    if (maxParsed) {
      if (year > maxParsed.year || (year === maxParsed.year && monthIndex > maxParsed.month)) return true;
    }
    return false;
  };

  const handleMonthSelect = (monthIndex) => {
    if (isMonthDisabled(viewYear, monthIndex)) return;
    onChange(formatMonthString(viewYear, monthIndex));
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange("");
    setIsOpen(false);
  };

  const handleThisMonth = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth();
    if (!isMonthDisabled(y, m)) {
      onChange(formatMonthString(y, m));
      setIsOpen(false);
    }
  };

  const displayValue = parsedValue ? `${FULL_MONTHS[parsedValue.month]}, ${parsedValue.year}` : "";

  return (
    <div className={`relative ${className}`} ref={popoverRef}>
      <div 
        className="flex items-center justify-between w-full h-full cursor-pointer"
        onClick={toggleOpen}
      >
        <span className={displayValue ? "text-gray-900 dark:text-white" : "text-gray-400"}>
          {displayValue || placeholder}
        </span>
        <div className="flex items-center gap-2">
          {value && (
            <button
              type="button"
              onClick={handleClear} aria-label="Clear selected month"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X size={14} />
            </button>
          )}
          <CalendarIcon size={16} className="text-gray-400" />
        </div>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 p-3 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 w-64 max-w-[calc(100vw-2rem)] select-none">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1">
            <button
              type="button"
              className="p-2 hover:bg-white dark:hover:bg-gray-600 rounded-md text-gray-600 dark:text-gray-300 shadow-sm transition-all"
              onClick={() => setViewYear(y => y - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <span className="font-semibold text-gray-900 dark:text-white text-sm">
              {viewYear}
            </span>
            <button
              type="button"
              className="p-2 hover:bg-white dark:hover:bg-gray-600 rounded-md text-gray-600 dark:text-gray-300 shadow-sm transition-all"
              onClick={() => setViewYear(y => y + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-3 gap-2">
            {MONTHS.map((mon, idx) => {
              const disabled = isMonthDisabled(viewYear, idx);
              const isSelected = parsedValue && parsedValue.year === viewYear && parsedValue.month === idx;
              
              return (
                <button
                  key={mon}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleMonthSelect(idx)}
                  className={`
                    py-2 text-sm font-medium rounded-lg transition-colors
                    ${disabled ? 'opacity-30 cursor-not-allowed text-gray-500' : 'hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/30 dark:hover:text-brand-400 cursor-pointer'}
                    ${isSelected ? 'bg-brand-600 text-white hover:bg-brand-700 hover:text-white dark:hover:bg-brand-500' : 'text-gray-700 dark:text-gray-300'}
                  `}
                >
                  {mon}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center text-sm">
            <button
              type="button"
              onClick={handleClear}
              className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleThisMonth}
              className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
            >
              This month
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
