import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, Check, ChevronDown, CircleDashed, CircleSlash2, Clock } from "lucide-react";
import { BLOCKED_STATES, STATE_META, STATE_OPTIONS, STATE_TONE } from "../models/permissionStates";

const ICONS = {
  ALLOW: Check,
  DENY: Ban,
  CONDITIONAL: Clock,
  NOT_ASSIGNED: CircleDashed,
};

/**
 * Only one state picker may be open at a time.
 *
 * A module-level event rather than shared React state: the pickers are siblings
 * rendered per row, and threading an "open row" through the table would couple
 * every row's render to whichever one happens to be open.
 */
const OPEN_EVENT = "permission-state-select:open";

/**
 * The configured-state control.
 *
 * A native <select> cannot show an icon, a description and a reason an option is
 * unavailable, and it cannot be styled consistently across browsers — so this is
 * a listbox built to the ARIA pattern instead.
 *
 * The unavailable option is `aria-disabled`, not `disabled`, and stays reachable
 * with the arrow keys. That is deliberate: a skipped option is invisible to a
 * screen-reader user, who would never learn why Conditional cannot be chosen.
 * It can be landed on and read; it just refuses to be selected.
 *
 * This component decides nothing about authorization. It renders the configured
 * state and emits changes; effective access stays the server's answer.
 */
export default function PermissionStateSelect({
  value,
  onChange,
  label,
  disabled = false,
  conditionalAvailable = false,
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState(null);

  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const instanceId = useId();
  const listboxId = `${instanceId}-listbox`;

  const isAvailable = useCallback(
    (option) => option.value !== "CONDITIONAL" || conditionalAvailable,
    [conditionalAvailable],
  );

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openMenu = useCallback(() => {
    const current = STATE_OPTIONS.findIndex((option) => option.value === value);
    setActiveIndex(current >= 0 ? current : 0);
    setOpen(true);
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: instanceId }));
  }, [value, instanceId]);

  // Another picker opening closes this one.
  useEffect(() => {
    const onOtherOpened = (event) => {
      if (event.detail !== instanceId) setOpen(false);
    };

    window.addEventListener(OPEN_EVENT, onOtherOpened);
    return () => window.removeEventListener(OPEN_EVENT, onOtherOpened);
  }, [instanceId]);

  // Anchored to the trigger in viewport coordinates and rendered through a
  // portal, so no scroll container or sticky header can clip it.
  useLayoutEffect(() => {
    if (!open) return undefined;

    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const menuHeight = menuRef.current?.offsetHeight ?? 280;
      const below = window.innerHeight - rect.bottom;
      const flip = below < menuHeight && rect.top > below;

      setPosition({
        top: flip ? Math.max(8, rect.top - menuHeight - 4) : rect.bottom + 4,
        left: Math.min(rect.left, Math.max(8, window.innerWidth - 296)),
      });
    };

    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);

    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const commit = (option) => {
    if (!isAvailable(option)) return;

    close();
    if (option.value !== value) onChange(option.value);
  };

  const step = (delta) => {
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return STATE_OPTIONS.length - 1;
      if (next >= STATE_OPTIONS.length) return 0;
      return next;
    });
  };

  const onKeyDown = (event) => {
    // Every key handled here is stopped from reaching the permission row, which
    // owns Enter, Space and the arrow keys for selection and expand/collapse.
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };

    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        handled();
        openMenu();
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown": handled(); step(1); break;
      case "ArrowUp": handled(); step(-1); break;
      case "Home": handled(); setActiveIndex(0); break;
      case "End": handled(); setActiveIndex(STATE_OPTIONS.length - 1); break;
      case "Enter":
      case " ": handled(); commit(STATE_OPTIONS[activeIndex]); break;
      case "Escape": handled(); close(); break;
      case "Tab": setOpen(false); break;
      default: break;
    }
  };

  const meta = STATE_META[value] ?? STATE_META.NOT_ASSIGNED;
  const TriggerIcon = ICONS[value] ?? CircleDashed;
  const triggerTone = STATE_TONE[STATE_OPTIONS.find((o) => o.value === value)?.tone ?? "neutral"];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={`Configured state for ${label}`}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onKeyDown}
        className="inline-flex h-8 min-w-[136px] items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
      >
        <TriggerIcon size={13} className={triggerTone.icon} aria-hidden="true" />
        <span className="flex-1 text-left">{meta.label}</span>
        <ChevronDown size={12} className="text-gray-400" aria-hidden="true" />
      </button>

      {open && position && createPortal(
        <ul
          ref={menuRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-label={`Configured state for ${label}`}
          aria-activedescendant={`${instanceId}-option-${activeIndex}`}
          onKeyDown={onKeyDown}
          style={{ top: position.top, left: position.left }}
          className="fixed z-[60] w-[288px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          {STATE_OPTIONS.map((option, index) => {
            const OptionIcon = ICONS[option.value];
            const tone = STATE_TONE[option.tone];
            const selected = option.value === value;
            const available = isAvailable(option);
            const active = index === activeIndex;

            return (
              <li
                key={option.value}
                id={`${instanceId}-option-${index}`}
                role="option"
                aria-selected={selected}
                aria-disabled={!available}
                onClick={() => commit(option)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex cursor-pointer gap-2.5 px-3 py-2 ${
                  active ? "bg-gray-100 dark:bg-gray-700/70" : ""
                } ${selected ? tone.selected : ""} ${
                  available ? "" : "cursor-not-allowed opacity-70"
                }`}
              >
                <OptionIcon
                  size={14}
                  className={`mt-0.5 shrink-0 ${available ? tone.icon : "text-gray-400 dark:text-gray-500"}`}
                  aria-hidden="true"
                />

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={`text-xs font-semibold ${available ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}>
                      {STATE_META[option.value].label}
                    </span>
                    {!available && (
                      <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                        <CircleSlash2 size={9} aria-hidden="true" /> Unavailable
                      </span>
                    )}
                  </span>

                  <span className="mt-0.5 block text-[11px] text-gray-500 dark:text-gray-400">
                    {option.summary}
                  </span>

                  {!available && (
                    <span className="mt-1 block text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                      {BLOCKED_STATES[option.value] ?? option.unavailableReason}
                    </span>
                  )}
                </span>

                {selected && (
                  <Check size={13} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </>
  );
}
