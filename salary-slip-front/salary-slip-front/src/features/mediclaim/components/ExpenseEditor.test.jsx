import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ExpenseEditor from "./ExpenseEditor";
import { EXPENSE_CATEGORIES } from "../models/expenseCategories";

function emptyLines() {
  return EXPENSE_CATEGORIES.map((c) => ({ category: c.key, amount: "", description: "" }));
}

describe("ExpenseEditor", () => {
  it("renders one row per expense category", () => {
    render(<ExpenseEditor lines={emptyLines()} onChange={() => {}} />);
    for (const category of EXPENSE_CATEGORIES) {
      expect(screen.getByText(category.label)).toBeInTheDocument();
    }
  });

  it("shows a zero running total with no amounts entered", () => {
    render(<ExpenseEditor lines={emptyLines()} onChange={() => {}} />);
    expect(screen.getByText("Your Total")).toBeInTheDocument();
    expect(screen.getByText("₹0.00")).toBeInTheDocument();
  });

  it("always shows the office-calculates-the-final-amount disclaimer", () => {
    render(<ExpenseEditor lines={emptyLines()} onChange={() => {}} />);
    expect(
      screen.getByText(/the office calculates and approves the final amount/i),
    ).toBeInTheDocument();
  });

  it("updates the running total as the caller feeds back new line amounts (controlled component)", () => {
    const { rerender } = render(<ExpenseEditor lines={emptyLines()} onChange={() => {}} />);
    expect(screen.getByText("₹0.00")).toBeInTheDocument();

    const withAmounts = EXPENSE_CATEGORIES.map((c, i) => ({
      category: c.key,
      amount: i === 0 ? "1000" : i === 1 ? "500.50" : "",
      description: "",
    }));
    rerender(<ExpenseEditor lines={withAmounts} onChange={() => {}} />);

    expect(screen.getByText("₹1,500.50")).toBeInTheDocument();
  });

  it("calls onChange with the updated line when an amount is typed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExpenseEditor lines={emptyLines()} onChange={onChange} />);

    const firstCategory = EXPENSE_CATEGORIES[0];
    const amountInputs = screen.getAllByPlaceholderText("0.00");
    await user.type(amountInputs[0], "9");

    expect(onChange).toHaveBeenCalled();
    const lastCallLines = onChange.mock.calls.at(-1)[0];
    const updatedRow = lastCallLines.find((l) => l.category === firstCategory.key);
    expect(updatedRow.amount).toBe("9");
  });

  it("disables every input and suppresses onChange when readOnly", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExpenseEditor lines={emptyLines()} onChange={onChange} readOnly />);

    const amountInputs = screen.getAllByPlaceholderText("0.00");
    for (const input of amountInputs) {
      expect(input).toBeDisabled();
    }
    await user.type(amountInputs[0], "9");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a passed-in validation error", () => {
    render(<ExpenseEditor lines={emptyLines()} onChange={() => {}} error="Add at least one expense line item." />);
    expect(screen.getByText("Add at least one expense line item.")).toBeInTheDocument();
  });
});
