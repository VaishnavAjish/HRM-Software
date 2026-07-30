import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import PrintableForm from "./PrintableForm";

/**
 * This form is rendered twice by the Appointment Details modal: once hidden,
 * driving Print and Download PDF, and once on screen. Only the on-screen copy is
 * given `aadhaarOverride`, so print output stays masked structurally rather than
 * by remembering to clear state before printing.
 */

const appointment = {
  fullName: "Parth R Patel",
  aadharNo: "XXXX XXXX 8793",
  panNo: "ABCDE1234E",
  bankName: "BOB",
};

describe("PrintableForm — Aadhaar rendering", () => {
  it("uses the correct spelling for the label", () => {
    render(<PrintableForm data={appointment} />);

    expect(screen.getByText("Aadhaar Card No")).toBeInTheDocument();
    expect(screen.queryByText("Aadhar Card No")).toBeNull();
  });

  it("shows the masked value when no override is given", () => {
    const { container } = render(<PrintableForm data={appointment} />);

    expect(screen.getByText("XXXX XXXX 8793")).toBeInTheDocument();
    expect(container.textContent).not.toContain("1234 5678 8793");
  });

  it("renders no reveal control by default", () => {
    render(<PrintableForm data={appointment} />);

    expect(screen.queryByRole("button", { name: /show/i })).toBeNull();
  });

  it("shows the full number only when explicitly overridden", () => {
    render(<PrintableForm data={appointment} aadhaarOverride="1234 5678 8793" />);

    expect(screen.getByText("1234 5678 8793")).toBeInTheDocument();
    expect(screen.queryByText("XXXX XXXX 8793")).toBeNull();
  });

  it("keeps the print/PDF copy masked because it gets no override", () => {
    // This is exactly how the modal renders the hidden, ref'd instance.
    const { container } = render(<PrintableForm data={appointment} />);

    expect(container.textContent).toContain("XXXX XXXX 8793");
    expect(container.textContent).not.toMatch(/\d{4} \d{4} 8793/);
  });

  it("hides the reveal control from print output", () => {
    render(
      <PrintableForm
        data={appointment}
        aadhaarAction={<button type="button">Show</button>}
      />,
    );

    const action = screen.getByRole("button", { name: /show/i });
    // print:hidden keeps the control out of the printed page.
    expect(action.parentElement).toHaveClass("print:hidden");
  });

  it("renders an empty value rather than the word undefined", () => {
    const { container } = render(<PrintableForm data={{ fullName: "X" }} />);

    expect(container.textContent).not.toContain("undefined");
  });
});
