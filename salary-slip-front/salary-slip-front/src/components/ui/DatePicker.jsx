import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, Clock } from "lucide-react";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Clock-face marks — `i` is the position index (0 = top, clockwise), used
 *  by pointOnCircle; `value`/`label` are what clicking that mark sets. */
const HOUR_MARKS = Array.from({ length: 12 }, (_, idx) => {
  const value = idx + 1;
  return { value, label: String(value), i: value % 12 };
});
const MINUTE_MARKS = Array.from({ length: 12 }, (_, idx) => {
  const value = idx * 5;
  return { value, label: String(value).padStart(2, "0"), i: idx };
});

function pad(n) { return String(n).padStart(2, "0"); }

// Clock-face geometry — kept as constants since the mark positions, hand
// length, and container size all have to agree with each other.
const FACE_SIZE = 164;
const FACE_CENTER = FACE_SIZE / 2;
const FACE_RADIUS = 60;
const HAND_LENGTH = 54;

// Matches the popover's `w-[21rem]` class below — used to keep it from
// running off the right edge of narrow viewports (see reposition/openPicker).
const POPOVER_WIDTH = 336;

/** "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" -> {y,m,d,hh,mm} (m is 0-indexed), or null. */
function parseValue(value) {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  const [y, m, d] = (datePart || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  let hh = 0, mm = 0;
  if (timePart) {
    const [h, mi] = timePart.split(":").map(Number);
    hh = h || 0; mm = mi || 0;
  }
  return { y, m: m - 1, d, hh, mm };
}

function toValue({ y, m, d, hh, mm }, withTime) {
  const datePart = `${y}-${pad(m + 1)}-${pad(d)}`;
  return withTime ? `${datePart}T${pad(hh)}:${pad(mm)}` : datePart;
}

/** Position of clock-face mark `i` (0 = top/12-o'clock, going clockwise) on
 *  a circle of the given radius around (center, center). */
function pointOnCircle(i, radius, center, totalMarks = 12) {
  const rad = (i * (360 / totalMarks)) * (Math.PI / 180);
  return { x: center + radius * Math.sin(rad), y: center - radius * Math.cos(rad) };
}

/** Pointer position -> clockwise degrees from 12-o'clock (0-360). */
function angleFromCenter(clientX, clientY, rect) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  let deg = Math.atan2(dx, -dy) * (180 / Math.PI);
  if (deg < 0) deg += 360;
  return deg;
}

function formatDisplay(parsed, withTime) {
  if (!parsed) return "";
  const datePart = `${String(parsed.d).padStart(2, "0")} ${MONTHS[parsed.m].slice(0, 3)} ${parsed.y}`;
  if (!withTime) return datePart;
  const h12 = parsed.hh % 12 === 0 ? 12 : parsed.hh % 12;
  const ampm = parsed.hh < 12 ? "AM" : "PM";
  return `${datePart}, ${h12}:${pad(parsed.mm)} ${ampm}`;
}

/**
 * A self-built calendar + time popover, styled to match the app instead of
 * whatever OS/browser skin `<input type="date">`/`type="datetime-local">`
 * happens to render. No date-picker library — this environment can't
 * reliably run `npm install` (see RichTextEditor's note on the same
 * constraint), so a new dependency here would be unverifiable.
 *
 * Emits/accepts the exact same string format the native inputs did
 * ("YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"), so every call site just swaps the
 * `<input>` tag for this component with no other changes.
 */
export default function DatePicker({ value, onChange, withTime = false, placeholder, min, required, className = "" }) {
  const [open, setOpen] = useState(false);
  const parsed = useMemo(() => parseValue(value), [value]);
  const minParsed = useMemo(() => parseValue(min), [min]);

  const today = new Date();
  const [viewY, setViewY] = useState(parsed?.y ?? today.getFullYear());
  const [viewM, setViewM] = useState(parsed?.m ?? today.getMonth());

  // Rendered via a portal (see below) rather than a plain absolutely-
  // positioned child, because every call site here lives inside a Modal
  // whose body is `overflow-y-auto` — an in-flow popover would get visually
  // clipped the moment it's near the scroll boundary. Portaling to
  // `document.body` with `position: fixed` coordinates escapes that
  // entirely; the tradeoff is the outside-click check has to test against
  // both the trigger AND the portaled popover, since they're no longer in
  // the same DOM subtree.
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const faceRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const [faceMode, setFaceMode] = useState("hour"); // "hour" | "minute" — which ring the clock face is currently editing
  // Date and time are shown one at a time, not stacked in one long popover —
  // picking a day advances straight to the time step (when withTime), the
  // same "act, then move on" flow the clock face itself already uses.
  const [step, setStep] = useState("date"); // "date" | "time"

  // Flips the popover above the trigger when it doesn't fit below — without
  // this, a tall (calendar + clock face) popover near the bottom of the
  // viewport just runs off-screen instead of repositioning, which is exactly
  // what happened inside the "Schedule Interview" modal.
  const reposition = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const estimatedHeight = popoverRef.current?.getBoundingClientRect().height || (withTime ? 520 : 300);
    const spaceBelow = window.innerHeight - r.bottom;
    const shouldFlip = estimatedHeight > spaceBelow - 8 && r.top > spaceBelow;
    const top = shouldFlip
      ? Math.max(8, r.top - estimatedHeight - 4)
      : r.bottom + 4;
    // Keep the (fixed-width) popover from running off the right edge on
    // narrow viewports — the trigger's left edge alone isn't safe once the
    // popover is wider than the remaining space beside it.
    const popoverWidth = popoverRef.current?.getBoundingClientRect().width || POPOVER_WIDTH;
    const maxLeft = window.innerWidth - popoverWidth - 8;
    const left = Math.min(r.left, Math.max(8, maxLeft));
    setCoords({ top, left, width: r.width });
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, faceMode]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openPicker = () => {
    if (parsed) { setViewY(parsed.y); setViewM(parsed.m); }
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      const maxLeft = window.innerWidth - POPOVER_WIDTH - 8;
      const left = Math.min(r.left, Math.max(8, maxLeft));
      setCoords({ top: r.bottom + 4, left, width: r.width });
    }
    setFaceMode("hour");
    setStep("date");
    setOpen(true);
  };

  const commit = (patch) => {
    const base = parsed || { y: viewY, m: viewM, d: today.getDate(), hh: 9, mm: 0 };
    const next = { ...base, ...patch };
    onChange(toValue(next, withTime));
  };

  const isBeforeMin = (y, m, d) => {
    if (!minParsed) return false;
    if (y !== minParsed.y) return y < minParsed.y;
    if (m !== minParsed.m) return m < minParsed.m;
    return d < minParsed.d;
  };

  const pickDay = (y, m, d) => {
    if (isBeforeMin(y, m, d)) return;
    setViewY(y); setViewM(m);
    commit({ y, m, d });
    if (withTime) { setFaceMode("hour"); setStep("time"); }
    else setOpen(false);
  };

  const shiftMonth = (delta) => {
    let m = viewM + delta, y = viewY;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewY(y); setViewM(m);
  };

  const days = useMemo(() => {
    const firstOfMonth = new Date(viewY, viewM, 1);
    // getDay(): Sun=0..Sat=6 -> shift so Monday is first column.
    const leading = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewY, viewM, 0).getDate();
    const cells = [];
    for (let i = leading - 1; i >= 0; i--) {
      cells.push({ y: viewM === 0 ? viewY - 1 : viewY, m: viewM === 0 ? 11 : viewM - 1, d: daysInPrevMonth - i, outside: true });
    }
    for (let d = 1; d <= daysInMonth; d++) cells.push({ y: viewY, m: viewM, d, outside: false });
    while (cells.length % 7 !== 0 || cells.length < 42) {
      const last = cells[cells.length - 1];
      const next = new Date(last.y, last.m, last.d + 1);
      cells.push({ y: next.getFullYear(), m: next.getMonth(), d: next.getDate(), outside: true });
      if (cells.length >= 42) break;
    }
    return cells;
  }, [viewY, viewM]);

  const hh12 = parsed ? (parsed.hh % 12 === 0 ? 12 : parsed.hh % 12) : 9;
  const ampm = parsed ? (parsed.hh < 12 ? "AM" : "PM") : "AM";

  const setHour12 = (h12) => {
    const clamped = Math.min(12, Math.max(1, h12));
    const isPM = ampm === "PM";
    const hh = isPM ? (clamped % 12) + 12 : clamped % 12;
    commit({ hh });
  };
  const setMinute = (m) => commit({ mm: Math.min(59, Math.max(0, m)) });
  const setAmPm = (next) => {
    const base = hh12 % 12;
    commit({ hh: next === "PM" ? base + 12 : base });
  };

  // Click-or-drag on the clock face, like an actual watch, instead of
  // clicking a tiny up/down arrow N times to get from 9 to 3. Pointer
  // capture keeps move/up events targeting the face even if the finger/
  // cursor drifts outside its circle mid-drag.
  const applyAngle = (deg) => {
    if (faceMode === "hour") {
      let h = Math.round(deg / 30) % 12;
      if (h === 0) h = 12;
      setHour12(h);
    } else {
      const m = Math.round(deg / 6) % 60;
      setMinute(m);
    }
  };
  const onFacePointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    applyAngle(angleFromCenter(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()));
  };
  const onFacePointerMove = (e) => {
    if (e.buttons !== 1) return;
    applyAngle(angleFromCenter(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()));
  };
  const onFacePointerUp = () => {
    if (faceMode === "hour") setFaceMode("minute");
  };

  const popover = open && createPortal(
    (
      <div
        ref={popoverRef}
        style={{ position: "fixed", top: coords.top, left: coords.left, maxHeight: "calc(100vh - 16px)", maxWidth: "calc(100vw - 16px)" }}
        className="z-[1000] w-[21rem] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-3"
      >
          {step === "date" ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={() => shiftMonth(-1)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{MONTHS[viewM]} {viewY}</span>
                <button type="button" onClick={() => shiftMonth(1)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-y-1 text-center">
                {WEEKDAYS.map((w) => (
                  <span key={w} className="text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500">{w}</span>
                ))}
                {days.map((c, i) => {
                  const isSelected = parsed && parsed.y === c.y && parsed.m === c.m && parsed.d === c.d;
                  const isToday = today.getFullYear() === c.y && today.getMonth() === c.m && today.getDate() === c.d;
                  const disabled = isBeforeMin(c.y, c.m, c.d);
                  return (
                    <button
                      type="button"
                      key={i}
                      disabled={disabled}
                      onClick={() => pickDay(c.y, c.m, c.d)}
                      className={`h-8 w-8 mx-auto rounded-full text-xs font-medium transition-colors ${
                        disabled ? "text-gray-300 dark:text-gray-700 cursor-not-allowed"
                        : isSelected ? "bg-brand-600 text-white"
                        : c.outside ? "text-gray-300 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                        : isToday ? "text-brand-600 dark:text-brand-400 font-bold hover:bg-gray-100 dark:hover:bg-gray-700"
                        : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                      }`}
                    >
                      {c.d}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div>
              {/* Time step — reached after a day is picked. Going "Back" here
                  returns to the calendar without losing the time already set. */}
              <div className="mb-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep("date")}
                  className="flex items-center gap-1 rounded-lg py-1 pr-2 text-xs font-semibold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  <ChevronLeft size={15} /> {parsed ? formatDisplay(parsed, false) : ""}
                </button>
              </div>

              {/* Digital readout: click either half to switch which ring the
                  face below is currently editing — exactly like tapping the
                  hour/minute on a real watch's digital mode. */}
              <div className="mb-2.5 flex items-center justify-center gap-2">
                <button
                  type="button" onClick={() => setFaceMode("hour")}
                  className={`text-2xl font-bold tabular-nums transition-colors ${faceMode === "hour" ? "text-brand-600" : "text-gray-300 dark:text-gray-600 hover:text-gray-400"}`}
                >
                  {pad(hh12)}
                </button>
                <span className="text-2xl font-bold text-gray-300 dark:text-gray-600">:</span>
                <button
                  type="button" onClick={() => setFaceMode("minute")}
                  className={`text-2xl font-bold tabular-nums transition-colors ${faceMode === "minute" ? "text-brand-600" : "text-gray-300 dark:text-gray-600 hover:text-gray-400"}`}
                >
                  {pad(parsed?.mm ?? 0)}
                </button>
                <div className="ml-2 flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600">
                  {["AM", "PM"].map((p) => (
                    <button
                      type="button" key={p} onClick={() => setAmPm(p)}
                      className={`w-9 py-1.5 text-[11px] font-bold transition-colors ${
                        ampm === p
                          ? "bg-brand-600 text-white"
                          : "bg-white dark:bg-gray-700 text-gray-400 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* The watch face — click a number for an instant jump, or
                  press and drag around the dial for the exact minute. */}
              <div
                ref={faceRef}
                onPointerDown={onFacePointerDown}
                onPointerMove={onFacePointerMove}
                onPointerUp={onFacePointerUp}
                style={{ height: FACE_SIZE, width: FACE_SIZE }}
                className="relative mx-auto select-none touch-none rounded-full bg-gray-50 dark:bg-gray-900/50"
              >
                <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600" />
                <div
                  style={{
                    height: HAND_LENGTH,
                    transform: `translate(-50%, -100%) rotate(${faceMode === "hour" ? (hh12 % 12) * 30 : (parsed?.mm ?? 0) * 6}deg)`,
                  }}
                  className="absolute left-1/2 top-1/2 w-0.5 origin-bottom rounded-full bg-brand-500/70"
                />
                {(faceMode === "hour" ? HOUR_MARKS : MINUTE_MARKS).map((mark) => {
                  const { x, y } = pointOnCircle(mark.i, FACE_RADIUS, FACE_CENTER);
                  const isSelected = faceMode === "hour" ? mark.value === hh12 : mark.value === Math.round((parsed?.mm ?? 0) / 5) * 5 % 60;
                  return (
                    <button
                      type="button"
                      key={mark.value}
                      onClick={() => { if (faceMode === "hour") { setHour12(mark.value); setFaceMode("minute"); } else { setMinute(mark.value); } }}
                      style={{ left: x, top: y }}
                      className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                        isSelected ? "bg-brand-600 text-white" : "text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                      }`}
                    >
                      {mark.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button" onClick={() => setOpen(false)}
                className="mt-3 w-full rounded-lg bg-brand-600 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-700"
              >
                Done
              </button>
            </div>
          )}

          {step === "date" && (
            <div className="mt-2 flex items-center justify-between border-t border-gray-100 dark:border-gray-700 pt-2">
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className="text-[11px] font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  const t = new Date();
                  pickDay(t.getFullYear(), t.getMonth(), t.getDate());
                  if (withTime) commit({ hh: t.getHours(), mm: t.getMinutes() });
                }}
                className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
              >
                Today
              </button>
            </div>
          )}
      </div>
    ),
    document.body,
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={openPicker}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-left text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${className}`}
      >
        <span className={parsed ? "" : "text-gray-400 dark:text-gray-500"}>
          {parsed ? formatDisplay(parsed, withTime) : (placeholder || (withTime ? "Select date & time" : "Select date"))}
        </span>
        {withTime ? <Clock size={14} className="shrink-0 text-gray-400" /> : <Calendar size={14} className="shrink-0 text-gray-400" />}
      </button>
      {popover}
    </div>
  );
}
