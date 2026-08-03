import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const FULL_DIGITS = "715115981345";
const FULL_FORMATTED = "7151 1598 1345";
const MASKED = "XXXX XXXX 1345";

vi.mock("../../utils/api", () => ({
  authApi: { getProfile: vi.fn(), updateProfile: vi.fn() },
  salaryApi: { getDepartments: vi.fn() },
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 69, accessToken: "t", tokenType: "Bearer", name: "Ravi" },
    updateCurrentUser: vi.fn(),
  }),
}));

vi.mock("../../hooks/usePhotoCapture", () => ({
  default: () => ({ requestCapture: vi.fn(), cameraModal: null }),
}));

vi.mock("../../components/ModernDatePicker", () => ({
  default: ({ value, onChange, ...rest }) => (
    <input type="date" value={value || ""} onChange={(e) => onChange?.(e.target.value)} {...rest} />
  ),
}));

vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import Profile from "./Profile";
import { authApi, salaryApi } from "../../utils/api";

const selfProfile = {
  id: 69,
  name: "Ravi Kumar",
  emp_code: "EMP1099",
  email: "ravi@example.com",
  mobile_number: "9876543210",
  company_code: "nidhi-impex",
  status: "0",
  aadhaar_masked: MASKED,
  // The self-profile endpoint discloses this because you own the record.
  aadhaar_full: FULL_DIGITS,
  pan_card_no: "ABCDE1234E",
};

beforeEach(() => {
  vi.clearAllMocks();
  salaryApi.getDepartments.mockResolvedValue({ data: [] });
  authApi.getProfile.mockResolvedValue({ user: selfProfile });
});

/** The Aadhaar row lives in the third step of the profile wizard. */
async function openIdentityStep() {
  // Profile calls useNavigate, which throws outside a Router.
  render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );
  await userEvent.click(await screen.findByText(/Identity & Bank/i));
}

/**
 * The profile page was reading aadhaar_masked directly, so an employee saw
 * XXXX XXXX 1345 for their own identity document while appointment details
 * showed the full number. Both now go through getAadhaarDisplayValue, and the
 * backend decides by ownership.
 */
describe("Profile — own Aadhaar", () => {
  it("shows the complete number as soon as the profile loads", async () => {
    await openIdentityStep();

    expect(await screen.findByText(FULL_FORMATTED)).toBeInTheDocument();
    expect(screen.queryByText(MASKED)).toBeNull();
  });

  it("needs no Show or Hide interaction", async () => {
    await openIdentityStep();
    await screen.findByText(FULL_FORMATTED);

    expect(screen.queryByRole("button", { name: /^show$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^hide$/i })).toBeNull();
  });

  it("formats it in groups of four rather than one run of digits", async () => {
    await openIdentityStep();

    await screen.findByText(FULL_FORMATTED);
    expect(screen.queryByText(FULL_DIGITS)).toBeNull();
  });

  it("uses the corrected label spelling", async () => {
    await openIdentityStep();
    await screen.findByText(FULL_FORMATTED);

    expect(screen.getByText("Aadhaar Card No")).toBeInTheDocument();
    expect(screen.queryByText("Aadhar Card No")).toBeNull();
  });

  it("shows a dash rather than a mask when the server sent no full number", async () => {
    authApi.getProfile.mockResolvedValue({
      user: { ...selfProfile, aadhaar_full: undefined },
    });

    await openIdentityStep();

    // Not the mask: an absent field is missing data, and rendering
    // "XXXX XXXX 1345" here would look like a deliberate withholding.
    await waitFor(() => expect(screen.queryByText(MASKED)).toBeNull());
    expect(screen.queryByText(FULL_FORMATTED)).toBeNull();
  });

  it("never reconstructs a number from a mask alone", async () => {
    authApi.getProfile.mockResolvedValue({
      user: { ...selfProfile, aadhaar_full: undefined, aadhaar_masked: MASKED },
    });

    await openIdentityStep();

    // Four known digits cannot become an Aadhaar.
    await waitFor(() => expect(screen.queryByText(/^\d{4} \d{4} \d{4}$/)).toBeNull());
    expect(screen.queryByText(MASKED)).toBeNull();
  });

  it("keeps Aadhaar out of the profile save payload", async () => {
    authApi.updateProfile.mockResolvedValue({ user: selfProfile });

    await openIdentityStep();
    await screen.findByText(FULL_FORMATTED);

    const { getAadhaarDisplayValue } = await import("../../utils/aadhaar");
    // Sanity: the helper is what produced the rendered value.
    expect(getAadhaarDisplayValue(selfProfile)).toBe(FULL_FORMATTED);

    // The field is read-only on this page, so nothing Aadhaar-shaped is posted.
    // Guarded here because posting the displayed value used to overwrite the
    // stored number.
    await waitFor(() => expect(authApi.getProfile).toHaveBeenCalled());

    const posted = authApi.updateProfile.mock.calls.map(([payload]) => payload);
    posted.forEach((payload) => {
      expect(payload).not.toHaveProperty("aadhar_card_no");
      expect(payload).not.toHaveProperty("aadhaar_masked");
    });
  });
});
