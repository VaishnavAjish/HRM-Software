import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
  aadhaar_masked: "XXXX XXXX 8793",
  has_aadhaar: true,
  pan_card_no: "ABCDE1234E",
  bank_name: "BOB",
};

vi.mock("../../utils/api", () => ({
  authApi: {
    getAppointmentForms: vi.fn(),
    updateAppointment: vi.fn(),
    getAgents: vi.fn(),
    checkEmpCodeAvailability: vi.fn(),
  },
  appointmentV1Api: { revealAadhaar: vi.fn() },
  salaryApi: { getDepartments: vi.fn() },
}));

let mockUser = {};
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));
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
// Renders the page's own cell renderers rather than stubbing the grid out
// entirely, so the row's real View action is reachable and the test drives the
// application's code rather than the mock's.
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
vi.mock("../../utils/exportUtils", () => ({
  exportNodeToPdf: vi.fn(),
  exportToExcel: vi.fn(),
  exportToCsv: vi.fn(),
}));

import Appointments from "./Appointments";
import { authApi, appointmentV1Api } from "../../utils/api";

const SHOW = /^show$/i;
const HIDE = /^hide$/i;

const superAdmin = {
  accessToken: "t",
  tokenType: "Bearer",
  role: "admin",
  rawRole: 0,
  permissions: null,
};

const plainAdmin = {
  accessToken: "t",
  tokenType: "Bearer",
  role: "admin",
  rawRole: 1,
  permissions: {},
};

const grantedHr = {
  ...plainAdmin,
  permissions: { "appointments.view_full_aadhaar": "view_only" },
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

/** Open the details modal for the seeded appointment. */
async function openDetails() {
  render(<Appointments />);
  await waitFor(() => expect(authApi.getAppointmentForms).toHaveBeenCalled());
  await userEvent.click(await screen.findByRole("button", { name: /view/i }));
  await screen.findAllByText("XXXX XXXX 8793");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  mockUser = superAdmin;
  authApi.getAppointmentForms.mockResolvedValue({ data: [appointmentRow] });
  authApi.getAgents.mockResolvedValue({ data: [] });
  appointmentV1Api.revealAadhaar.mockResolvedValue({
    data: { aadhaarNumber: "123456788793", expiresIn: 30 },
  });
  // This jsdom build exposes no Storage, so the "nothing was persisted"
  // assertions would pass vacuously. Install a real in-memory one that would
  // capture a write if the component ever made it.
  installStorage("localStorage");
  installStorage("sessionStorage");
});

afterEach(() => vi.useRealTimers());

describe("Appointment Details — Aadhaar reveal", () => {
  it("shows the masked number by default", async () => {
    await openDetails();

    expect(screen.getAllByText("XXXX XXXX 8793").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("1234 5678 8793")).toHaveLength(0);
  });

  it("offers no reveal control to a user without the grant", async () => {
    mockUser = plainAdmin;

    await openDetails();

    expect(screen.queryByRole("button", { name: SHOW })).toBeNull();
  });

  it("offers the control to an explicitly granted user", async () => {
    mockUser = grantedHr;

    await openDetails();

    expect(screen.getByRole("button", { name: SHOW })).toBeInTheDocument();
  });

  it("offers the control to a super admin", async () => {
    await openDetails();

    expect(screen.getByRole("button", { name: SHOW })).toBeInTheDocument();
  });

  it("calls the protected endpoint and shows the full number", async () => {
    await openDetails();

    await userEvent.click(screen.getByRole("button", { name: SHOW }));

    await waitFor(() =>
      expect(appointmentV1Api.revealAadhaar).toHaveBeenCalledWith(104, "t", "Bearer"),
    );
    expect(await screen.findAllByText("1234 5678 8793")).toHaveLength(1);
  });

  it("restores the mask when Hide is clicked", async () => {
    await openDetails();

    await userEvent.click(screen.getByRole("button", { name: SHOW }));
    await screen.findAllByText("1234 5678 8793");

    await userEvent.click(screen.getByRole("button", { name: HIDE }));

    expect(screen.queryAllByText("1234 5678 8793")).toHaveLength(0);
    expect(screen.getAllByText("XXXX XXXX 8793").length).toBeGreaterThan(0);
  });

  it("remasks on its own once the reveal expires", async () => {
    // The client honours the window the server states, so a short TTL exercises
    // the real timer rather than a swapped-in fake one.
    appointmentV1Api.revealAadhaar.mockResolvedValue({
      data: { aadhaarNumber: "123456788793", expiresIn: 1 },
    });

    await openDetails();

    await userEvent.click(screen.getByRole("button", { name: SHOW }));
    await screen.findAllByText("1234 5678 8793");

    await waitFor(
      () => expect(screen.queryAllByText("1234 5678 8793")).toHaveLength(0),
      { timeout: 3000 },
    );
    expect(screen.getAllByText("XXXX XXXX 8793").length).toBeGreaterThan(0);
    // Back to offering a reveal rather than stuck on Hide.
    expect(screen.getByRole("button", { name: SHOW })).toBeInTheDocument();
  });

  it("drops the revealed number when the modal is closed", async () => {
    await openDetails();

    await userEvent.click(screen.getByRole("button", { name: SHOW }));
    await screen.findAllByText("1234 5678 8793");

    await userEvent.click(screen.getByRole("button", { name: /^close$/i }));

    await waitFor(() => expect(screen.queryAllByText("1234 5678 8793")).toHaveLength(0));
  });

  it("never writes the number to localStorage or sessionStorage", async () => {
    await openDetails();

    await userEvent.click(screen.getByRole("button", { name: SHOW }));
    await screen.findAllByText("1234 5678 8793");

    const stored = window.localStorage.dump() + window.sessionStorage.dump();

    expect(stored).not.toContain("123456788793");
    expect(stored).not.toContain("1234 5678 8793");
    expect(stored).not.toContain("8793");
  });

  it("never puts the number in the URL", async () => {
    await openDetails();

    await userEvent.click(screen.getByRole("button", { name: SHOW }));
    await screen.findAllByText("1234 5678 8793");

    expect(window.location.href).not.toContain("8793");
  });

  it("keeps the mask when the reveal is refused", async () => {
    const denied = new Error("You are not permitted to view the full Aadhaar number.");
    denied.status = 403;
    appointmentV1Api.revealAadhaar.mockRejectedValue(denied);

    await openDetails();

    await userEvent.click(screen.getByRole("button", { name: SHOW }));

    await waitFor(() => expect(appointmentV1Api.revealAadhaar).toHaveBeenCalled());
    expect(screen.queryAllByText("1234 5678 8793")).toHaveLength(0);
    expect(screen.getAllByText("XXXX XXXX 8793").length).toBeGreaterThan(0);
  });
});
