import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ModernDatePicker from "./ModernDatePicker";

/**
 * The pencil in the picker header.
 *
 * It rendered with an "Edit date" label, hover styling and a pointer cursor,
 * but carried no onClick at all — the only one of the component's 311 buttons
 * that did nothing when pressed. The picker's own text input is readOnly, so
 * with the pencil inert there was no way to type a date: entering a 1985
 * birthday meant scrolling a year list that starts at 1947.
 */

/** Render and open the picker. The placeholder attribute is present whether or
 *  not the field carries a value, so it is a stable handle on the trigger. */
async function openPicker(props = {}) {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<ModernDatePicker name="dob" value="" onChange={onChange} {...props} />);
  await user.click(screen.getByPlaceholderText("Select Date"));
  return { user, onChange };
}

async function openTyping(props = {}) {
  const opened = await openPicker(props);
  await opened.user.click(screen.getByRole("button", { name: /type date/i }));
  return opened;
}

/**
 * Replace the field contents rather than append to them.
 *
 * The field prefills — with the current value, or today when there is none —
 * so typing straight into it produces "03/08/202629/02/1988". Without the
 * clear, every "this input is rejected" assertion below would pass because the
 * concatenation is garbage, not because the validation works.
 */
async function typeDate(user, text) {
  const field = screen.getByLabelText("Date");
  await user.clear(field);
  await user.type(field, text);
  return field;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ModernDatePicker — manual entry", () => {
  it("exposes the pencil as a real control", async () => {
    await openPicker();

    // Named for what it does, not "Edit date" which said nothing about the mode.
    expect(screen.getByRole("button", { name: /type date/i })).toBeInTheDocument();
  });

  it("opens a typable field when the pencil is pressed", async () => {
    await openTyping();

    const field = screen.getByLabelText("Date");
    expect(field).toBeInTheDocument();
    expect(field).not.toHaveAttribute("readonly");
  });

  it("commits a typed date through onChange in ISO form", async () => {
    const { user, onChange } = await openTyping();

    await typeDate(user, "09/03/1985");
    await user.click(screen.getByRole("button", { name: /^ok$/i }));

    // The form layer stores YYYY-MM-DD regardless of what was typed.
    expect(onChange).toHaveBeenCalledWith({
      target: { name: "dob", value: "1985-03-09" },
    });
  });

  it("refuses an impossible month and keeps the picker open", async () => {
    const { user, onChange } = await openTyping();

    await typeDate(user, "12/13/1990");
    await user.click(screen.getByRole("button", { name: /^ok$/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
  });

  it("refuses a day the month does not have", async () => {
    const { user, onChange } = await openTyping();

    // 1990 is not a leap year.
    await typeDate(user, "29/02/1990");
    await user.click(screen.getByRole("button", { name: /^ok$/i }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("accepts 29 February in a leap year", async () => {
    const { user, onChange } = await openTyping();

    await typeDate(user, "29/02/1988");
    await user.click(screen.getByRole("button", { name: /^ok$/i }));

    expect(onChange).toHaveBeenCalledWith({
      target: { name: "dob", value: "1988-02-29" },
    });
  });

  it("rejects a year outside the range the calendar offers", async () => {
    const { user, onChange } = await openTyping();

    await typeDate(user, "01/01/1899");
    await user.click(screen.getByRole("button", { name: /^ok$/i }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("marks the field invalid and explains why", async () => {
    const { user } = await openTyping();

    await typeDate(user, "31/31/2020");

    expect(screen.getByLabelText("Date")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/DD\/MM\/YYYY/i)).toBeInTheDocument();
  });

  it("does not report an error while the field is merely empty", async () => {
    const { user } = await openTyping();

    const field = await typeDate(user, "05/05/2001");
    await user.clear(field);

    // Clearing to retype is not a mistake.
    expect(field).toHaveAttribute("aria-invalid", "false");
  });

  it("prefills the field from the current value", async () => {
    await openTyping({ value: "1992-07-04" });

    expect(screen.getByLabelText("Date")).toHaveValue("04/07/1992");
  });

  it("toggles back to the calendar", async () => {
    const { user } = await openTyping();

    await user.click(screen.getByRole("button", { name: /pick date from calendar/i }));

    expect(screen.queryByLabelText("Date")).toBeNull();
    expect(screen.getByRole("button", { name: /^ok$/i })).toBeInTheDocument();
  });

  it("starts each open on the calendar rather than remembering typing mode", async () => {
    const { user } = await openTyping();

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await user.click(screen.getByPlaceholderText("Select Date"));

    expect(screen.queryByLabelText("Date")).toBeNull();
  });

  it("still lets a day be picked from the calendar", async () => {
    const { user, onChange } = await openPicker({ value: "2020-06-15" });

    await user.click(screen.getByText("10"));

    expect(onChange).toHaveBeenCalledWith({
      target: { name: "dob", value: "2020-06-10" },
    });
  });
});
