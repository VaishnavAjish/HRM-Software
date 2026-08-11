import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";

/*
 * A closed list of options, any number of which may be on.
 *
 * A native <select multiple> is the obvious answer and the wrong one here: it
 * requires ctrl-click to add a second value, shows no checkboxes, and silently
 * deselects everything if the user clicks a row without the modifier — which is
 * exactly how a multi-company account loses a company on an unrelated edit.
 *
 * The panel stays open while choosing, because the whole point is picking more
 * than one thing.
 */
export default function CheckboxMultiSelect({
  options = [],
  value = [],
  onChange,
  placeholder = "Select…",
  disabled = false,
  loading = false,
  error = null,
  emptyMessage = "Nothing to choose from.",
  summarise,
  id,
  // The visible "Company *" text sits in a sibling span, not a <label for>, so
  // the trigger would otherwise be announced as whatever its current value
  // happens to be — "Nidhi Impex +1" tells a screen reader nothing about what
  // is being chosen.
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const generatedId = useId();
  const listId = `${id ?? generatedId}-listbox`;

  const selected = useMemo(() => new Set(value.map(String)), [value]);

  /*
   * Options carrying a `group` are rendered under a heading.
   *
   * Needed because two companies each own a unit called "Ichapur": a flat list
   * would show the name twice with nothing to tell them apart, and whichever
   * one the operator ticked would be a coin toss.
   */
  const groups = useMemo(() => {
    const out = [];
    const index = new Map();

    for (const option of options) {
      const key = option.group ?? "";

      if (!index.has(key)) {
        index.set(key, { label: key, options: [] });
        out.push(index.get(key));
      }

      index.get(key).options.push(option);
    }

    return out;
  }, [options]);

  const grouped = groups.length > 1 || Boolean(groups[0]?.label);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // The active row is scrolled into view rather than left off-screen: arrowing
  // past the visible window with no scroll makes the list look frozen. Called
  // optionally because jsdom does not implement it, and a test environment
  // gap must not throw inside a render.
  useEffect(() => {
    if (!open || active < 0) return;
    // Queried rather than indexed into children: with grouping, children are
    // the group wrappers, not the rows.
    listRef.current?.querySelectorAll('[role="option"]')?.[active]?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  const toggle = (optionValue) => {
    const key = String(optionValue);
    const next = selected.has(key)
      ? value.filter((item) => String(item) !== key)
      : [...value, optionValue];

    onChange?.(next);
  };

  const label = () => {
    if (loading) return "Loading…";
    if (!value.length) return placeholder;
    if (summarise) return summarise(value, options);

    const names = options
      .filter((option) => selected.has(String(option.value)))
      .map((option) => option.label);

    if (names.length <= 2) return names.join(", ");
    return `${names[0]} +${names.length - 1}`;
  };

  const onKeyDown = (event) => {
    if (disabled) return;

    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }

      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => {
        if (!options.length) return -1;
        const next = current + step;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });

      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();

      if (!open) {
        setOpen(true);
        return;
      }

      if (active >= 0 && options[active]) toggle(options[active].value);
    }
  };

  const inert = disabled || loading;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        id={id}
        disabled={inert}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
          error
            ? "border-red-400 dark:border-red-500"
            : "border-gray-300 dark:border-gray-600"
        } ${
          inert
            ? "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
            : "bg-white text-gray-900 hover:border-brand-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:bg-gray-700 dark:text-white"
        }`}
      >
        <span className={`truncate ${value.length ? "" : "text-gray-400 dark:text-gray-500"}`}>
          {label()}
        </span>
        {loading
          ? <Loader2 size={15} className="flex-shrink-0 animate-spin text-gray-400" />
          : <ChevronDown size={15} className={`flex-shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>

      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}

      {open && !inert && (
        <div
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
          onKeyDown={onKeyDown}
        >
          {options.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400">{emptyMessage}</p>
          ) : (
            <div ref={listRef} id={listId} role="listbox" aria-multiselectable className="max-h-56 overflow-y-auto py-1">
              {groups.map((group) => (
                <div key={group.label || "_"} role="group" aria-label={group.label || undefined}>
                  {grouped && group.label && (
                    <p className="px-3 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      {group.label}
                    </p>
                  )}

                  {group.options.map((option) => {
                    const checked = selected.has(String(option.value));
                    const index = options.indexOf(option);

                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={checked}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => toggle(option.value)}
                        className={`flex w-full items-center gap-2.5 py-2 pr-3 text-left text-sm transition-colors ${
                          grouped ? "pl-5" : "pl-3"
                        } ${
                          index === active
                            ? "bg-gray-100 dark:bg-gray-700"
                            : "hover:bg-gray-50 dark:hover:bg-gray-700/60"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                            checked
                              ? "border-brand-600 bg-brand-600 text-white"
                              : "border-gray-300 dark:border-gray-500"
                          }`}
                        >
                          {checked && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span className="truncate text-gray-700 dark:text-gray-200">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
