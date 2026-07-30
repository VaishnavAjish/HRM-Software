import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
  // The list is always masked, whatever the viewer's permission.
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
// Renders the page's own cell renderers so the row's real View action works.
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
import { authApi, appointmentV1Api } from "../../utils/api";

const superAdmin = {
  id: 1,
  name: "NISS Super Admin",
  accessToken: "t",
  tokenType: "Bearer",
  rawRole: 0,
  permissions: null,
};

const grantedHr = {
  id: 2,
  name: "Nisha HR",
  accessToken: "t",
  tokenType: "Bearer",
  rawRole: 1,
  permissions: { "appointments.view_full_aadhaar": "view_only" },
};

const plainAdmin = { ...grantedHr, id: 3, name: "Plain Admin", permissions: {} };

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
  // Only the per-record details endpoint can carry aadhaar_full.
  appointmentV1Api.get.mockResolvedValue({
    data: { appointment: { ...appointmentRow, aadhaar_full: FULL_DIGITS } },
  });
  appointmentV1Api.revealAadhaar.mockResolvedValue({
    data: { aadhaarNumber: FULL_DIGITS, expiresIn: 30 },
  });
  installStorage("localStorage");
  installStorage("sessionStorage");
});

/**
 * Full Aadhaar is now shown outright to a permitted viewer, in the details
 * preview and in Print/PDF. The gate is entirely server-side: aadhaar_full only
 * appears on the details response for an actor holding the permission, so an
 * unauthorised client has nothing to render even if it tried.
 */
describe("Appointment Details — permanent full Aadhaar for authorised users", () => {
  it("shows the full number without any interaction", async () => {
    await openDetails();

    expect(await screen.findAllByText(FULL_FORMATTED)).not.toHaveLength(0);
    await waitFor(() => expect(appointmentV1Api.get).toHaveBeenCalledWith(104, "t", "Bearer"));
  });

  it("offers no Show or Hide control", async () => {
    await openDetails();
    await screen.findAllByText(FULL_FORMATTED);

    expect(screen.queryByRole("button", { name: /^show$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^hide$/i })).toBeNull();
  });

  it("keeps the number on screen rather than remasking it", async () => {
    await openDetails();
    await screen.findAllByText(FULL_FORMATTED);

    // Signals that used to remask must no longer do so.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("blur"));

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(screen.getAllByText(FULL_FORMATTED).length).toBeGreaterThan(0);
  });

  it("formats twelve digits into groups of four", async () => {
    await openDetails();

    const shown = await screen.findAllByText(FULL_FORMATTED);
    expect(shown.length).toBeGreaterThan(0);
    // Never the unformatted run of digits.
    expect(screen.queryByText(FULL_DIGITS)).toBeNull();
  });

  it("marks the preview as confidential", async () => {
    await openDetails();
    await screen.findAllByText(FULL_FORMATTED);

    expect(
      screen.getAllByText(/Confidential — Contains Sensitive Identity Information/i).length,
    ).toBeGreaterThan(0);
  });

  it("never writes the number to browser storage", async () => {
    await openDetails();
    await screen.findAllByText(FULL_FORMATTED);

    const stored = window.localStorage.dump() + window.sessionStorage.dump();

    expect(stored).not.toContain(FULL_DIGITS);
    expect(stored).not.toContain(FULL_FORMATTED);
  });

  it("never puts the number in the URL", async () => {
    await openDetails();
    await screen.findAllByText(FULL_FORMATTED);

    expect(window.location.href).not.toContain("8793");
  });

  it("stops showing it once the modal is closed", async () => {
    await openDetails();
    await screen.findAllByText(FULL_FORMATTED);

    await userEvent.click(screen.getByRole("button", { name: /^close$/i }));

    await waitFor(() => expect(screen.queryAllByText(FULL_FORMATTED)).toHaveLength(0));
  });
});

describe("Appointment Details — unauthorised viewer", () => {
  beforeEach(() => {
    mockUser = plainAdmin;
    // The server would omit aadhaar_full for this actor.
    appointmentV1Api.get.mockResolvedValue({
      data: { appointment: { ...appointmentRow } },
    });
  });

  it("shows only the mask", async () => {
    await openDetails();

    expect(await screen.findAllByText(MASKED)).not.toHaveLength(0);
    expect(screen.queryByText(FULL_FORMATTED)).toBeNull();
  });

  it("does not even request the full number", async () => {
    await openDetails();
    await screen.findAllByText(MASKED);

    expect(appointmentV1Api.get).not.toHaveBeenCalled();
  });

  it("renders nothing full even if the API leaked the field", async () => {
    appointmentV1Api.get.mockResolvedValue({
      data: { appointment: { ...appointmentRow, aadhaar_full: FULL_DIGITS } },
    });

    await openDetails();
    await screen.findAllByText(MASKED);

    // The client never asks, so a leaked field is never fetched or rendered.
    expect(screen.queryByText(FULL_FORMATTED)).toBeNull();
  });

  it("adds no confidential marking", async () => {
    await openDetails();
    await screen.findAllByText(MASKED);

    expect(screen.queryByText(/Confidential/i)).toBeNull();
  });
});

describe("Print and PDF", () => {
  it("prints the full number for an authorised viewer, with a confidential mark", async () => {
    const write = vi.fn();
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue({ document: { write, close: vi.fn() }, focus: vi.fn(), print: vi.fn() });

    await openDetails();
    await screen.findAllByText(FULL_FORMATTED);

    await userEvent.click(screen.getByRole("button", { name: /^print$/i }));

    const printed = write.mock.calls.map(([html]) => html).join("");
    expect(printed).toContain(FULL_FORMATTED);
    expect(printed).toContain("Confidential");

    // Each print is re-authorised server-side and audited under its own action.
    await waitFor(() =>
      expect(appointmentV1Api.revealAadhaar).toHaveBeenCalledWith(104, "t", "Bearer", "PRINT"),
    );

    openSpy.mockRestore();
  });

  it("prints only the mask for an unauthorised viewer", async () => {
    mockUser = plainAdmin;
    appointmentV1Api.get.mockResolvedValue({ data: { appointment: { ...appointmentRow } } });

    const write = vi.fn();
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue({ document: { write, close: vi.fn() }, focus: vi.fn(), print: vi.fn() });

    await openDetails();
    await screen.findAllByText(MASKED);

    await userEvent.click(screen.getByRole("button", { name: /^print$/i }));

    const printed = write.mock.calls.map(([html]) => html).join("");
    expect(printed).toContain(MASKED);
    expect(printed).not.toContain(FULL_FORMATTED);
    expect(printed).not.toContain(FULL_DIGITS);
    expect(appointmentV1Api.revealAadhaar).not.toHaveBeenCalled();

    openSpy.mockRestore();
  });

  it("exports a PDF containing the full number for an authorised viewer", async () => {
    const { exportNodeToPdf } = await import("../../utils/pdfUtils");

    await openDetails();
    await screen.findAllByText(FULL_FORMATTED);

    await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    await waitFor(() => expect(exportNodeToPdf).toHaveBeenCalled());

    const [node, fileName] = exportNodeToPdf.mock.calls[0];
    expect(node.textContent).toContain(FULL_FORMATTED);
    expect(node.textContent).toContain("Confidential");
    // The number must never appear in a filename.
    expect(fileName).not.toContain(FULL_DIGITS);
    expect(fileName).not.toContain("8793");
    expect(fileName).toMatch(/Confidential\.pdf$/);

    await waitFor(() =>
      expect(appointmentV1Api.revealAadhaar).toHaveBeenCalledWith(104, "t", "Bearer", "PDF"),
    );
  });

  it("exports a masked PDF for an unauthorised viewer", async () => {
    mockUser = plainAdmin;
    appointmentV1Api.get.mockResolvedValue({ data: { appointment: { ...appointmentRow } } });
    const { exportNodeToPdf } = await import("../../utils/pdfUtils");

    await openDetails();
    await screen.findAllByText(MASKED);

    await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    await waitFor(() => expect(exportNodeToPdf).toHaveBeenCalled());

    const [node, fileName] = exportNodeToPdf.mock.calls[0];
    expect(node.textContent).toContain(MASKED);
    expect(node.textContent).not.toContain(FULL_FORMATTED);
    expect(fileName).not.toContain("Confidential");
  });
});

describe("Appointment list", () => {
  it("stays masked for an authorised viewer", async () => {
    render(<Appointments />);
    await waitFor(() => expect(authApi.getAppointmentForms).toHaveBeenCalled());

    // No details modal open, so nothing has fetched aadhaar_full.
    expect(screen.queryByText(FULL_FORMATTED)).toBeNull();
    expect(appointmentV1Api.get).not.toHaveBeenCalled();
  });
});
