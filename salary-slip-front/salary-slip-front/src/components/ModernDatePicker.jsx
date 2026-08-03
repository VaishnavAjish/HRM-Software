import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Pencil } from 'lucide-react';

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const currentYearConst = new Date().getFullYear();
const startYear = 1947;
const YEARS = Array.from({ length: currentYearConst - startYear + 1 }, (_, i) => startYear + i);

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function getDaysInMonth(year, month) {
  if (month === 1 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month];
}

function getShortDayName(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[date.getDay()];
}

function getShortMonthName(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[date.getMonth()];
}

/** DD/MM/YYYY — what the manual-entry field shows and expects back. */
function formatTyped(date) {
  if (!date || isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/**
 * Strict DD/MM/YYYY read for typed input.
 *
 * parseSafeDate() is deliberately forgiving because it also reads whatever the
 * API stored, and it falls back to `new Date(str)` — which happily turns "1"
 * into a date. Typing needs the opposite: reject anything not yet a complete,
 * real, in-range date so a half-finished entry is never committed.
 */
function parseTyped(text) {
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(String(text).trim());
  if (!match) return null;

  const d = parseInt(match[1], 10);
  const m = parseInt(match[2], 10) - 1;
  const y = parseInt(match[3], 10);

  if (m < 0 || m > 11) return null;
  if (y < startYear || y > currentYearConst) return null;
  if (d < 1 || d > getDaysInMonth(y, m)) return null;

  const date = new Date(y, m, d);
  return isNaN(date.getTime()) ? null : date;
}

function parseSafeDate(dateStr) {
  if (!dateStr) return null;
  
  if (dateStr instanceof Date) {
    return isNaN(dateStr.getTime()) ? null : dateStr;
  }

  if (typeof dateStr !== 'string') {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }

  const cleanStr = dateStr.trim();
  if (!cleanStr) return null;

  // Handle formats like YYYY-MM-DD or DD-MM-YYYY or with slashes
  const cleanParts = cleanStr.replace(/\//g, '-').split(' ')[0].split('-');
  if (cleanParts.length === 3) {
    let y = parseInt(cleanParts[0], 10);
    let m = parseInt(cleanParts[1], 10) - 1;
    let d = parseInt(cleanParts[2], 10);

    // If cleanParts[2] is 4 digits (e.g. DD-MM-YYYY), swap year and day
    if (cleanParts[2].length === 4) {
      y = parseInt(cleanParts[2], 10);
      d = parseInt(cleanParts[0], 10);
    }

    if (!isNaN(y) && !isNaN(m) && !isNaN(d) && y > 1000 && m >= 0 && m <= 11 && d > 0 && d <= 31) {
      const date = new Date(y, m, d);
      if (!isNaN(date.getTime())) return date;
    }
  }

  // Try standard parse
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export default function ModernDatePicker({
  name,
  value,
  onChange,
  className,
  placeholder = 'Select Date',
  disabled = false,
  required = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // The actual selected value that will be submitted
  const actualDate = parseSafeDate(value);
  
  // The temporary selected value while the picker is open
  const [tempDate, setTempDate] = useState(actualDate || new Date());

  // The currently viewed month/year in the calendar grid
  const [currentMonth, setCurrentMonth] = useState((actualDate || new Date()).getMonth());
  const [currentYear, setCurrentYear] = useState((actualDate || new Date()).getFullYear());

  // View modes: 'calendar' | 'year' | 'month' | 'input'
  const [viewMode, setViewMode] = useState('calendar');

  // Manual entry (the pencil in the header). Kept as raw text so a partially
  // typed date isn't fought by reformatting mid-keystroke.
  const [typedDate, setTypedDate] = useState('');
  const [typedError, setTypedError] = useState('');

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        containerRef.current && 
        !containerRef.current.contains(event.target) &&
        !event.target.closest('[data-datepicker-portal="true"]')
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePrevMonth = () => {
    if (currentYear === startYear && currentMonth === 0) return;
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentYear === currentYearConst && currentMonth === 11) return;
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const handleSelectDay = (day) => {
    const selected = new Date(currentYear, currentMonth, day);
    setTempDate(selected);
    
    const yyyy = selected.getFullYear();
    const mm = String(selected.getMonth() + 1).padStart(2, '0');
    const dd = String(selected.getDate()).padStart(2, '0');
    const formatted = `${yyyy}-${mm}-${dd}`;
    
    if (onChange) {
      onChange({ target: { name, value: formatted } });
    }
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  // Every open starts on the calendar with a clean entry field, showing the
  // currently selected date. Done here rather than in an effect so opening
  // doesn't cost an extra render pass.
  const togglePicker = () => {
    if (!isOpen) {
      setViewMode('calendar');
      setTypedError('');

      const d = parseSafeDate(value) || new Date();
      if (!isNaN(d.getTime())) {
        setTempDate(d);
        setCurrentMonth(d.getMonth());
        setCurrentYear(d.getFullYear());
      }
    }
    setIsOpen(!isOpen);
  };

  const handleToggleTypedEntry = () => {
    if (viewMode === 'input') {
      setViewMode('calendar');
      return;
    }
    setTypedDate(formatTyped(tempDate));
    setTypedError('');
    setViewMode('input');
  };

  const typedHint = `Use DD/MM/YYYY between ${startYear} and ${currentYearConst}`;

  const handleTypedChange = (event) => {
    const text = event.target.value;
    setTypedDate(text);

    // An empty field isn't an error yet — it's a field being cleared to retype.
    if (!text.trim()) {
      setTypedError('');
      return;
    }

    const parsed = parseTyped(text);
    if (!parsed) {
      setTypedError(typedHint);
      return;
    }

    setTypedError('');
    setTempDate(parsed);
    setCurrentMonth(parsed.getMonth());
    setCurrentYear(parsed.getFullYear());
  };

  const handleOk = () => {
    let commit = tempDate;

    // Typing "12/13/1990" and pressing OK used to be impossible to reach; now
    // that it is, an unparseable entry has to stop here. Closing anyway would
    // save whatever the calendar happened to be showing, which is not what the
    // person typed.
    if (viewMode === 'input') {
      const parsed = parseTyped(typedDate);
      if (!parsed) {
        setTypedError(typedHint);
        return;
      }
      commit = parsed;
    }

    const yyyy = commit.getFullYear();
    const mm = String(commit.getMonth() + 1).padStart(2, '0');
    const dd = String(commit.getDate()).padStart(2, '0');
    const formatted = `${yyyy}-${mm}-${dd}`;

    if (onChange) {
      onChange({ target: { name, value: formatted } });
    }
    setIsOpen(false);
  };

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);

  const renderDays = () => {
    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="w-9 h-9"></div>);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      const isSelected = actualDate && tempDate.getFullYear() === currentYear && tempDate.getMonth() === currentMonth && tempDate.getDate() === day;
      const isToday = new Date().getFullYear() === currentYear && new Date().getMonth() === currentMonth && new Date().getDate() === day;
      
      let dayClass = "w-9 h-9 flex items-center justify-center text-sm rounded-full transition-colors cursor-pointer ";
      if (isSelected) {
        dayClass += "bg-brand-600 text-white font-medium shadow-sm dark:bg-brand-500";
      } else if (isToday) {
        dayClass += "border-2 border-brand-500 text-brand-600 font-medium dark:text-brand-400";
      } else {
        dayClass += "text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10";
      }

      days.push(
        <div key={day} onClick={() => handleSelectDay(day)} className="flex items-center justify-center w-9 h-9">
          <div className={dayClass}>
            {day}
          </div>
        </div>
      );
    }
    return days;
  };

  const displayValue = actualDate ? actualDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        className={`relative w-full cursor-pointer group ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        onClick={togglePicker}
      >
        <input
          type="text"
          readOnly
          value={displayValue}
          placeholder={placeholder}
          className={className || "w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none cursor-pointer group-hover:border-brand-400 transition-colors"}
          required={required}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-brand-500 transition-colors">
          <CalendarIcon size={16} />
        </div>
      </div>

      {isOpen && createPortal(
        <div data-datepicker-portal="true" className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center pointer-events-auto cursor-default" onClick={() => setIsOpen(false)}>
          <div className="w-[320px] bg-[#f8f7fa] dark:bg-gray-900 rounded-[28px] shadow-2xl border border-black/5 dark:border-white/10 overflow-hidden flex flex-col font-sans" onClick={(e) => e.stopPropagation()}>
            
            {/* Header section */}
            <div className="px-6 pt-5 pb-4">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-6 uppercase tracking-wider">
                Select date
              </p>
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-normal text-gray-900 dark:text-white tracking-tight">
                  {getShortDayName(tempDate)}, {getShortMonthName(tempDate)} {tempDate.getDate()}
                </h2>
                <button
                  type="button"
                  onClick={handleToggleTypedEntry}
                  aria-label={viewMode === 'input' ? 'Pick date from calendar' : 'Type date'}
                  aria-pressed={viewMode === 'input'}
                  className={`transition-colors p-2 rounded-full ${
                    viewMode === 'input'
                      ? 'bg-brand-600 text-white dark:bg-brand-500'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                >
                  {viewMode === 'input'
                    ? <CalendarIcon size={20} strokeWidth={2} aria-hidden="true" />
                    : <Pencil size={20} strokeWidth={2} aria-hidden="true" />}
                </button>
              </div>
            </div>
            
            <div className="h-px bg-black/10 dark:bg-white/10 mx-6 mb-2"></div>
            
            {/* Calendar Controls & Grid */}
            <div className="px-4 pb-2 relative h-[310px]">
              {viewMode === 'calendar' && (
                <>
                  <div className="flex items-center justify-between px-2 mb-3 mt-2">
                    <div className="flex items-center gap-1 -ml-2">
                      <button 
                        type="button"
                        onClick={() => setViewMode('month')}
                        className="font-medium text-gray-800 dark:text-gray-200 text-[15px] outline-none cursor-pointer hover:bg-black/5 dark:hover:bg-white/10 px-2 py-1.5 rounded-md"
                      >
                        {MONTH_NAMES[currentMonth]}
                      </button>
                      <button 
                        type="button"
                        onClick={() => setViewMode('year')}
                        className="font-medium text-gray-800 dark:text-gray-200 text-[15px] outline-none cursor-pointer hover:bg-black/5 dark:hover:bg-white/10 px-2 py-1.5 rounded-md"
                      >
                        {currentYear}
                      </button>
                    </div>
                    <div className="flex items-center">
                      <button type="button" onClick={handlePrevMonth} aria-label="Previous month" className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition-colors">
                        <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
                      </button>
                      <button type="button" onClick={handleNextMonth} aria-label="Next month" className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition-colors">
                        <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Weekdays */}
                  <div className="grid grid-cols-7 place-items-center mb-1">
                    {DAY_NAMES.map((d, i) => (
                      <div key={i} className="text-[13px] font-medium text-gray-500 dark:text-gray-400 w-9 text-center py-2">
                        {d}
                      </div>
                    ))}
                  </div>
                  
                  {/* Days Grid */}
                  <div className="grid grid-cols-7 place-items-center gap-y-1">
                    {renderDays()}
                  </div>
                </>
              )}

              {viewMode === 'year' && (
                <div className="h-full overflow-y-auto px-2 py-2 grid grid-cols-3 gap-2">
                  {YEARS.map(y => (
                    <button
                      type="button"
                      key={y}
                      onClick={() => {
                        setCurrentYear(y);
                        setViewMode('calendar');
                      }}
                      className={`py-2 text-sm font-medium rounded-full transition-colors ${
                        y === currentYear
                          ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500"
                          : "text-gray-800 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
                      }`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              )}

              {viewMode === 'input' && (
                <div className="h-full px-4 py-6 flex flex-col">
                  <label
                    htmlFor={`${name || 'date'}-typed`}
                    className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2"
                  >
                    Date
                  </label>
                  <input
                    id={`${name || 'date'}-typed`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={typedDate}
                    onChange={handleTypedChange}
                    placeholder="DD/MM/YYYY"
                    aria-invalid={typedError ? 'true' : 'false'}
                    aria-describedby={`${name || 'date'}-typed-hint`}
                    className={`w-full bg-white dark:bg-gray-800 border rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none transition-colors ${
                      typedError
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-gray-200 dark:border-gray-700 focus:border-brand-500'
                    }`}
                  />
                  <p
                    id={`${name || 'date'}-typed-hint`}
                    className={`mt-2 text-xs ${
                      typedError ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {typedError || typedHint}
                  </p>
                </div>
              )}

              {viewMode === 'month' && (
                <div className="h-full px-2 py-4 grid grid-cols-3 gap-y-6 gap-x-2 content-center">
                  {MONTH_NAMES.map((m, idx) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => {
                        setCurrentMonth(idx);
                        setViewMode('calendar');
                      }}
                      className={`py-3 text-sm font-medium rounded-full transition-colors ${
                        idx === currentMonth
                          ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500"
                          : "text-gray-800 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
                      }`}
                    >
                      {m.substring(0, 3)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Actions */}
            <div className="px-6 py-4 flex items-center justify-end gap-2 mt-2">
              <button 
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-brand-700 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-full transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleOk}
                className="px-4 py-2 text-sm font-medium text-brand-700 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-full transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
