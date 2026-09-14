import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import HospitalDirectory from "./HospitalDirectory";

const hospitalNoContacts = {
  id: 1,
  name: "Surat Diamond Hospital",
  city: "Surat",
  isNetworkHospital: true,
  cashlessAvailable: true,
  contacts: [],
};

describe("HospitalDirectory", () => {
  it("shows a loading state", () => {
    render(<HospitalDirectory hospitals={[]} loading />);
    expect(screen.queryByText(/No hospitals/)).not.toBeInTheDocument();
  });

  it("shows a real error message rather than crashing", () => {
    render(<HospitalDirectory hospitals={[]} error="Failed to load hospitals." />);
    expect(screen.getByText("Failed to load hospitals.")).toBeInTheDocument();
  });

  it("shows an honest empty state when there are no hospitals at all", () => {
    render(<HospitalDirectory hospitals={[]} />);
    expect(screen.getByText("No hospitals have been added yet.")).toBeInTheDocument();
  });

  it("does not crash when a hospital has an empty contacts array — shows 'no contact on file' instead", () => {
    render(<HospitalDirectory hospitals={[hospitalNoContacts]} />);

    expect(screen.getByText("Surat Diamond Hospital")).toBeInTheDocument();
    expect(screen.getByText("No contact on file yet.")).toBeInTheDocument();
  });

  it("does not crash when a hospital has no contacts field at all (undefined, not even an array)", () => {
    const { contacts, ...withoutContacts } = hospitalNoContacts;
    void contacts;
    render(<HospitalDirectory hospitals={[withoutContacts]} />);

    expect(screen.getByText("No contact on file yet.")).toBeInTheDocument();
  });

  it("renders contact rows and their call/email actions when contacts exist", () => {
    const withContact = {
      ...hospitalNoContacts,
      contacts: [{ id: 5, designation: "Coordinator", phone: "9998887777", email: "coord@example.com" }],
    };
    render(<HospitalDirectory hospitals={[withContact]} />);

    expect(screen.getByText("Coordinator")).toBeInTheDocument();
    expect(screen.getByTitle("Call")).toHaveAttribute("href", "tel:9998887777");
    expect(screen.getByTitle("Email")).toHaveAttribute("href", "mailto:coord@example.com");
  });

  it("filters hospitals by search term across name/city/specialty", async () => {
    const user = userEvent.setup();
    const hospitals = [
      hospitalNoContacts,
      { id: 2, name: "Kiran Hospital", city: "Surat", contacts: [], specialties: ["Cardiology"] },
    ];
    render(<HospitalDirectory hospitals={hospitals} />);

    await user.type(screen.getByPlaceholderText(/Search name, city, specialty/), "Kiran");

    expect(screen.getByText("Kiran Hospital")).toBeInTheDocument();
    expect(screen.queryByText("Surat Diamond Hospital")).not.toBeInTheDocument();
  });

  it("filters to network-only hospitals when the Network only checkbox is checked", async () => {
    const user = userEvent.setup();
    const hospitals = [
      hospitalNoContacts, // network: true
      { id: 3, name: "Local Clinic", city: "Surat", isNetworkHospital: false, contacts: [] },
    ];
    render(<HospitalDirectory hospitals={hospitals} />);

    await user.click(screen.getByLabelText("Network only"));

    expect(screen.getByText("Surat Diamond Hospital")).toBeInTheDocument();
    expect(screen.queryByText("Local Clinic")).not.toBeInTheDocument();
  });

  it("shows a distinct 'no matches' message when filters exclude everything (vs. a genuinely empty list)", async () => {
    const user = userEvent.setup();
    render(<HospitalDirectory hospitals={[hospitalNoContacts]} />);

    await user.type(screen.getByPlaceholderText(/Search name, city, specialty/), "Nonexistent Hospital Name");

    expect(screen.getByText("No hospitals match these filters.")).toBeInTheDocument();
  });
});
