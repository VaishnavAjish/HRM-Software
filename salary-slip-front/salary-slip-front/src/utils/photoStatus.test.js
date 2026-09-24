import { describe, it, expect, beforeEach } from "vitest";
import {
  isPhotoDeletedOrDummy,
  markPhotoAsDeleted,
  clearPhotoDeletedFlag,
} from "./photoStatus";

beforeEach(() => {
  localStorage.clear();
});

describe("isPhotoDeletedOrDummy", () => {
  it("is dummy when there is no photo at all", () => {
    expect(isPhotoDeletedOrDummy({ id: 1, photo: null })).toBe(true);
  });

  it("is not dummy for a fresh employee with a valid photo", () => {
    expect(isPhotoDeletedOrDummy({ id: 1, photo: "photos/john.jpg" })).toBe(false);
  });

  it("is dummy right after markPhotoAsDeleted, since photo is cleared", () => {
    const emp = { id: 1, empCode: "E1", photo: "photos/john.jpg" };
    markPhotoAsDeleted(emp, "bad photo");
    emp.photo = null; // mirrors the admin flow, which also nulls the field server-side
    expect(isPhotoDeletedOrDummy(emp)).toBe(true);
  });

  it("stops being dummy once a real replacement photo is uploaded, even in a browser that never called clearPhotoDeletedFlag", () => {
    // Simulate the admin marking the photo dummy (this writes the empCode into
    // this browser's localStorage deleted-set).
    markPhotoAsDeleted({ id: 1, empCode: "E1" }, "bad photo");

    // Simulate a fresh fetch from the server after the employee/admin uploads
    // a genuinely new photo through a flow that never calls
    // clearPhotoDeletedFlag (e.g. the admin Employee Management edit form).
    // The server never persists photo_deleted/photo_rejected/is_photo_dummy,
    // so a freshly-fetched record never carries them either.
    const refetched = { id: 1, empCode: "E1", photo: "photos/john-new.jpg" };

    expect(isPhotoDeletedOrDummy(refetched)).toBe(false);
  });

  it("respects an explicit clearPhotoDeletedFlag call", () => {
    const emp = { id: 1, empCode: "E1", photo: "photos/john.jpg" };
    markPhotoAsDeleted(emp, "bad photo");
    emp.photo = null;
    clearPhotoDeletedFlag(emp);
    emp.photo = "photos/john-new.jpg";
    expect(isPhotoDeletedOrDummy(emp)).toBe(false);
  });
});
