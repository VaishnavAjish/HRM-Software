import { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";

export default function SearchableSelect({
  id,
  name,
  value = "",
  onChange,
  options = [],
  placeholder = "SELECT DESIGNATION",
  disabled = false,
  error = null,
  className = "",
  buttonClassName = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Normalize options list (strings or objects with { value, label })
  const normalizedOptions = useMemo(() => {
    const list = (options || []).map((opt) => {
      if (typeof opt === "string") return { value: opt, label: opt };
      return { value: opt.value ?? opt.label ?? "", label: opt.label ?? opt.value ?? "" };
    });

    return list;
  }, [options]);

  // Filter options by search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return normalizedOptions;
    const q = searchQuery.toLowerCase().trim();
    return normalizedOptions.filter(
      (opt) =>
        String(opt.label).toLowerCase().includes(q) ||
        String(opt.value).toLowerCase().includes(q)
    );
  }, [normalizedOptions, searchQuery]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-focus search input when popover opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (val) => {
    if (disabled) return;
    onChange({ target: { name, value: val } });
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleCustomSubmit = () => {
    if (searchQuery.trim()) {
      handleSelect(searchQuery.trim().toUpperCase());
    }
  };

  const selectedLabel = useMemo(() => {
    if (!value) return placeholder;
    const found = normalizedOptions.find(
      (o) => String(o.value).trim().toUpperCase() === String(value).trim().toUpperCase()
    );
    return found ? found.label : placeholder;
  }, [normalizedOptions, value, placeholder]);

  const defaultBtnClass = `w-full flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-[13px] font-semibold text-black outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-200 text-left ${
    !value ? "text-gray-400" : ""
  }`;

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Hidden input for form accessibility */}
      <input type="hidden" id={id} name={name} value={value} />

      {/* Select trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        className={buttonClassName || defaultBtnClass}
      >
        <span className="truncate uppercase">{selectedLabel}</span>
        <ChevronDown size={14} className="ml-1 text-gray-400 shrink-0" />
      </button>

      {/* Popover Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 top-full z-[1050] mt-1 max-h-60 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
          {/* Search Header */}
          <div className="p-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <div className="relative flex items-center">
              <Search size={13} className="absolute left-2.5 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (filteredOptions.length > 0) {
                      handleSelect(filteredOptions[0].value);
                    } else {
                      handleCustomSubmit();
                    }
                  } else if (e.key === "Escape") {
                    setIsOpen(false);
                  }
                }}
                placeholder="Search designation..."
                className="w-full rounded-md border border-indigo-500 bg-white py-1.5 pl-8 pr-7 text-xs font-semibold text-gray-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 dark:border-indigo-500 dark:bg-gray-800 dark:text-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-44 overflow-y-auto p-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value).trim().toUpperCase() === String(value).trim().toUpperCase();
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs font-bold uppercase text-left transition ${
                      isSelected
                        ? "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                        : "text-gray-700 hover:bg-brand-50 hover:text-brand-700 dark:text-gray-200 dark:hover:bg-gray-700/60"
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check size={13} className="text-brand-600 shrink-0 ml-1" />}
                  </button>
                );
              })
            ) : (
              <div className="p-2 text-center text-xs text-gray-500">
                <p>No added designation in DB</p>

              </div>
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-0.5 text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
