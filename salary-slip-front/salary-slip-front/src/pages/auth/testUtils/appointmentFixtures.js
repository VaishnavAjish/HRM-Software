import { vi } from "vitest";

/**
 * Shared fixtures for the AppointmentModal tests.
 *
 * The form has ~30 fields with cross-field validators, so filling it through the
 * UI in every test would be slow and brittle. Tests that need a *valid* form
 * open the modal in edit mode with a fully populated `initialData.raw` instead —
 * the same shape the appointment list passes in production.
 */

/** A complete, valid appointment row as the API returns it. */
export function createAppointmentRow(overrides = {}) {
  return {
    id: 104,
    name: "Rohit Kumar Saket",
    emp_code: "EMP1025",
    email: "rohit@example.com",
    mobile_number: "9876543210",
    emp_whatsapp_no: "9876543210",
    punching_no: "4410",
    manager_name: "Ketan",
    salary: "25000",
    department: "Production",
    designation: "Operator",
    joining_date: "2026-07-01",
    address: "12 Main Road",
    village: "Ichapur",
    taluka: "Olpad",
    district: "Surat",
    dob: "1998-05-12",
    birth_place: "Rajasthan",
    gender: "MALE",
    cast: "HINDU",
    marital_status: "UNMARRIED",
    blood_group: "-",
    reference_name: "Dinesh Saini",
    reference_mobile_no: "8107562363",
    // What the API actually returns. aadhar_card_no stays in User::$hidden;
    // aadhaar_full is added deliberately per response for a request allowed to
    // reach the record, and aadhaar_masked remains for API compatibility.
    aadhaar_full: "715115988793",
    aadhaar_masked: "XXXX XXXX 8793",
    pan_card_no: "IFTPP8308N",
    bank_name: "STATE BANK OF INDIA",
    bank_ifsc_code: "SBIN0012820",
    bank_account_no: "39106155049",
    education: "ITI",
    company_code: "nidhi-impex",
    unit: "Ichapur",
    emp_signature: "RAJESH",
    members: JSON.stringify([
      { name: "Babulal", relation: "FATHER", dob: "", mobile: "8441821585", occupation: "FARMAR" },
    ]),
    ...overrides,
  };
}

/** The `initialData` prop shape the appointment list passes to the modal. */
export function createInitialData(overrides = {}) {
  const raw = createAppointmentRow(overrides.raw);

  return {
    id: raw.id,
    raw,
    documents: {},
    photo: "",
    ...overrides,
  };
}

export function createSaveResponse({ appointmentId = 104, updated = false } = {}) {
  return {
    success: true,
    data: {
      appointmentId,
      appointmentNumber: `APT-${String(appointmentId).padStart(6, "0")}`,
      aadhaarMasked: "XXXX XXXX 8793",
      message: updated
        ? "Appointment details updated successfully."
        : "Appointment details saved successfully.",
    },
  };
}

export function createGetResponse({ appointmentId = 104, row } = {}) {
  const appointment = row || createAppointmentRow({ id: appointmentId });

  return {
    success: true,
    data: {
      appointmentId,
      appointmentNumber: `APT-${String(appointmentId).padStart(6, "0")}`,
      appointment: { ...appointment, aadhaar_full: "715115988793", aadhaar_masked: "XXXX XXXX 8793" },
    },
  };
}

/** Lets a test observe an in-flight state before resolving the request. */
export function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

export function createPhotoFile(name = "selfie.jpg") {
  return new File(["binary"], name, { type: "image/jpeg" });
}

/** Point window.location at a query string without a navigation. */
export function setAppointmentRoute(search = "") {
  window.history.replaceState({}, "", `/admin/appointments${search}`);
}

export function currentRouteParams() {
  return new URLSearchParams(window.location.search);
}

/** An error shaped like the one apiRequest throws. */
export function createApiError(message, { status = 422, data } = {}) {
  const error = new Error(message);
  error.status = status;
  if (data) error.data = data;
  return error;
}

export const mockToast = { success: vi.fn(), error: vi.fn() };
