import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ShieldAlert, Clock, CheckCircle2, XCircle, Maximize2, AlertTriangle, Loader2, CalendarClock,
} from "lucide-react";
import { publicQuizApi } from "../../utils/api";

/*
 * Candidate-facing proctored quiz runner.
 *
 * On what "prevent switching" can actually mean in a browser: a web page
 * cannot block the OS or the browser chrome, so it genuinely cannot stop
 * someone pressing Alt-Tab or Cmd-Tab. What it CAN do — and what this does —
 * is make leaving detectable and consequential:
 *
 *   - the quiz runs in fullscreen, and exiting fullscreen is an event;
 *   - visibilitychange/blur fire the moment the tab or window loses focus;
 *   - every one of those is POSTed to the server as it happens, so closing
 *     the tab does not erase the trail;
 *   - crossing the quiz's violation threshold terminates the attempt
 *     server-side, which is the part that actually has teeth.
 *
 * Copy/paste/right-click/devtools shortcuts are blocked as friction, not as
 * security — they're trivially bypassable and are treated as such.
 */

const VIOLATION_EVENTS = {
  tab_hidden: "Switched away from the quiz tab",
  window_blur: "Quiz window lost focus",
  fullscreen_exit: "Exited fullscreen mode",
  copy_attempt: "Tried to copy quiz content",
  paste_attempt: "Tried to paste into the quiz",
  context_menu: "Opened the right-click menu",
  devtools_shortcut: "Used a developer-tools shortcut",
};

export default function CandidateQuiz() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const initializedIndexRef = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [violations, setViolations] = useState(0);
  const [warning, setWarning] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const shellRef = useRef(null);
  // Read inside event handlers that are registered once — reading the state
  // variable there would capture its value from the first render.
  const runningRef = useRef(false);
  const answersRef = useRef({});
  useEffect(() => { answersRef.current = answers; }, [answers]);

  const data = state.data;
  const running = data?.status === "in_progress" && !result;
  useEffect(() => { runningRef.current = running; }, [running]);

  // One question on screen at a time — no scrolling past to peek ahead or
  // skip around. Runs once per attempt: if the candidate reloads mid-quiz,
  // resume at the first unanswered question (from restored progress)
  // instead of always snapping back to Q1.
  useEffect(() => {
    if (!running || initializedIndexRef.current || !data?.questions?.length) return;
    initializedIndexRef.current = true;
    const restored = data.answers || [];
    const firstUnanswered = restored.findIndex((v) => v === null || v === undefined);
    setCurrentIndex(firstUnanswered === -1 ? 0 : firstUnanswered);
  }, [running, data]);

  /* ------------------------------------------------------------ load */

  const load = useCallback(async () => {
    try {
      const res = await publicQuizApi.get(token);
      if (!res.status) throw new Error(res.message || "This quiz link is not valid");
      setState({ loading: false, error: null, data: res.data });
      setViolations(res.data.violation_count || 0);
      if (res.data.seconds_remaining != null) setSecondsLeft(res.data.seconds_remaining);
      if (Array.isArray(res.data.answers)) {
        const restored = {};
        res.data.answers.forEach((v, i) => { if (v !== null && v !== undefined) restored[i] = v; });
        setAnswers(restored);
      }
      if (res.data.result) setResult(res.data.result);
    } catch (err) {
      setState({ loading: false, error: err.message || "Could not load this quiz", data: null });
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  /* ------------------------------------------------- scheduled-start gate */

  // While the link is showing its "opens at X" screen, tick every second and
  // re-check with the server the moment the clock crosses that time — the
  // server (not this countdown) is what actually decides whether `start`
  // succeeds, so a little client-clock drift here just means the button
  // appears a few seconds early or late, never an actual bypass.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const notYetOpen = data?.status === "pending" && data?.not_yet_open;
  useEffect(() => {
    if (!notYetOpen) return undefined;
    const t = setInterval(() => {
      setNowTick(Date.now());
      if (data?.scheduled_start_at && Date.now() >= new Date(data.scheduled_start_at).getTime()) {
        load();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [notYetOpen, data, load]);

  /* -------------------------------------------------- submit / terminate */

  const answersArray = useCallback(() => {
    const total = data?.quiz?.total_questions || 0;
    return Array.from({ length: total }, (_, i) => {
      const v = answersRef.current[i];
      return v === undefined ? null : v;
    });
  }, [data]);

  const doSubmit = useCallback(async (auto = false) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await publicQuizApi.submit(token, answersArray());
      if (res.status) {
        setResult(res.data);
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      } else if (!auto) {
        setWarning(res.message || "Could not submit");
      }
    } catch (err) {
      // A timed-out or already-terminated attempt returns 422 — reloading
      // surfaces the real final state rather than leaving the page stuck.
      if (auto) load(); else setWarning(err.message || "Could not submit");
    } finally {
      setSubmitting(false);
    }
  }, [token, answersArray, submitting, load]);

  /* ------------------------------------------------------- proctoring */

  const reportEvent = useCallback(async (type) => {
    if (!runningRef.current) return;
    try {
      const res = await publicQuizApi.logEvent(token, type, VIOLATION_EVENTS[type] || type, true);
      if (res?.data) {
        setViolations(res.data.violation_count);
        if (res.data.terminated) {
          runningRef.current = false;
          setWarning(null);
          await load();
        } else {
          const left = res.data.max_violations - res.data.violation_count;
          setWarning(
            `${VIOLATION_EVENTS[type] || "Proctoring violation"} — this has been recorded. ` +
            `${left} more will end your attempt automatically.`,
          );
        }
      }
    } catch {
      /* Never block the candidate on a logging failure. */
    }
  }, [token, load]);

  useEffect(() => {
    if (!running) return undefined;

    const onVisibility = () => { if (document.hidden) reportEvent("tab_hidden"); };
    const onBlur = () => reportEvent("window_blur");
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && runningRef.current) reportEvent("fullscreen_exit");
    };
    const onContextMenu = (e) => { e.preventDefault(); reportEvent("context_menu"); };
    const onCopy = (e) => { e.preventDefault(); reportEvent("copy_attempt"); };
    const onPaste = (e) => { e.preventDefault(); reportEvent("paste_attempt"); };
    const onKeyDown = (e) => {
      const k = e.key?.toLowerCase();
      const devtools =
        e.key === "F12" ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(k)) ||
        ((e.ctrlKey || e.metaKey) && k === "u");
      if (devtools) { e.preventDefault(); reportEvent("devtools_shortcut"); }
      // Browser-level shortcuts (Ctrl+T/W/N, Alt+Tab) cannot be cancelled
      // from a page — those surface via the blur/visibility handlers above.
    };
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "Your quiz is still in progress. Leaving now will be recorded.";
      return e.returnValue;
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [running, reportEvent]);

  /* ------------------------------------------------------------ timer */

  useEffect(() => {
    if (!running || secondsLeft == null) return undefined;
    if (secondsLeft <= 0) { doSubmit(true); return undefined; }
    const t = setTimeout(() => setSecondsLeft((s) => (s == null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [running, secondsLeft, doSubmit]);

  // Periodic save so a crash or a hard timeout keeps whatever was answered.
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => {
      publicQuizApi.saveProgress(token, answersArray()).catch(() => {});
    }, 20000);
    return () => clearInterval(t);
  }, [running, token, answersArray]);

  /* ------------------------------------------------------------ start */

  const start = async () => {
    try {
      if (shellRef.current?.requestFullscreen) {
        await shellRef.current.requestFullscreen().catch(() => {});
      }
      const res = await publicQuizApi.start(token);
      if (!res.status) { setWarning(res.message || "Could not start"); return; }
      await load();
    } catch (err) {
      setWarning(err.message || "Could not start this quiz");
    }
  };

  /* ----------------------------------------------------------- render */

  if (state.loading) {
    return <Centered><Loader2 className="animate-spin text-brand-500" size={30} /><p className="mt-3 text-sm text-gray-500">Loading your quiz…</p></Centered>;
  }
  if (state.error) {
    return (
      <Centered>
        <XCircle size={40} className="text-red-500" />
        <h1 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">Quiz unavailable</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{state.error}</p>
      </Centered>
    );
  }

  const finished = result || ["submitted", "terminated", "expired"].includes(data.status);

  if (finished) {
    const terminated = data.status === "terminated";
    const expired = data.status === "expired";
    const r = result || data.result || {};
    return (
      <Centered>
        {expired ? <Clock size={40} className="text-gray-400" />
          : terminated ? <ShieldAlert size={40} className="text-red-500" />
          : r.passed ? <CheckCircle2 size={40} className="text-green-500" />
          : <XCircle size={40} className="text-red-500" />}
        <h1 className="mt-3 text-xl font-semibold text-gray-900 dark:text-white">
          {expired ? "This link has expired" : terminated ? "Attempt terminated" : "Quiz submitted"}
        </h1>
        {terminated && (
          <p className="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
            Your attempt was ended automatically after repeated proctoring violations. The full activity
            log has been shared with the hiring team.
          </p>
        )}
        {!expired && r.total_questions != null && (
          <div className="mt-5 rounded-2xl border border-gray-200 dark:border-gray-700 px-8 py-5 text-center">
            <p className="text-4xl font-bold tabular-nums text-gray-900 dark:text-white">{r.score ?? 0}%</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {r.correct_count ?? 0} of {r.total_questions ?? 0} correct
            </p>
          </div>
        )}
        <p className="mt-5 text-xs text-gray-400">You can close this window. The hiring team has your result.</p>
      </Centered>
    );
  }

  /* ----------------------------------------------------- not open yet */

  if (notYetOpen) {
    const target = new Date(data.scheduled_start_at).getTime();
    const msRemaining = Math.max(0, target - nowTick);
    const totalSeconds = Math.floor(msRemaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    return (
      <Centered>
        <div className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm text-center">
          <CalendarClock size={40} className="mx-auto text-brand-500" />
          <h1 className="mt-3 text-xl font-semibold text-gray-900 dark:text-white">{data.quiz.title}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Hello {data.candidate_name || "there"} — this assessment isn't open yet.
          </p>
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
            It becomes available on <strong>{new Date(data.scheduled_start_at).toLocaleString()}</strong>
          </p>
          <div className="mt-4 flex justify-center gap-3">
            {days > 0 && <TimeBox value={days} label="days" />}
            <TimeBox value={hours} label="hrs" />
            <TimeBox value={mins} label="min" />
            <TimeBox value={secs} label="sec" />
          </div>
          <p className="mt-5 text-xs text-gray-400">
            This page will unlock automatically the moment it opens — no need to refresh.
          </p>
        </div>
      </Centered>
    );
  }

  /* -------------------------------------------------------- pre-start */

  if (data.status === "pending") {
    return (
      <div ref={shellRef} className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Centered>
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{data.quiz.title}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Hello {data.candidate_name || "there"} — please read this before you begin.
            </p>
            {data.quiz.description && (
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{data.quiz.description}</p>
            )}

            <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
              <Fact label="Questions" value={data.quiz.total_questions} />
              <Fact label="Time limit" value={`${data.duration_minutes} min`} />
              <Fact label="Pass mark" value={`${data.quiz.passing_score}%`} />
            </dl>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
                <ShieldAlert size={15} /> This quiz is proctored
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px] text-amber-800/90 dark:text-amber-300/90">
                <li>The quiz opens in fullscreen and the timer cannot be paused.</li>
                <li>Switching tabs or windows, or leaving fullscreen, is recorded.</li>
                <li>
                  After <b>{data.quiz.max_violations}</b> such events your attempt ends automatically and is
                  marked terminated.
                </li>
                <li>Copy, paste and right-click are disabled. You can submit only once.</li>
              </ul>
            </div>

            {warning && <p className="mt-3 text-sm text-red-600">{warning}</p>}

            <button
              onClick={start}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              <Maximize2 size={16} /> Start quiz in fullscreen
            </button>
          </div>
        </Centered>
      </div>
    );
  }

  /* --------------------------------------------------------- in progress */

  const total = data.questions?.length || 0;
  const answeredCount = Object.keys(answers).length;
  const low = secondsLeft != null && secondsLeft <= 60;

  return (
    <div ref={shellRef} className="min-h-screen select-none bg-gray-50 dark:bg-gray-900">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-700 dark:bg-gray-800/95">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-gray-900 dark:text-white">{data.quiz.title}</h1>
            <p className="text-xs text-gray-400">{answeredCount} of {total} answered</p>
          </div>
          {violations > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
              <ShieldAlert size={13} /> {violations}/{data.quiz.max_violations}
            </span>
          )}
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold tabular-nums ${
            low ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200"}`}>
            <Clock size={14} /> {formatTime(secondsLeft)}
          </span>
        </div>
        <div className="h-1 w-full bg-gray-100 dark:bg-gray-700">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${total ? (answeredCount / total) * 100 : 0}%` }} />
        </div>
      </header>

      {warning && (
        <div className="mx-auto mt-3 flex max-w-3xl items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{warning}</span>
        </div>
      )}

      <main className="mx-auto max-w-3xl space-y-3 px-4 py-5">
        {(() => {
          const q = data.questions[currentIndex];
          if (!q) return null;
          const isLast = currentIndex === total - 1;
          const answered = answers[currentIndex] !== undefined;

          const goNext = () => {
            if (!answered) { setWarning("Pick an answer before moving to the next question."); return; }
            setWarning(null);
            setCurrentIndex((i) => Math.min(total - 1, i + 1));
          };

          return (
            <div key={currentIndex} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-semibold text-gray-400">Question {currentIndex + 1} of {total}</p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{q.text}</p>
              <div className="mt-3 space-y-2">
                {q.options.map((opt, oi) => {
                  const picked = answers[currentIndex] === oi;
                  return (
                    <label
                      key={oi}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition ${
                        picked
                          ? "border-brand-500 bg-brand-50 text-brand-900 dark:bg-brand-900/20 dark:text-brand-200"
                          : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${currentIndex}`}
                        checked={picked}
                        onChange={() => { setAnswers((a) => ({ ...a, [currentIndex]: oi })); setWarning(null); }}
                        className="accent-brand-600"
                      />
                      <span className="text-gray-700 dark:text-gray-200">{opt}</span>
                    </label>
                  );
                })}
              </div>

              <div className="mt-5 flex items-center gap-2">
                <button
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  disabled={currentIndex === 0}
                  className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/40"
                >
                  Back
                </button>
                {isLast ? (
                  <button
                    onClick={() => {
                      if (!answered) { setWarning("Pick an answer before submitting."); return; }
                      if (window.confirm("Submit your quiz? You cannot change your answers afterwards.")) doSubmit(false);
                    }}
                    disabled={submitting}
                    className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
                  >
                    {submitting ? "Submitting…" : "Submit quiz"}
                  </button>
                ) : (
                  <button
                    onClick={goNext}
                    disabled={!answered}
                    className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
                  >
                    Next question
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------- helpers */

function formatTime(s) {
  if (s == null) return "--:--";
  const safe = Math.max(0, s);
  const m = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function Centered({ children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-10 text-center dark:bg-gray-900">
      {children}
    </div>
  );
}

function TimeBox({ value, label }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 min-w-[56px]">
      <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{String(value).padStart(2, "0")}</p>
      <p className="text-[10px] uppercase text-gray-400">{label}</p>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-200 py-2 dark:border-gray-700">
      <dd className="text-lg font-bold text-gray-900 dark:text-white">{value}</dd>
      <dt className="text-[11px] text-gray-500 dark:text-gray-400">{label}</dt>
    </div>
  );
}
