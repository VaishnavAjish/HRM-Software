import { useCallback, useRef, useState } from "react";

/**
 * Session-scoped undo/redo command stack. Every mutating chart action wraps
 * its API call as a {label, do, undo} command and runs it through
 * `run()` — do() has already fired by the time it lands in history, undo()
 * replays the inverse organizationApi call from a pre-action snapshot.
 *
 * Not persisted across reload — that's a deliberate, documented limitation
 * (see the plan's "Known limitations"), not an oversight.
 */
export function useChartHistory() {
  const past = useRef([]);
  const future = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [pending, setPending] = useState(false);
  const [lastLabel, setLastLabel] = useState(null);

  const sync = useCallback(() => {
    setCanUndo(past.current.length > 0);
    setCanRedo(future.current.length > 0);
    setLastLabel(past.current[past.current.length - 1]?.label ?? null);
  }, []);

  const run = useCallback(async (command) => {
    await command.do();
    past.current.push(command);
    future.current = [];
    sync();
  }, [sync]);

  const undo = useCallback(async () => {
    const command = past.current[past.current.length - 1];
    if (!command) return null;
    setPending(true);
    try {
      await command.undo();
      past.current.pop();
      future.current.push(command);
      return command;
    } finally {
      setPending(false);
      sync();
    }
  }, [sync]);

  const redo = useCallback(async () => {
    const command = future.current[future.current.length - 1];
    if (!command) return null;
    setPending(true);
    try {
      await command.do();
      future.current.pop();
      past.current.push(command);
      return command;
    } finally {
      setPending(false);
      sync();
    }
  }, [sync]);

  const reset = useCallback(() => {
    past.current = [];
    future.current = [];
    sync();
  }, [sync]);

  return { run, undo, redo, reset, canUndo, canRedo, pending, lastLabel };
}
