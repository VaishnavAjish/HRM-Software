import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiState = vi.hoisted(() => ({ response: { status: true }, error: null }));

vi.mock("../../utils/api", () => ({
  candidateApi: {
    resendVerification: vi.fn(() => (apiState.error ? Promise.reject(apiState.error) : Promise.resolve(apiState.response))),
  },
}));

import ResendVerificationButton from "./ResendVerificationButton";
import { candidateApi } from "../../utils/api";

describe("ResendVerificationButton", () => {
  beforeEach(() => {
    apiState.response = { status: true };
    apiState.error = null;
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls the resend endpoint with the candidate's email and shows a sent state", async () => {
    render(<ResendVerificationButton email="jane@example.com" />);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(candidateApi.resendVerification).toHaveBeenCalledWith({ email: "jane@example.com" }));
    expect(await screen.findByText(/verification email sent/i)).toBeInTheDocument();
  });

  it("enters a cooldown after a successful send and disables the button", async () => {
    render(<ResendVerificationButton email="jane@example.com" />);

    fireEvent.click(screen.getByRole("button"));
    await screen.findByText(/verification email sent/i);

    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByText(/resend available in 60s/i)).toBeInTheDocument();
  });

  it("shows an error message when the backend reports failure", async () => {
    apiState.response = { status: false, message: "This feature is temporarily unavailable. Please try again later." };
    render(<ResendVerificationButton email="jane@example.com" />);

    fireEvent.click(screen.getByRole("button"));

    expect(await screen.findByText("This feature is temporarily unavailable. Please try again later.")).toBeInTheDocument();
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("does not call the API when there is no email", () => {
    render(<ResendVerificationButton email={null} />);

    fireEvent.click(screen.getByRole("button"));

    expect(candidateApi.resendVerification).not.toHaveBeenCalled();
  });
});
