import { useEffect, useRef, useState } from "react";

/**
 * A popover that closes when you click away or press Escape.
 *
 * Written once because every menu on this page needs it and each one that
 * implements it separately is another chance to leave a menu stuck open over
 * the table, swallowing clicks meant for the rows underneath.
 *
 * `mousedown` rather than `click`: a menu that closes on click can be dismissed
 * by the same press that was meant to activate an item inside it, which reads as
 * a dead menu option.
 */
export default function useDismissable(initial = false) {
  const [open, setOpen] = useState(initial);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return { open, setOpen, ref, toggle: () => setOpen((value) => !value) };
}
