import { describe, expect, it } from 'vitest';

import { ScopeMatcher } from './scope.matcher.js';

const matcher = new ScopeMatcher();

describe('ScopeMatcher.tenantMatches', () => {
  it('lets a global actor through regardless', () => {
    expect(matcher.tenantMatches('nidhi-impex', 'silver-star', true)).toBe(true);
  });

  it('matches a single tenant', () => {
    expect(matcher.tenantMatches('nidhi-impex', 'nidhi-impex', false)).toBe(true);
    expect(matcher.tenantMatches('nidhi-impex', 'silver-star', false)).toBe(false);
  });

  it('matches a comma list, as multi-company admins store it', () => {
    expect(matcher.tenantMatches('nidhi-impex,silver-star', 'silver-star', false)).toBe(true);
    expect(matcher.tenantMatches('nidhi-impex, silver-star', 'silver-star', false)).toBe(true);
    expect(matcher.tenantMatches('nidhi-impex,silver-star', 'third-co', false)).toBe(false);
  });

  it('treats an all-companies subject as covering any tenant', () => {
    expect(matcher.tenantMatches('all-companies', 'silver-star', false)).toBe(true);
    expect(matcher.tenantMatches('all', 'silver-star', false)).toBe(true);
  });

  it('treats an unscoped resource as reachable', () => {
    expect(matcher.tenantMatches('nidhi-impex', null, false)).toBe(true);
    expect(matcher.tenantMatches('nidhi-impex', 'all-companies', false)).toBe(true);
  });

  it('denies a subject with no tenant against a scoped resource', () => {
    expect(matcher.tenantMatches(null, 'silver-star', false)).toBe(false);
  });
});

describe('ScopeMatcher.matches', () => {
  const subject = {
    id: 7,
    company_code: 'nidhi-impex',
    indirect_report_ids: [11, 12],
    custom_scope_ids: ['90'],
  };

  it('GLOBAL always matches', () => {
    expect(matcher.matches('GLOBAL', null, subject, { id: 1, company_code: 'other' })).toBe(true);
  });

  it('TENANT falls back to the subject company when the grant carries no id', () => {
    expect(matcher.matches('TENANT', null, subject, { company_code: 'nidhi-impex' })).toBe(true);
    expect(matcher.matches('TENANT', null, subject, { company_code: 'silver-star' })).toBe(false);
  });

  it('TENANT treats a resource without a tenant as reachable', () => {
    expect(matcher.matches('TENANT', null, subject, { id: 5 })).toBe(true);
  });

  it('BRANCH compares branch ids across string and number', () => {
    expect(matcher.matches('BRANCH', '3', subject, { branch_id: 3 })).toBe(true);
    expect(matcher.matches('BRANCH', '3', subject, { branch_id: 4 })).toBe(false);
  });

  it('BUSINESS_UNIT reads the unit column this schema actually uses', () => {
    expect(matcher.matches('BUSINESS_UNIT', 'Shreeji', subject, { unit: 'Shreeji' })).toBe(true);
  });

  it('DEPARTMENT accepts either the id or the denormalised name', () => {
    expect(matcher.matches('DEPARTMENT', 'Accounts', subject, { department: 'Accounts' })).toBe(true);
    expect(matcher.matches('DEPARTMENT', '4', subject, { department_id: 4 })).toBe(true);
  });

  it('SELF matches the subject own record', () => {
    expect(matcher.matches('SELF', null, subject, { id: 7 })).toBe(true);
    expect(matcher.matches('SELF', null, subject, { id: 8 })).toBe(false);
  });

  it('OWN_RECORDS falls back from owner_id to created_by', () => {
    expect(matcher.matches('OWN_RECORDS', null, subject, { owner_id: 7 })).toBe(true);
    expect(matcher.matches('OWN_RECORDS', null, subject, { created_by: 7 })).toBe(true);
    expect(matcher.matches('OWN_RECORDS', null, subject, { created_by: 8 })).toBe(false);
  });

  it('DIRECT_REPORTS matches the resource manager', () => {
    expect(matcher.matches('DIRECT_REPORTS', null, subject, { id: 20, manager_id: 7 })).toBe(true);
  });

  it('INDIRECT_REPORTS reads the precomputed subject list', () => {
    expect(matcher.matches('INDIRECT_REPORTS', null, subject, { id: 11 })).toBe(true);
    expect(matcher.matches('INDIRECT_REPORTS', null, subject, { id: 99 })).toBe(false);
  });

  it('SHARED_RECORDS reads the resource share list', () => {
    expect(matcher.matches('SHARED_RECORDS', null, subject, { id: 1, shared_with: [7, 8] })).toBe(true);
    expect(matcher.matches('SHARED_RECORDS', null, subject, { id: 1, shared_with: [8] })).toBe(false);
  });

  it('SELECTED_RECORDS parses a JSON array or a comma list', () => {
    expect(matcher.matches('SELECTED_RECORDS', '[1,2,3]', subject, { id: 2 })).toBe(true);
    expect(matcher.matches('SELECTED_RECORDS', '1,2,3', subject, { id: 3 })).toBe(true);
    expect(matcher.matches('SELECTED_RECORDS', '1,2,3', subject, { id: 4 })).toBe(false);
  });

  it('CUSTOM_FILTER reads the subject allow-list', () => {
    expect(matcher.matches('CUSTOM_FILTER', null, subject, { id: 90 })).toBe(true);
  });

  it('two nulls are not a match', () => {
    // Otherwise a branch-scoped grant would cover every branchless record.
    expect(matcher.matches('BRANCH', null, subject, {})).toBe(false);
  });

  it('an unrecognised scope type denies rather than defaulting open', () => {
    expect(matcher.matches('WAREHOUSE', '1', subject, { id: 1 })).toBe(false);
  });

  it('defaults a blank scope type to TENANT', () => {
    expect(matcher.matches('', null, subject, { company_code: 'nidhi-impex' })).toBe(true);
    expect(matcher.matches(null, null, subject, { company_code: 'silver-star' })).toBe(false);
  });
});

describe('ScopeMatcher.tenant', () => {
  it('reads whichever tenant column is present', () => {
    expect(matcher.tenant({ tenant_id: 'a' })).toBe('a');
    expect(matcher.tenant({ company_code: 'b' })).toBe('b');
    expect(matcher.tenant({ organization_code: 'c' })).toBe('c');
    expect(matcher.tenant({})).toBeNull();
    expect(matcher.tenant({ company_code: '' })).toBeNull();
  });
});
