import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Confidential (full-Aadhaar) Print and PDF export, from the client's side.
 *
 * The property under test is that the export fails closed. Every refusal case
 * asserts that nothing was produced — no print window, no exportNodeToPdf call,
 * no saved file — rather than only that an error was shown, because "an error
 * toast appeared and the document printed anyway" is exactly the bug this
 * replaces.
 */

const SCREEN_DIGITS = "715115988793";
const SCREEN_FORMATTED = "7151 1598 8793";
const MASKED = "XXXX XXXX 8793";

// Deliberately different from what the details response carries. The printed
// output must contain this one, which proves it was assembled from the server's
// print payload rather than from the view model already on screen.
const PAYLOAD_DIGITS = "600011114321";
const PAYLOAD_FORMATTED = "6000 1111 4321";

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

let featureEnabled = true;
vi.mock("../../config/featureFlags", () => ({
  confidentialAadhaarExportEnabled: () => featureEnabled,
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
import { authApi, appointmentV1Api, confidentialExportApi } from "../../utils/api";
import { exportNodeToPdf } from "../../utils/pdfUtils";
import toast from "react-hot-toast";
import { CONFIDENTIAL_EXPORT_FAILED_MESSAGE } from "../../utils/confidentialExport";

const superAdmin = {
  id: 1,
  name: "NISS Super Admin",
  accessToken: "t",
  tokenType: "Bearer",
  rawRole: 0,
  permissions: null,
};

/** Can read the number, cannot take it out of the application. */
const viewOnlyHr = {
  id: 4,
  name: "View Only HR",
  accessToken: "t",
  tokenType: "Bearer",
  rawRole: 1,
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

let printWrites;
let printSpy;
let anchorClicks;
let anchorSpy;
let objectUrls;

/** A print window that behaves enough like a real one to reach win.print(). */
function installPrintWindow() {
  printWrites = [];
  const print = vi.fn();

  printSpy = vi.spyOn(window, "open").mockReturnValue({
    document: {
      write: (html) => printWrites.push(html),
      close: vi.fn(),
      readyState: "complete",
      images: [],
      fonts: { ready: Promise.resolve() },
    },
    focus: vi.fn(),
    print,
    addEventListener: vi.fn(),
  });

  return { print };
}

function printedHtml() {
  return printWrites.join("");
}

function futureAuthorization(exportType) {
  return {
    data: {
      exportAuthorizationId: "11111111-2222-3333-4444-555555555555",
      exportToken: `token-for-${exportType}`,
      exportType,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      exportReference: "EXP-11111111",
    },
  };
}

async function openDetails() {
  const view = render(<Appointments />);
  await waitFor(() => expect(authApi.getAppointmentForms).toHaveBeenCalled());
  const [manage] = await screen.findAllByRole("button", { name: /view/i });
  await userEvent.click(manage);
  return view;
}

/** Open details, wait for the full number, then click Print or Download PDF. */
async function startExport(kind) {
  await openDetails();
  await screen.findAllByText(SCREEN_FORMATTED);

  await userEvent.click(
    screen.getByRole("button", { name: kind === "PDF" ? /download pdf/i : /^print$/i }),
  );
}

async function chooseConfidentialAndConfirm(kind) {
  await startExport(kind);

  await userEvent.click(
    await screen.findByRole("button", { name: /Confidential Full-Aadhaar Version/i }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: /Continue Confidential Export/i }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  featureEnabled = true;
  mockUser = superAdmin;

  authApi.getAppointmentForms.mockResolvedValue({ data: [appointmentRow] });
  authApi.getAgents.mockResolvedValue({ data: [] });
  authApi.updateAppointment.mockResolvedValue({});
  appointmentV1Api.get.mockResolvedValue({
    data: { appointment: { ...appointmentRow, aadhaar_full: SCREEN_DIGITS } },
  });

  confidentialExportApi.authorize.mockImplementation((id, exportType) =>
    Promise.resolve(futureAuthorization(exportType)),
  );
  confidentialExportApi.printPayload.mockResolvedValue({
    data: {
      exportAuthorizationId: "11111111-2222-3333-4444-555555555555",
      exportReference: "EXP-11111111",
      generatedBy: "NISS Super Admin",
      generatedAt: "30 Jul 2026 14:42 IST",
      recordLabel: "APT-000104",
      aadhaarFull: PAYLOAD_DIGITS,
    },
  });
  confidentialExportApi.downloadPdf.mockResolvedValue(
    new Blob(["%PDF-1.4 fake"], { type: "application/pdf" }),
  );

  installStorage("localStorage");
  installStorage("sessionStorage");

  objectUrls = [];
  window.URL.createObjectURL = vi.fn(() => {
    const url = `blob:mock-${objectUrls.length}`;
    objectUrls.push(url);
    return url;
  });
  window.URL.revokeObjectURL = vi.fn();

  anchorClicks = [];
  anchorSpy = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function recordClick() {
      anchorClicks.push({ download: this.download, href: this.getAttribute("href") });
    });
});

afterEach(() => {
  printSpy?.mockRestore();
  anchorSpy?.mockRestore();
});

describe("Confidential export — the choice", () => {
  it("offers masked and confidential versions instead of exporting straight away", async () => {
    installPrintWindow();
    await startExport("PRINT");

    expect(
      await screen.findByRole("button", { name: /Print Masked Version/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Confidential Full-Aadhaar Version/i }),
    ).toBeInTheDocument();

    // A full number on screen is not by itself a request to put it on paper.
    expect(window.open).not.toHaveBeenCalled();
  });

  it("keeps masked print available and asks the server for nothing", async () => {
    installPrintWindow();
    await startExport("PRINT");

    await userEvent.click(await screen.findByRole("button", { name: /Print Masked Version/i }));

    await waitFor(() => expect(window.open).toHaveBeenCalled());

    expect(printedHtml()).toContain(MASKED);
    expect(printedHtml()).not.toContain(SCREEN_FORMATTED);
    expect(printedHtml()).not.toContain(SCREEN_DIGITS);
    expect(confidentialExportApi.authorize).not.toHaveBeenCalled();
  });

  it("keeps masked PDF available through the ordinary client-side path", async () => {
    await startExport("PDF");

    await userEvent.click(await screen.findByRole("button", { name: /Download Masked Version/i }));

    await waitFor(() => expect(exportNodeToPdf).toHaveBeenCalled());

    const [node, fileName] = exportNodeToPdf.mock.calls[0];
    expect(node.textContent).toContain(MASKED);
    expect(node.textContent).not.toContain(SCREEN_FORMATTED);
    expect(fileName).not.toMatch(/Confidential/);
    expect(confidentialExportApi.authorize).not.toHaveBeenCalled();
  });

  it("requests nothing until the confirmation is accepted", async () => {
    await startExport("PRINT");

    await userEvent.click(
      await screen.findByRole("button", { name: /Confidential Full-Aadhaar Version/i }),
    );

    // The warning is on screen; no authorisation has been asked for yet.
    expect(
      await screen.findByText(/The export will be audited/i),
    ).toBeInTheDocument();
    expect(confidentialExportApi.authorize).not.toHaveBeenCalled();
  });

  it("cancelling starts nothing", async () => {
    installPrintWindow();
    await startExport("PRINT");

    await userEvent.click(await screen.findByRole("button", { name: /^cancel$/i }));

    expect(confidentialExportApi.authorize).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });
});

describe("Confidential print", () => {
  it("obtains a fresh authorization before printing", async () => {
    installPrintWindow();
    await chooseConfidentialAndConfirm("PRINT");

    await waitFor(() =>
      expect(confidentialExportApi.authorize).toHaveBeenCalledWith(104, "PRINT", "t", "Bearer", "appointments"),
    );
    await waitFor(() => expect(window.open).toHaveBeenCalled());
  });

  it("does not open the print dialog before authorization resolves", async () => {
    installPrintWindow();

    let release;
    confidentialExportApi.authorize.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve(futureAuthorization("PRINT"));
      }),
    );

    await chooseConfidentialAndConfirm("PRINT");

    // Authorisation is still in flight.
    expect(window.open).not.toHaveBeenCalled();

    release();
    await waitFor(() => expect(window.open).toHaveBeenCalled());
  });

  it("prints the number from the server payload, not from the page", async () => {
    installPrintWindow();
    await chooseConfidentialAndConfirm("PRINT");

    await waitFor(() => expect(printedHtml()).toContain(PAYLOAD_FORMATTED));

    // The value that was already on screen is not what reached the printer.
    expect(printedHtml()).not.toContain(SCREEN_FORMATTED);
    expect(confidentialExportApi.printPayload).toHaveBeenCalledWith(
      104,
      "token-for-PRINT",
      "t",
      "Bearer",
      "appointments",
    );
  });

  it("marks the printed sheet confidential and traceable", async () => {
    installPrintWindow();
    await chooseConfidentialAndConfirm("PRINT");

    await waitFor(() => expect(printedHtml()).toContain(PAYLOAD_FORMATTED));

    const html = printedHtml();
    expect(html).toContain("Confidential");
    expect(html).toContain("EXP-11111111");
    expect(html).toContain("NISS Super Admin");
    expect(html).toContain("30 Jul 2026 14:42 IST");
  });

  it("removes the confidential view from the page afterwards", async () => {
    installPrintWindow();
    await chooseConfidentialAndConfirm("PRINT");

    await waitFor(() => expect(printedHtml()).toContain(PAYLOAD_FORMATTED));

    // Mounted only for the duration of the print.
    await waitFor(() =>
      expect(document.querySelector("[data-confidential-print-root]")).toBeNull(),
    );
    expect(document.body.textContent).not.toContain(PAYLOAD_FORMATTED);
  });

  it("fails closed when authorization is refused", async () => {
    installPrintWindow();
    const refusal = Object.assign(new Error("Forbidden"), { status: 403 });
    confidentialExportApi.authorize.mockRejectedValue(refusal);

    await chooseConfidentialAndConfirm("PRINT");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(CONFIDENTIAL_EXPORT_FAILED_MESSAGE),
    );

    expect(window.open).not.toHaveBeenCalled();
    expect(confidentialExportApi.printPayload).not.toHaveBeenCalled();
  });

  it("fails closed on a network error", async () => {
    installPrintWindow();
    confidentialExportApi.authorize.mockRejectedValue(new TypeError("Failed to fetch"));

    await chooseConfidentialAndConfirm("PRINT");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(CONFIDENTIAL_EXPORT_FAILED_MESSAGE),
    );
    expect(window.open).not.toHaveBeenCalled();
  });

  it("fails closed when the server could not record the audit entry", async () => {
    installPrintWindow();
    confidentialExportApi.authorize.mockRejectedValue(
      Object.assign(new Error("Confidential export could not be authorized."), {
        status: 500,
        data: { error: { code: "AADHAAR_EXPORT_AUDIT_FAILED" } },
      }),
    );

    await chooseConfidentialAndConfirm("PRINT");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(CONFIDENTIAL_EXPORT_FAILED_MESSAGE),
    );
    expect(window.open).not.toHaveBeenCalled();
  });

  it("fails closed when the print payload is masked or incomplete", async () => {
    installPrintWindow();
    confidentialExportApi.printPayload.mockResolvedValue({
      data: { aadhaarFull: MASKED, exportReference: "EXP-11111111" },
    });

    await chooseConfidentialAndConfirm("PRINT");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(CONFIDENTIAL_EXPORT_FAILED_MESSAGE),
    );

    // A "confidential" sheet with nothing confidential on it is still a failure.
    expect(window.open).not.toHaveBeenCalled();
  });
});

describe("Confidential PDF", () => {
  it("never rasterises the page", async () => {
    await chooseConfidentialAndConfirm("PDF");

    await waitFor(() => expect(confidentialExportApi.downloadPdf).toHaveBeenCalled());

    // The whole point of the server-generated path: the bytes cannot come from a
    // DOM the user is able to edit.
    expect(exportNodeToPdf).not.toHaveBeenCalled();
  });

  it("requests an export token and then the server-generated file", async () => {
    await chooseConfidentialAndConfirm("PDF");

    await waitFor(() =>
      expect(confidentialExportApi.authorize).toHaveBeenCalledWith(104, "PDF", "t", "Bearer", "appointments"),
    );
    await waitFor(() =>
      expect(confidentialExportApi.downloadPdf).toHaveBeenCalledWith(
        104,
        "token-for-PDF",
        "t",
        "Bearer",
        "appointments",
      ),
    );
  });

  it("saves the file under a name carrying no Aadhaar", async () => {
    await chooseConfidentialAndConfirm("PDF");

    await waitFor(() => expect(anchorClicks.length).toBe(1));

    const { download } = anchorClicks[0];
    expect(download).toMatch(/Confidential\.pdf$/);
    expect(download).not.toContain(SCREEN_DIGITS);
    expect(download).not.toContain(PAYLOAD_DIGITS);
    expect(download).not.toContain("8793");
    expect(download).not.toContain("4321");
  });

  it("revokes the object URL rather than leaving the bytes reachable", async () => {
    await chooseConfidentialAndConfirm("PDF");

    await waitFor(() => expect(anchorClicks.length).toBe(1));
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith(objectUrls[0]);
  });

  it("fails closed when authorization is refused, without calling the PDF endpoint", async () => {
    confidentialExportApi.authorize.mockRejectedValue(
      Object.assign(new Error("Forbidden"), { status: 403 }),
    );

    await chooseConfidentialAndConfirm("PDF");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(CONFIDENTIAL_EXPORT_FAILED_MESSAGE),
    );

    expect(confidentialExportApi.downloadPdf).not.toHaveBeenCalled();
    expect(anchorClicks).toHaveLength(0);
    expect(exportNodeToPdf).not.toHaveBeenCalled();
  });

  it("rejects an authorization that has already expired", async () => {
    confidentialExportApi.authorize.mockResolvedValue({
      data: {
        exportAuthorizationId: "id",
        exportToken: "stale",
        exportType: "PDF",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        exportReference: "EXP-STALE",
      },
    });

    await chooseConfidentialAndConfirm("PDF");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(CONFIDENTIAL_EXPORT_FAILED_MESSAGE),
    );
    expect(confidentialExportApi.downloadPdf).not.toHaveBeenCalled();
  });

  it("rejects an authorization issued for a different export type", async () => {
    // A PRINT authorization must not download a file, even if it arrives here.
    confidentialExportApi.authorize.mockResolvedValue(futureAuthorization("PRINT"));

    await chooseConfidentialAndConfirm("PDF");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(CONFIDENTIAL_EXPORT_FAILED_MESSAGE),
    );
    expect(confidentialExportApi.downloadPdf).not.toHaveBeenCalled();
  });

  it("surfaces a spent token as a failure and saves nothing", async () => {
    confidentialExportApi.downloadPdf.mockRejectedValue(
      Object.assign(new Error("already used"), {
        status: 403,
        code: "AADHAAR_EXPORT_TOKEN_INVALID",
      }),
    );

    await chooseConfidentialAndConfirm("PDF");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(CONFIDENTIAL_EXPORT_FAILED_MESSAGE),
    );
    expect(anchorClicks).toHaveLength(0);
  });

  it("refuses an empty response instead of saving a broken confidential file", async () => {
    confidentialExportApi.downloadPdf.mockRejectedValue(
      Object.assign(new Error("The confidential document came back empty."), { status: 200 }),
    );

    await chooseConfidentialAndConfirm("PDF");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(CONFIDENTIAL_EXPORT_FAILED_MESSAGE),
    );
    expect(anchorClicks).toHaveLength(0);
  });
});

describe("Who is offered a confidential export", () => {
  it("a viewer with no export grant goes straight to a masked print", async () => {
    mockUser = viewOnlyHr;
    installPrintWindow();

    await startExport("PRINT");

    // No dialog, because there is no confidential option to offer.
    expect(screen.queryByRole("button", { name: /Confidential Full-Aadhaar Version/i })).toBeNull();

    await waitFor(() => expect(window.open).toHaveBeenCalled());
    expect(printedHtml()).toContain(MASKED);
    expect(printedHtml()).not.toContain(SCREEN_FORMATTED);
    expect(confidentialExportApi.authorize).not.toHaveBeenCalled();
  });

  it("a viewer with no export grant gets a masked PDF", async () => {
    mockUser = viewOnlyHr;

    await startExport("PDF");

    await waitFor(() => expect(exportNodeToPdf).toHaveBeenCalled());

    const [node] = exportNodeToPdf.mock.calls[0];
    expect(node.textContent).toContain(MASKED);
    expect(node.textContent).not.toContain(SCREEN_FORMATTED);
    expect(confidentialExportApi.downloadPdf).not.toHaveBeenCalled();
  });

  it("hides the confidential option entirely while the feature is switched off", async () => {
    featureEnabled = false;
    installPrintWindow();

    await startExport("PRINT");

    expect(screen.queryByRole("button", { name: /Confidential Full-Aadhaar Version/i })).toBeNull();

    // And it falls back to masked, never to an unaudited full-Aadhaar export.
    await waitFor(() => expect(window.open).toHaveBeenCalled());
    expect(printedHtml()).toContain(MASKED);
    expect(printedHtml()).not.toContain(SCREEN_FORMATTED);
  });
});

describe("Sensitive state handling", () => {
  it("keeps the number out of localStorage and sessionStorage", async () => {
    await chooseConfidentialAndConfirm("PDF");
    await waitFor(() => expect(anchorClicks.length).toBe(1));

    const stored = window.localStorage.dump() + window.sessionStorage.dump();

    expect(stored).not.toContain(SCREEN_DIGITS);
    expect(stored).not.toContain(SCREEN_FORMATTED);
    expect(stored).not.toContain(PAYLOAD_DIGITS);
    expect(stored).not.toContain("token-for-PDF");
  });

  it("keeps the number and the token out of the URL", async () => {
    await chooseConfidentialAndConfirm("PDF");
    await waitFor(() => expect(anchorClicks.length).toBe(1));

    expect(window.location.href).not.toContain("8793");
    expect(window.location.href).not.toContain("4321");
    expect(window.location.href).not.toContain("token-for");
  });

  it("clears the disclosure when the detail view is closed", async () => {
    await openDetails();
    await screen.findAllByText(SCREEN_FORMATTED);

    await userEvent.click(screen.getByRole("button", { name: /^close$/i }));

    await waitFor(() => expect(screen.queryAllByText(SCREEN_FORMATTED)).toHaveLength(0));
    expect(document.body.textContent).not.toContain(SCREEN_FORMATTED);
  });

  it("closes a pending export dialog when the disclosure is dropped", async () => {
    await startExport("PRINT");
    await screen.findByRole("button", { name: /Confidential Full-Aadhaar Version/i });

    await userEvent.click(screen.getByRole("button", { name: /^close$/i }));

    // A confirmation left open must not be acceptable once the state behind it
    // is gone.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Confidential Full-Aadhaar Version/i }),
      ).toBeNull(),
    );
  });
});
