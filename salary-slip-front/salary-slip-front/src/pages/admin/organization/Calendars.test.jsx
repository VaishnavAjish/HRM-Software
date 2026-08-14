import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../utils/api", () => ({
  companyUnitApi: {
    companies: vi.fn(),
    units: vi.fn(),
  },
}));

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { accessToken: "t", tokenType: "Bearer", rawRole: 0 } }),
}));

let allowed = new Set();

vi.mock("../../../hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: (code) => allowed.has(code) }),
}));

vi.mock("../../../features/organization/services/organizationApi", () => ({
  organizationApi: {
    calendars: vi.fn(),
    createCalendar: vi.fn(),
    updateCalendar: vi.fn(),
    setCalendarStatus: vi.fn(),
    deleteCalendar: vi.fn(),
    calendarHolidays: vi.fn(),
    upsertHoliday: vi.fn(),
    deleteHoliday: vi.fn(),
  },
}));

import { companyUnitApi } from "../../../utils/api";
import { organizationApi } from "../../../features/organization/services/organizationApi";
import Calendars from "./Calendars";

const NIDHI = { id: 1, name: "Nidhi Impex", code: "nidhi-impex", isActive: true };

const DEFAULT = {
  id: 3,
  companyId: 1,
  companyName: "Nidhi Impex",
  unitId: null,
  unitName: null,
  name: "Standard",
  workWeek: ["mon", "tue", "wed", "thu", "fri"],
  isActive: true,
  holidayCount: 3,
};

const SHIFT = {
  id: 6,
  companyId: 1,
  companyName: "Nidhi Impex",
  unitId: 12,
  unitName: "Shreeji",
  name: "Shopfloor",
  workWeek: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  isActive: true,
  holidayCount: 0,
};

const HOLIDAY = {
  id: 51,
  date: "2026-08-15",
  title: "Independence Day",
  kind: "holiday",
  isHalfDay: false,
  recurring: "annual",
};

const ALL_PERMISSIONS = [
  "org.calendar.read", "org.calendar.create", "org.calendar.update",
  "org.calendar.status", "org.calendar.delete",
];

beforeEach(() => {
  vi.clearAllMocks();
  allowed = new Set(ALL_PERMISSIONS);

  companyUnitApi.companies.mockResolvedValue({ data: [NIDHI] });
  companyUnitApi.units.mockResolvedValue({ data: [{ id: 12, name: "Shreeji", companyId: 1 }] });
  organizationApi.calendars.mockResolvedValue({ data: [DEFAULT, SHIFT] });
  organizationApi.calendarHolidays.mockResolvedValue({ data: [HOLIDAY] });
});

const rowFor = async (name) => {
  const cell = await screen.findByText(name);
  return cell.closest("tr");
};

describe("Calendars", () => {
  it("lists calendars with their scope and work-week summary", async () => {
    render(<Calendars />);

    const companyDefault = await rowFor("Standard");
    expect(within(companyDefault).getByText("Company default")).toBeInTheDocument();
    expect(within(companyDefault).getByText("Mon, Tue, Wed, Thu, Fri")).toBeInTheDocument();

    const perUnit = await rowFor("Shopfloor");
    expect(within(perUnit).getByText("Shreeji")).toBeInTheDocument();
    expect(within(perUnit).getByText("All days")).toBeInTheDocument();
  });

  it("creates a calendar with work week as an array of day keys", async () => {
    organizationApi.createCalendar.mockResolvedValue({});

    render(<Calendars />);
    await rowFor("Standard");

    await userEvent.click(screen.getByRole("button", { name: /add calendar/i }));
    await userEvent.selectOptions(await screen.findByLabelText(/company \*/i), "1");
    await userEvent.type(screen.getByLabelText(/calendar name/i), "Shift A");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(organizationApi.createCalendar).toHaveBeenCalled());
    expect(organizationApi.createCalendar.mock.calls[0][0]).toEqual({
      companyId: 1,
      unitId: null,
      name: "Shift A",
      description: "",
      workWeek: ["mon", "tue", "wed", "thu", "fri"],
    });
  });

  it("toggles status through the status route", async () => {
    organizationApi.setCalendarStatus.mockResolvedValue({});

    render(<Calendars />);
    const row = await rowFor("Standard");

    await userEvent.click(within(row).getByRole("button", { name: /deactivate standard/i }));

    await waitFor(() => expect(organizationApi.setCalendarStatus).toHaveBeenCalled());
    expect(organizationApi.setCalendarStatus.mock.calls[0]).toEqual([3, false, "t", "Bearer"]);
  });

  it("disables delete for a calendar that owns holidays", async () => {
    render(<Calendars />);

    const withHolidays = await rowFor("Standard");
    const free = await rowFor("Shopfloor");

    expect(within(withHolidays).getByRole("button", { name: /delete standard/i })).toBeDisabled();
    expect(within(free).getByRole("button", { name: /delete shopfloor/i })).toBeEnabled();
  });

  it("lists holidays in the drawer and deletes one through the holiday route", async () => {
    organizationApi.deleteHoliday.mockResolvedValue({});

    render(<Calendars />);
    const row = await rowFor("Standard");

    await userEvent.click(within(row).getByRole("button", { name: /holidays of standard/i }));

    const holidayRow = await rowFor("Independence Day");
    expect(within(holidayRow).getByText(/annual/)).toBeInTheDocument();

    await userEvent.click(within(holidayRow).getByRole("button", { name: /delete holiday independence day/i }));

    await waitFor(() => expect(organizationApi.deleteHoliday).toHaveBeenCalled());
    expect(organizationApi.deleteHoliday.mock.calls[0]).toEqual([3, 51, "t", "Bearer"]);
  });

  it("hides every control the actor lacks the permission for", async () => {
    allowed = new Set(["org.calendar.read"]);

    render(<Calendars />);
    await rowFor("Standard");

    expect(screen.queryByRole("button", { name: /add calendar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit standard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete standard/i })).not.toBeInTheDocument();
  });
});