import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Complete Aadhaar display on the Appointments page.
 *
 * One rule everywhere: the list column, the details preview, the printed sheet
 * and the PDF all show the same twelve digits, grouped in fours. There is no
 * Show/Hide control, no remasking, and no permission that produces a masked
 * variant of an authorised page — the server decides by record access and either
 * sends `aadhaar_full` or does not.
 *
 * What these tests still hold the line on is where the number must never appear:
 * a filename, a URL, localStorage or sessionStorage.
 */

const FULL_DIGITS = "715115988793";
const FULL_FORMATTED = "7151 1598 8793";
const MASKED = "XXXX XXXX 8793";

const appointmentRow = {
  id: 104,
  name: "Parth R Patel",
  emp_code: "EMP1025",
  email: "parth@example.com",
  mobile_number: "7878787878",
  company_code: "nidhi-impex",
  unit: "Ichapur",
  status: "Pending",
  type: "appointment",
  // The list endpoint discloses the complete number for every row inside the
  // caller's company and unit scope.
  aadhaar_full: FULL_DIGITS,
  aadhaar_masked: MASKED,
  has_aadhaar: true,
  pan_card_no: "ABCDE1234E",
};

vi.mock("../../utils/api", () => ({
  authApi: {
    getAppointmentForms: vi.fn(),
    updateAppointment: vi.fn(),
    getAgents: vi.fn(),
    checkEmpCodeAvailability: vi.fn(),
  },
  appointmentV1Api: { get: vi.fn(), revealAadhaar: vi.fn() },
  confidentialExportApi: { authorize: vi.fn(), printPayload: vi.fn(), downloadPdf: vi.fn() },
  salaryApi: { getDepartments: vi.fn() },
}));

let mockUser = {};
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock("../../context/CompanyContext", () => ({
  useCompany: () => ({ isAllCompanies: false, companyId: "nidhi-impex", companyOptions: [] }),
}));
vi.mock("../../context/ThemeContext", () => ({ useTheme: () => ({ dark: false }) }));
vi.mock("../../hooks/useIsMobile", () => ({ default: () => false }));
vi.mock("../../hooks/useGridHeaderContextMenu", () => ({
  default: () => ({
    headerMenu: null,
    headerFrozen: {},
    closeHeaderMenu: vi.fn(),
    toggleHeaderFrozen: vi.fn(),
  }),
}));
// Renders the page's own cell renderers so the real Aadhaar column and the row's
// View action are exercised rather than stubbed away.
vi.mock("ag-grid-react", () => ({
  AgGridReact: ({ rowData = [], columnDefs = [] }) => (
    <div data-testid="grid">
      {rowData.map((row) => (
        <div key={row.id} data-testid={`row-${row.id}`}>
          {columnDefs
            .filter((col) => typeof col.cellRenderer === "function")
            .map((col, index) => (
              <span key={index}>
                {col.cellRenderer({ data: row, value: row[col.field], node: { data: row } })}
              </span>
            ))}
        </div>
      ))}
    </div>
  ),
}));
vi.mock("ag-grid-community", () => ({
  AllCommunityModule: {},
  ModuleRegistry: { registerModules: vi.fn() },
}));
vi.mock("react-router-dom", () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../utils/pdfUtils", () => ({ exportNodeToPdf: vi.fn() }));
vi.mock("../../utils/exportUtils", () => ({ exportToExcel: vi.fn(), exportToCsv: vi.fn() }));

import Appointments from "./Appointments";
import { authApi } from "../../utils/api";
import { exportNodeToPdf } from "../../utils/pdfUtils";

const superAdmin = {
  id: 1,
  name: "NISS Super Admin",
  accessToken: "t",
  tokenType: "Bearer",
  rawRole: 0,
  permissions: null,
};

/** No Aadhaar-related grant of any kind. Display must not depend on one. */
const plainAdmin = {
  id: 3,
  name: "Plain Admin",
  accessToken: "t",
  tokenType: "Bearer",
  rawRole: 1,
  permissions: {},
};

/** A minimal Storage that records everything written to it. */
function installStorage(name) {
  const data = new Map();

  Object.defineProperty(window, name, {
    configurable: true,
    writable: true,
    value: {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(String(k), String(v)),
      removeItem: (k) => data.delete(k),
      clear: () => data.clear(),
      key: (i) => [...data.keys()][i] ?? null,
      get length() {
        return data.size;
      },
      dump: () => JSON.stringify([...data.entries()]),
    },
  });
}

let printWrites;
let printSpy;

function installPrintWindow() {
  printWrites = [];

  printSpy = vi.spyOn(window, "open").mockReturnValue({
    document: {
      write: (html) => printWrites.push(html),
      close: vi.fn(),
      readyState: "complete",
      images: [],
      fonts: { ready: Promise.resolve() },
    },
    focus: vi.fn(),
    print: vi.fn(),
    addEventListener: vi.fn(),
  });
}

const printedHtml = () => printWrites.join("");

async function openDetails() {
  const view = render(<Appointments />);
  await waitFor(() => expect(authApi.getAppointmentForms).toHaveBeenCalled());
  const [manage] = await screen.findAllByRole("button", { name: /view/i });
  await userEvent.click(manage);
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = superAdmin;
  authApi.getAppointmentForms.mockResolvedValue({ data: [appointmentRow] });
  authApi.getAgents.mockResolvedValue({ data: [] });
  authApi.updateAppointment.mockResolvedValue({});
  installStorage("localStorage");
  installStorage("sessionStorage");
});

afterEach(() => {
  printSpy?.mockRestore();
});

describe("Appointment list", () => {
  it("shows the complete number in the Aadhaar column", async () => {
    render(<Appointments />);
    await waitFor(() => expect(authApi.getAppointmentForms).toHaveBeenCalled());

    // Previously the list was masked while details were not, which is exactly the
    // inconsistency this change removes.
    expect(await screen.findByText(FULL_FORMATTED)).toBeInTheDocument();
    expect(screen.queryByText(MASKED)).toBeNull();
  });

  it("renders '-' rather than a mask when the row has no number", async () => {
    authApi.getAppointmentForms.mockResolvedValue({
      data: [{ ...appointmentRow, aadhaar_full: undefined, aadhaar_masked: MASKED }],
    });

    render(<Appointments />);
    await waitFor(() => expect(authApi.getAppointmentForms).toHaveBeenCalled());

    // A mask here would read as a permission decision; "-" reads as missing data.
    await waitFor(() => expect(screen.queryByText(MASKED)).toBeNull());
    expect(screen.queryByText(FULL_FORMATTED)).toBeNull();
  });
});

describe("Appointment details", () => {
  it("shows the complete number with no interaction", async () => {
    await openDetails();

    expect(await screen.findAllByText(FULL_FORMATTED)).not.toHaveLength(0);
    expect(screen.queryByText(MASKED)).toBeNull();
  });

  it("offers no Show or Hide control", async () => {
    await openDetails();
    await screen.findAllByText(FULL_FORMATTED);

    expect(screen.queryByRole("button", { name: /^show$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^hide$/i })).toBeNull();
  });

  it("does not remask on blur or tab change", async () => {
    await openDetails();
    await screen.findAllByText(FULL_FORMATTED);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("blur"));

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(screen.getAllByText(FULL_FORMATTED).length).toBeGreaterThan(0);
  });

  it("formats twelve digits in groups of four", async () => {
    await openDetails();

    expect((await screen.findAllByText(FULL_FORMATTED)).length).toBeGreaterThan(0);
    // Never one unbroken run of digits.
    expect(screen.queryByText(FULL_DIGITS)).toBeNull();
  });

  it("shows the same value to an admin holding no Aadhaar grant", async () => {
    mockUser = plainAdmin;

    await openDetails();

    // Display is gated on record access, not on a permission key.
    expect(await screen.findAllByText(FULL_FORMATTED)).not.toHaveLength(0);
  });
});

describe("Print", () => {
  it("prints the complete number", async () => {
    installPrintWindow();
    await openDetails();
    await screen.findAllByText(FULL_FORMATTED);

    await userEvent.click(screen.getByRole("button", { name: /^print$/i }));

    await waitFor(() => expect(printedHtml()).toContain(FULL_FORMATTED));
    expect(printedHtml()).not.toContain(MASKED);
  });

  it("needs no dialog or extra authorisation step", async () => {
    installPrintWindow();
    await openDetails();
    await screen.findAllByText(FULL_FORMATTED);

    await userEvent.click(screen.getByRole("button", { name: /^print$/i }));

    // One click, one print. No masked-versus-confidential choice.
    await waitFor(() => expect(window.open).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: /Confidential Full-Aadhaar Version/i })).toBeNull();
  });

  it("marks the printed sheet as carrying identity data", async () => {
    installPrintWindow();
    await openDetails();
    await screen.findAllByText(FULL_FORMATTED);

    await userEvent.click(screen.getByRole("button", { name: /^print$/i }));

    await waitFor(() => expect(printedHtml()).toContain(FULL_FORMATTED));
    // Not a permission control — a sheet found on a desk should say what it is.
    expect(printedHtml()).toContain("Confidential");
  });
});

describe("PDF", () => {
  it("exports the complete number", async () => {
    await openDetails();
    await screen.findAllByText(FULL_FORMATTED);

    await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    await waitFor(() => expect(exportNodeToPdf).toHaveBeenCalled());

    const [node] = exportNodeToPdf.mock.calls[0];
    expect(node.textContent).toContain(FULL_FORMATTED);
    expect(node.textContent).not.toContain(MASKED);
  });

  it("names the file after the record, never the number", async () => {
    await openDetails();
    await screen.findAllByText(FULL_FORMATTED);

    await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    await waitFor(() => expect(exportNodeToPdf).toHaveBeenCalled());

    const [, fileName] = exportNodeToPdf.mock.calls[0];

    // A filename ends up in download histories, chat messages and backup indexes.
    expect(fileName).toBe("Appointment_APT-000104.pdf");
    expect(fileName).not.toContain(FULL_DIGITS);
    expect(fileName).not.toContain("8793");
  });
});

describe("Where the number must not go", () => {
  it("is never written to localStorage or sessionStorage", async () => {
    await openDetails();
    await screen.findAllByText(FULL_FORMATTED);

    const stored = window.localStorage.dump() + window.sessionStorage.dump();

    expect(stored).not.toContain(FULL_DIGITS);
    expect(stored).not.toContain(FULL_FORMATTED);
  });

  it("is never put in the URL", async () => {
    await openDetails();
    await screen.findAllByText(FULL_FORMATTED);

    expect(window.location.href).not.toContain("8793");
    expect(window.location.href).not.toContain(FULL_DIGITS);
  });

  it("leaves the page with the details view", async () => {
    await openDetails();
    await screen.findAllByText(FULL_FORMATTED);

    await userEvent.click(screen.getByRole("button", { name: /^close$/i }));

    // The list column still shows it, which is the point of the change — but the
    // details preview and its hidden print form are gone.
    await waitFor(() =>
      expect(document.querySelector("[data-appointment-print-form]")).toBeNull(),
    );
  });
});

/**
 * A failed load used to be indistinguishable from an empty list.
 *
 * The grid rendered "No appointment forms found" with Total 0 whether the server
 * had returned zero rows or had returned a 500, because the catch simply emptied
 * the array. That is what made a freshly created appointment look like it had
 * vanished — the record existed, the request had failed, and nothing on screen
 * said so.
 */
describe("When the list cannot be loaded", () => {
  it("says the load failed rather than showing an empty list", async () => {
    authApi.getAppointmentForms.mockRejectedValue(
      Object.assign(new Error("Server error"), { status: 500 }),
    );

    render(<Appointments />);

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveTextContent(/Could not load appointment forms/i);
    expect(alert).toHaveTextContent(/not an empty list/i);
    expect(screen.queryByText("No appointment forms found")).toBeNull();
  });

  it("offers a retry that reloads the list", async () => {
    authApi.getAppointmentForms.mockRejectedValueOnce(new Error("Server error"));

    render(<Appointments />);
    await screen.findByRole("alert");

    // Second attempt succeeds.
    authApi.getAppointmentForms.mockResolvedValue({ data: [appointmentRow] });
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(await screen.findByText(FULL_FORMATTED)).toBeInTheDocument();
  });

  it("still shows the ordinary empty state when the server genuinely has none", async () => {
    authApi.getAppointmentForms.mockResolvedValue({ data: [] });

    render(<Appointments />);

    await waitFor(() => expect(authApi.getAppointmentForms).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

/**
 * Every appointment field is optional, so a row can arrive with almost nothing
 * in it. The grid and the details view must render that as "-" or an em dash —
 * never as the strings "undefined", "null" or "NaN", which is what leaks through
 * when a blank value is passed to a formatter or concatenated into a label.
 */
describe("A record saved with everything blank", () => {
  const blankRow = { id: 900, type: "appointment" };

  it("renders no undefined, null or NaN in the list", async () => {
    authApi.getAppointmentForms.mockResolvedValue({ data: [blankRow] });

    render(<Appointments />);
    await waitFor(() => expect(authApi.getAppointmentForms).toHaveBeenCalled());

    const text = document.body.textContent;

    expect(text).not.toMatch(/\bundefined\b/);
    expect(text).not.toMatch(/\bNaN\b/);
    expect(text).not.toMatch(/\bnull\b/);
  });

  it("renders placeholders instead of empty cells", async () => {
    authApi.getAppointmentForms.mockResolvedValue({ data: [blankRow] });

    render(<Appointments />);
    await waitFor(() => expect(authApi.getAppointmentForms).toHaveBeenCalled());

    // The row is present and shows a placeholder rather than blank space.
    expect(await screen.findByTestId("row-900")).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/[—-]/);
  });

  it("opens the details view for a blank record without errors", async () => {
    authApi.getAppointmentForms.mockResolvedValue({ data: [blankRow] });

    render(<Appointments />);
    await waitFor(() => expect(authApi.getAppointmentForms).toHaveBeenCalled());

    const [view] = await screen.findAllByRole("button", { name: /view/i });
    await userEvent.click(view);

    // The printable form renders from the same view model as the screen.
    await waitFor(() =>
      expect(document.querySelector("[data-appointment-print-form]")).toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toMatch(/\bundefined\b|\bNaN\b/);
  });
});
