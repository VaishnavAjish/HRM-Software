import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Avatar,
  BarList,
  FilterChips,
  KpiTile,
  ProgressBar,
  Sparkline,
  StatusPill,
  initials,
  toneForPercent,
} from "./primitives";
import { DOCUMENTS } from "../../utils/onboardingMocks";

describe("initials", () => {
  it("takes the first two words", () => {
    expect(initials("Shailesh Bahadur Singh")).toBe("SB");
    expect(initials("Priya Nair")).toBe("PN");
  });

  it("survives a single name and empty input", () => {
    expect(initials("Meera")).toBe("M");
    expect(initials("")).toBe("");
  });
});

describe("toneForPercent", () => {
  it("escalates as completion falls", () => {
    expect(toneForPercent(95)).toBe("ok");
    expect(toneForPercent(70)).toBe("brand");
    expect(toneForPercent(20)).toBe("warn");
  });
});

describe("ProgressBar", () => {
  it("exposes the value to assistive technology", () => {
    render(<ProgressBar value={72} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "72");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("clamps out-of-range values rather than overflowing the track", () => {
    render(<ProgressBar value={140} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("clamps negatives to zero", () => {
    render(<ProgressBar value={-20} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });
});

describe("Sparkline", () => {
  it("renders nothing for a series too short to plot", () => {
    const { container } = render(<Sparkline values={[5]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("draws a path for a real series", () => {
    const { container } = render(<Sparkline values={[1, 4, 2, 8]} />);
    expect(container.querySelectorAll("path").length).toBe(2);
  });

  it("does not divide by zero on a flat series", () => {
    const { container } = render(<Sparkline values={[5, 5, 5]} />);
    const d = container.querySelector("path").getAttribute("d");
    expect(d).not.toContain("NaN");
  });
});

describe("BarList", () => {
  it("renders every label and value", () => {
    render(<BarList items={[{ label: "IT", value: 9 }, { label: "Finance", value: 7 }]} />);
    expect(screen.getByText("IT")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
  });

  it("survives an all-zero set without dividing by zero", () => {
    const { container } = render(<BarList items={[{ label: "None", value: 0 }]} />);
    expect(container.innerHTML).not.toContain("NaN");
  });
});

describe("FilterChips", () => {
  it("marks only the active option as pressed", () => {
    render(
      <FilterChips
        value="ALL"
        options={[
          { value: "ALL", label: "All" },
          { value: "PENDING", label: "Pending" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: /All/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Pending/ })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("KpiTile", () => {
  it("renders as a button only when it can be opened", () => {
    const { rerender, container } = render(<KpiTile label="Joiners" value={42} />);
    expect(container.querySelector("button")).toBeNull();
    rerender(<KpiTile label="Joiners" value={42} onClick={() => {}} />);
    expect(container.querySelector("button")).not.toBeNull();
  });
});

describe("StatusPill and Avatar", () => {
  it("falls back to a neutral tone for an unknown value", () => {
    render(<StatusPill tone="nonsense">Unknown</StatusPill>);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("hides the decorative avatar from screen readers", () => {
    const { container } = render(<Avatar name="Priya Nair" />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("identity masking", () => {
  it("never ships a full twelve-digit Aadhaar in the document fixtures", () => {
    const aadhaar = DOCUMENTS.find((d) => d.type === "Aadhaar");
    expect(aadhaar.summary).toMatch(/•/);
    expect(aadhaar.summary.replace(/\D/g, "")).toHaveLength(4);
  });

  it("leaves no twelve-digit run anywhere in the fixtures", () => {
    const digits = DOCUMENTS.map((d) => d.summary).join(" ");
    expect(digits).not.toMatch(/\d{12}/);
  });
});
