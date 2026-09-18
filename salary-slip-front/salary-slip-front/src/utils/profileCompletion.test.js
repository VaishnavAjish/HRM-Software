import { describe, it, expect } from 'vitest';
import { isEmployeeProfileComplete, getProfileCompletionPercentage } from './profileCompletion';

describe('profileCompletion utils', () => {
  it('returns 0 for empty employee object', () => {
    expect(getProfileCompletionPercentage(null)).toBe(0);
    expect(getProfileCompletionPercentage({})).toBe(0);
  });

  it('calculates 100% completion when all required fields and photo are present', () => {
    const emp = {
      name: 'John Doe',
      email: 'john@example.com',
      mobileNo: '9876543210',
      dob: '1990-01-01',
      address: '123 Main St',
      gender: 'Male',
      department: 'IT',
      designation: 'Software Engineer',
      aadharCardNo: '123456789012',
      panCardNo: 'ABCDE1234F',
      bankName: 'HDFC Bank',
      bankAccountNo: '123456789',
      bankIfscCode: 'HDFC0001234',
      photo: 'photos/john.jpg',
      familyDetails: [{ name: 'Jane Doe', relation: 'Spouse' }]
    };
    expect(getProfileCompletionPercentage(emp)).toBe(100);
    expect(isEmployeeProfileComplete(emp)).toBe(true);
  });

  it('returns less than 100% when photo is not uploaded', () => {
    const emp = {
      name: 'John Doe',
      email: 'john@example.com',
      mobileNo: '9876543210',
      dob: '1990-01-01',
      address: '123 Main St',
      gender: 'Male',
      department: 'IT',
      designation: 'Software Engineer',
      aadharCardNo: '123456789012',
      panCardNo: 'ABCDE1234F',
      bankName: 'HDFC Bank',
      bankAccountNo: '123456789',
      bankIfscCode: 'HDFC0001234',
      photo: null, // missing photo!
    };
    expect(getProfileCompletionPercentage(emp)).toBeLessThan(100);
    expect(isEmployeeProfileComplete(emp)).toBe(false);
  });

  it('calculates partial completion percentage accurately', () => {
    const emp = {
      name: 'Jane Smith',
      email: 'jane@example.com',
      gender: 'Female',
    };
    const pct = getProfileCompletionPercentage(emp);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(100);
  });
});
