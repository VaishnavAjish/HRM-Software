import { describe, expect, it } from 'vitest';

import {
  FieldAccessError,
  applyFieldSecurity,
  assertWritable,
  changedFields,
  maskValue,
} from './field-security.js';
import { buildAuthorizedWhere, needsPerRecordCheck, withAuthorization } from './row-security.js';
import type { AuthorizationDecision, DecisionSource, Subject } from './authorization.types.js';

const subject: Subject = {
  id: 7,
  role: 1,
  type: null,
  company_code: 'nidhi-impex',
  unit: 'Shreeji',
  department: 'Accounts',
  status: '0',
  is_deleted: false,
};

function decision(sources: Partial<DecisionSource>[], allowed = true): AuthorizationDecision {
  return {
    allowed,
    decisionId: 'test',
    reasonCode: allowed ? 'EXPLICIT_ALLOW' : 'PERMISSION_NOT_ASSIGNED',
    reason: '',
    matchedPolicyIds: [],
    sources: sources.map((source) => ({
      type: 'ROLE_PERMISSION',
      id: 1,
      effect: 'ALLOW',
      inherited: false,
      ...source,
    })) as DecisionSource[],
    obligations: {},
    failedConditions: [],
    effectiveState: allowed ? 'ALLOW' : 'NOT_ASSIGNED',
    evaluationTimeMs: 1,
  };
}

/* ------------------------------------------------------------------ */

describe('maskValue', () => {
  it('keeps the last four characters', () => {
    expect(maskValue('123456789012')).toBe('••••••••9012');
  });

  it('replaces a short value entirely', () => {
    expect(maskValue('1234')).toBe('••••');
    expect(maskValue('ab')).toBe('••');
  });

  it('caps the mask length so a long value does not produce a wall of dots', () => {
    expect(String(maskValue('x'.repeat(200)))).toHaveLength(16);
  });

  it('passes null and undefined through', () => {
    expect(maskValue(null)).toBeNull();
    expect(maskValue(undefined)).toBeUndefined();
  });
});

describe('applyFieldSecurity', () => {
  const record = {
    id: 1,
    name: 'Asha',
    aadhar_card_no: '123456789012',
    bank_account_no: '9876543210',
    salary: 50000,
  };

  it('is a no-op without obligations', () => {
    expect(applyFieldSecurity(record, null)).toBe(record);
    expect(applyFieldSecurity(record, {})).toBe(record);
  });

  it('removes hidden fields entirely', () => {
    const out = applyFieldSecurity(record, { hiddenFields: ['aadhar_card_no'] });
    expect(out).not.toHaveProperty('aadhar_card_no');
    expect(out.name).toBe('Asha');
  });

  it('masks rather than removes', () => {
    const out = applyFieldSecurity(record, { maskedFields: ['bank_account_no'] });
    expect(out.bank_account_no).toBe('••••••3210');
  });

  it('treats allowedFields as an allow-list that wins', () => {
    const out = applyFieldSecurity(record, { allowedFields: ['id', 'name'] });
    expect(Object.keys(out)).toEqual(['id', 'name']);
  });

  it('applies to arrays of records', () => {
    const out = applyFieldSecurity([record, record], { hiddenFields: ['salary'] });
    expect(out).toHaveLength(2);
    expect(out[0]).not.toHaveProperty('salary');
  });

  it('recurses into nested objects', () => {
    const nested = { employee: { name: 'Asha', aadhar_card_no: '123456789012' } };
    const out = applyFieldSecurity(nested, { hiddenFields: ['aadhar_card_no'] });
    expect(out.employee).not.toHaveProperty('aadhar_card_no');
  });

  it('does not stringify an object it was told to mask', () => {
    const nested = { meta: { a: 1 } };
    const out = applyFieldSecurity(nested, { maskedFields: ['meta'] });
    expect(out.meta).toEqual({ a: 1 });
  });

  it('does not mutate the input', () => {
    const copy = { ...record };
    applyFieldSecurity(record, { hiddenFields: ['salary'] });
    expect(record).toEqual(copy);
  });
});

describe('assertWritable', () => {
  it('permits an unrestricted write', () => {
    expect(() => assertWritable(['designation'], {})).not.toThrow();
    expect(() => assertWritable(['designation'], null)).not.toThrow();
  });

  it('rejects a read-only field', () => {
    expect(() => assertWritable(['salary'], { readOnlyFields: ['salary'] })).toThrow(FieldAccessError);
  });

  it('rejects a hidden field — not seeing it means not setting it', () => {
    expect(() => assertWritable(['aadhar_card_no'], { hiddenFields: ['aadhar_card_no'] })).toThrow(
      FieldAccessError,
    );
  });

  it('rejects anything outside an allow-list', () => {
    expect(() => assertWritable(['salary'], { allowedFields: ['name'] })).toThrow(FieldAccessError);
  });

  it('names every offending field', () => {
    try {
      assertWritable(['salary', 'bank_account_no'], { readOnlyFields: ['salary', 'bank_account_no'] });
      expect.unreachable();
    } catch (error) {
      expect((error as FieldAccessError).fields).toEqual(['salary', 'bank_account_no']);
      expect((error as FieldAccessError).statusCode).toBe(403);
    }
  });

  it('permits an allowed field alongside a restricted one that is unchanged', () => {
    expect(() => assertWritable(['designation'], { readOnlyFields: ['salary'] })).not.toThrow();
  });
});

describe('changedFields', () => {
  const current = { name: 'Asha', salary: 50000, designation: 'Clerk' };

  it('reports only genuine changes', () => {
    expect(changedFields({ name: 'Asha', designation: 'Senior Clerk' }, current)).toEqual(['designation']);
  });

  it('ignores a field echoed back unchanged', () => {
    // This is what stops a client that round-trips the whole record from
    // being rejected for "changing" a read-only field.
    expect(changedFields({ salary: 50000, designation: 'Clerk' }, current)).toEqual([]);
  });

  it('treats string and number forms of the same value as unchanged', () => {
    expect(changedFields({ salary: '50000' }, current)).toEqual([]);
  });

  it('treats everything as changed when there is no current record', () => {
    expect(changedFields({ name: 'A', salary: 1 }, null)).toEqual(['name', 'salary']);
  });
});

/* ------------------------------------------------------------------ */

describe('buildAuthorizedWhere', () => {
  it('returns null for a denied decision — no rows, not all rows', () => {
    expect(buildAuthorizedWhere(decision([], false), subject)).toBeNull();
  });

  it('returns an empty filter for GLOBAL', () => {
    expect(buildAuthorizedWhere(decision([{ scopeType: 'GLOBAL' }]), subject)).toEqual({});
  });

  it('scopes TENANT to the subject companies', () => {
    expect(buildAuthorizedWhere(decision([{ scopeType: 'TENANT' }]), subject)).toEqual({
      company_code: { in: ['nidhi-impex'] },
    });
  });

  it('expands a multi-company subject', () => {
    const multi = { ...subject, company_code: 'nidhi-impex,silver-star' };
    expect(buildAuthorizedWhere(decision([{ scopeType: 'TENANT' }]), multi)).toEqual({
      company_code: { in: ['nidhi-impex', 'silver-star'] },
    });
  });

  it('does not filter when the subject holds all companies', () => {
    const all = { ...subject, company_code: 'all-companies' };
    expect(buildAuthorizedWhere(decision([{ scopeType: 'TENANT' }]), all)).toEqual({});
  });

  it('narrows TENANT to the grant scope when one is set', () => {
    const where = buildAuthorizedWhere(
      decision([{ scopeType: 'TENANT', scopeId: 'silver-star' }]),
      subject,
    );
    expect(where).toEqual({ company_code: { in: ['silver-star'] } });
  });

  it('maps the record-level scopes', () => {
    expect(buildAuthorizedWhere(decision([{ scopeType: 'SELF' }]), subject)).toEqual({ id: 7 });
    expect(buildAuthorizedWhere(decision([{ scopeType: 'DIRECT_REPORTS' }]), subject)).toEqual({
      manager_id: 7,
    });
    expect(buildAuthorizedWhere(decision([{ scopeType: 'OWN_RECORDS' }]), subject)).toEqual({
      OR: [{ owner_id: 7 }, { created_by: 7 }],
    });
  });

  it('ORs several scopes, because holding two widens access', () => {
    const where = buildAuthorizedWhere(
      decision([
        { scopeType: 'BRANCH', scopeId: '3' },
        { scopeType: 'BRANCH', scopeId: '9' },
      ]),
      subject,
    );
    expect(where).toEqual({ OR: [{ branch_id: '3' }, { branch_id: '9' }] });
  });

  it('subtracts a DENY scope with NOT', () => {
    const where = buildAuthorizedWhere(
      decision([
        { scopeType: 'TENANT' },
        { scopeType: 'BRANCH', scopeId: '9', effect: 'DENY' },
      ]),
      subject,
    );
    expect(where).toEqual({ company_code: { in: ['nidhi-impex'] }, NOT: { branch_id: '9' } });
  });

  it('does not narrow when an allow carries no usable scope', () => {
    const where = buildAuthorizedWhere(
      decision([{ scopeType: 'GLOBAL' }, { scopeType: 'BRANCH', scopeId: '3' }]),
      subject,
    );
    expect(where).toEqual({});
  });

  it('drops an unrecognised scope instead of treating it as global', () => {
    expect(buildAuthorizedWhere(decision([{ scopeType: 'WAREHOUSE' as never }]), subject)).toEqual({});
  });

  it('honours custom column names', () => {
    const where = buildAuthorizedWhere(decision([{ scopeType: 'SELF' }]), subject, { id: 'user_id' });
    expect(where).toEqual({ user_id: 7 });
  });

  it('parses SELECTED_RECORDS in both encodings', () => {
    expect(buildAuthorizedWhere(decision([{ scopeType: 'SELECTED_RECORDS', scopeId: '[1,2]' }]), subject)).toEqual({
      id: { in: ['1', '2'] },
    });
    expect(buildAuthorizedWhere(decision([{ scopeType: 'SELECTED_RECORDS', scopeId: '3,4' }]), subject)).toEqual({
      id: { in: ['3', '4'] },
    });
  });
});

describe('withAuthorization', () => {
  it('propagates a refusal', () => {
    expect(withAuthorization(null, { status: 'ACTIVE' })).toBeNull();
  });

  it('ANDs the two filters so a caller can only narrow', () => {
    expect(withAuthorization({ company_code: 'a' }, { status: 'ACTIVE' })).toEqual({
      AND: [{ company_code: 'a' }, { status: 'ACTIVE' }],
    });
  });

  it('collapses when either side is empty', () => {
    expect(withAuthorization({}, { status: 'ACTIVE' })).toEqual({ status: 'ACTIVE' });
    expect(withAuthorization({ company_code: 'a' }, {})).toEqual({ company_code: 'a' });
  });

  it('cannot be widened by a caller filter', () => {
    // Whatever the caller sends, the authorized clause survives in the AND.
    const merged = withAuthorization({ company_code: 'a' }, { company_code: 'b' });
    expect(merged).toEqual({ AND: [{ company_code: 'a' }, { company_code: 'b' }] });
  });
});

describe('needsPerRecordCheck', () => {
  it('flags scopes that cannot be pushed into a query', () => {
    expect(needsPerRecordCheck([{ scopeType: 'INDIRECT_REPORTS' } as DecisionSource])).toBe(true);
    expect(needsPerRecordCheck([{ scopeType: 'TENANT' } as DecisionSource])).toBe(false);
  });
});
