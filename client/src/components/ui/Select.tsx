import React, { forwardRef } from 'react';
import { ChevronDown, ChevronUp, X, Search, XCircle } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
  searchable?: boolean;
  clearable?: boolean;
  multiple?: boolean;
  maxSelected?: number;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className = '',
      label,
      error,
      hint,
      options,
      placeholder,
      searchable = false,
      clearable = false,
      multiple = false,
      maxSelected,
      id,
      value,
      onChange,
      disabled,
      ...props
    },
    _ref
  ) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const [isOpen, setIsOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [selectedValues, setSelectedValues] = React.useState<string[]>(
      Array.isArray(value) ? value : value ? [value] : []
    );

    const filteredOptions = searchable
      ? options.filter(
          (opt) =>
            !opt.disabled &&
            opt.label.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : options;

    const handleOptionClick = (option: SelectOption) => {
      if (option.disabled) return;

      if (multiple) {
        const newValues = selectedValues.includes(option.value)
          ? selectedValues.filter((v) => v !== option.value)
          : [...selectedValues, option.value];

        if (maxSelected && newValues.length > maxSelected) return;

        setSelectedValues(newValues);
        onChange?.({ target: { value: newValues, name: props.name } } as any);
      } else {
        setSelectedValues([option.value]);
        onChange?.({ target: { value: option.value, name: props.name } } as any);
        setIsOpen(false);
      }
    };

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedValues([]);
      onChange?.({ target: { value: multiple ? [] : '', name: props.name } } as any);
      setIsOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    React.useEffect(() => {
      if (value !== undefined) {
        setSelectedValues(Array.isArray(value) ? value : value ? [value] : []);
      }
    }, [value]);

    const displayValue = multiple
      ? selectedValues.map((v) => options.find((o) => o.value === v)?.label).join(', ')
      : options.find((o) => o.value === selectedValues[0])?.label || '';

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <div
            className={`
              w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg
              transition-all duration-200
              focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent
              ${disabled ? 'bg-slate-100 dark:bg-slate-800 cursor-not-allowed' : 'hover:border-slate-300'}
              ${error ? 'border-rose-500' : ''}
              ${className}
            `}
            onClick={() => !disabled && setIsOpen(!isOpen)}
            onKeyDown={handleKeyDown}
            tabIndex={disabled ? -1 : 0}
            role="combobox"
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-label={label}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
          >
            <div className="flex items-center justify-between px-4 py-2.5 min-h-[44px]">
              <div className="flex-1 flex items-center gap-2 min-w-0">
                {searchable && isOpen && (
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder={placeholder || 'Search...'}
                      className="w-full pl-8 pr-4 py-1.5 text-sm bg-transparent border-0 focus:outline-none text-slate-900 dark:text-white"
                      autoFocus
                    />
                  </div>
                )}
                {!searchable || !isOpen ? (
                  <span className={`
                    truncate block
                    ${displayValue ? 'text-slate-900 dark:text-white' : 'text-slate-400'}
                    ${multiple && selectedValues.length > 0 && 'flex flex-wrap gap-1.5'}
                  `}>
                    {multiple && selectedValues.length > 0 ? (
                      selectedValues.map((val) => {
                        const opt = options.find((o) => o.value === val);
                        return (
                          <span
                            key={val}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-full text-xs"
                          >
                            {opt?.icon && <span>{opt.icon}</span>}
                            {opt?.label}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOptionClick({ value: val, label: opt?.label || '' });
                              }}
                              className="hover:bg-indigo-100 rounded-full p-0.5"
                              aria-label={`Remove ${opt?.label}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })
                    ) : (
                      displayValue || placeholder
                    )}
                  </span>
                ) : null}
                {clearable && selectedValues.length > 0 && !disabled && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="p-1 text-slate-400 hover:text-rose-500 rounded transition-colors"
                    aria-label="Clear selection"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 ml-2">
                {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
              </div>
            </div>
          </div>

          {isOpen && !disabled && (
            <div
              className={`
                absolute z-50 w-full mt-1.5
                bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg
                max-h-60 overflow-auto
              `}
              role="listbox"
              aria-label={label}
            >
              {searchable && (
                <div className="p-2 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search options..."
                      className="w-full pl-8 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}
              <div className="py-1">
                {filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selectedValues.includes(option.value)}
                    aria-disabled={option.disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOptionClick(option);
                    }}
                    className={`
                      w-full px-4 py-2.5 text-sm text-left transition-colors
                      flex items-center gap-2
                      ${option.disabled
                        ? 'text-slate-400 cursor-not-allowed'
                        : selectedValues.includes(option.value)
                        ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }
                    `}
                    disabled={option.disabled}
                  >
                    {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                    <span className="truncate">{option.label}</span>
                  </button>
                ))}
                {filteredOptions.length === 0 && (
                  <div className="px-4 py-3 text-center text-sm text-slate-400">
                    {searchable ? 'No options match your search' : 'No options available'}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <p id={`${selectId}-error`} className="mt-1.5 text-sm text-rose-500" role="alert">
              {error}
            </p>
          )}
          {hint && !error && (
            <p id={`${selectId}-hint`} className="mt-1.5 text-sm text-slate-400">
              {hint}
            </p>
          )}
        </div>
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Select;