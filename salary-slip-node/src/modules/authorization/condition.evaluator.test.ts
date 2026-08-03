import { describe, expect, it } from 'vitest';

import { ConditionEvaluator, InvalidConditionError, getPath } from './condition.evaluator.js';
import type { EvaluationContext } from './authorization.types.js';

const evaluator = new ConditionEvaluator();

function context(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    subject: { id: 7, company_code: 'nidhi-impex', department: 'Accounts', branch_id: 3, team_id: null },
    resource: { id: 42, company_code: 'nidhi-impex', owner_id: 7, created_by: 9, status: 'ACTIVE', amount: 5000 },
    environment: { mfa_verified: true, current_date: '2026-08-03' },
    action: { permission: 'hr.employee.update', changed_fields: ['designation'] },
    relationships: ['manager_of'],
    ...overrides,
  };
}

describe('getPath', () => {
  it('walks dot notation', () => {
    expect(getPath({ a: { b: { c: 1 } } }, 'a.b.c')).toBe(1);
  });

  it('returns undefined rather than throwing on a missing branch', () => {
    expect(getPath({ a: null }, 'a.b.c')).toBeUndefined();
    expect(getPath({ a: 5 }, 'a.b')).toBeUndefined();
    expect(getPath(undefined, 'a')).toBeUndefined();
  });
});

describe('ConditionEvaluator.evaluate', () => {
  it('treats an absent tree as unconditional', () => {
    expect(evaluator.evaluate(null, context())).toBe(true);
    expect(evaluator.evaluate(undefined, context())).toBe(true);
    expect(evaluator.evaluate({} as never, context())).toBe(true);
  });

  it('resolves a bare left-hand path but treats the right as a literal', () => {
    expect(
      evaluator.evaluate({ operator: 'equals', left: 'resource.status', right: 'ACTIVE' }, context()),
    ).toBe(true);

    // "resource.status" on the right is the literal string, not a lookup.
    expect(
      evaluator.evaluate({ operator: 'equals', left: 'resource.status', right: 'resource.status' }, context()),
    ).toBe(false);
  });

  it('resolves a $-prefixed right-hand path', () => {
    expect(
      evaluator.evaluate(
        { operator: 'equals', left: 'subject.company_code', right: '$resource.company_code' },
        context(),
      ),
    ).toBe(true);
  });

  it('accepts the {path} form on either side', () => {
    expect(
      evaluator.evaluate(
        { operator: 'equals', left: { path: 'subject.id' }, right: { path: 'resource.owner_id' } },
        context(),
      ),
    ).toBe(true);
  });

  it('accepts attribute/value aliases', () => {
    expect(
      evaluator.evaluate({ operator: 'equals', attribute: 'resource.status', value: 'ACTIVE' }, context()),
    ).toBe(true);
  });

  describe('groups', () => {
    it('all requires every child', () => {
      const tree = {
        all: [
          { operator: 'equals' as const, left: 'resource.status', right: 'ACTIVE' },
          { operator: 'equals' as const, left: 'subject.department', right: 'Accounts' },
        ],
      };
      expect(evaluator.evaluate(tree, context())).toBe(true);
    });

    it('any requires one child', () => {
      const tree = {
        any: [
          { operator: 'equals' as const, left: 'resource.status', right: 'TERMINATED' },
          { operator: 'equals' as const, left: 'subject.department', right: 'Accounts' },
        ],
      };
      expect(evaluator.evaluate(tree, context())).toBe(true);
    });

    it('an empty all is true and an empty any is false, matching PHP', () => {
      expect(evaluator.evaluate({ all: [] }, context())).toBe(true);
      expect(evaluator.evaluate({ any: [] }, context())).toBe(false);
    });

    it('negates with not', () => {
      expect(
        evaluator.evaluate({ not: { operator: 'equals', left: 'resource.status', right: 'ACTIVE' } }, context()),
      ).toBe(false);
    });

    it('nests (A AND B) OR (C AND D)', () => {
      const tree = {
        any: [
          {
            all: [
              { operator: 'equals' as const, left: 'resource.status', right: 'TERMINATED' },
              { operator: 'equals' as const, left: 'subject.department', right: 'Accounts' },
            ],
          },
          {
            all: [
              { operator: 'equals' as const, left: 'resource.status', right: 'ACTIVE' },
              { operator: 'greater_than' as const, left: 'resource.amount', right: 1000 },
            ],
          },
        ],
      };
      expect(evaluator.evaluate(tree, context())).toBe(true);
    });
  });

  describe('operators', () => {
    const cases: Array<[string, unknown, boolean]> = [
      ['equals', { operator: 'equals', left: 'resource.amount', right: 5000 }, true],
      ['not_equals', { operator: 'not_equals', left: 'resource.amount', right: 1 }, true],
      ['contains (array)', { operator: 'contains', left: 'action.changed_fields', right: 'designation' }, true],
      ['contains (string)', { operator: 'contains', left: 'resource.status', right: 'CTI' }, true],
      ['not_contains', { operator: 'not_contains', left: 'action.changed_fields', right: 'salary' }, true],
      ['in', { operator: 'in', left: 'resource.status', right: ['ACTIVE', 'DRAFT'] }, true],
      ['not_in', { operator: 'not_in', left: 'resource.status', right: ['TERMINATED'] }, true],
      ['greater_than', { operator: 'greater_than', left: 'resource.amount', right: 100 }, true],
      ['greater_than_or_equal', { operator: 'greater_than_or_equal', left: 'resource.amount', right: 5000 }, true],
      ['less_than', { operator: 'less_than', left: 'resource.amount', right: 6000 }, true],
      ['less_than_or_equal', { operator: 'less_than_or_equal', left: 'resource.amount', right: 5000 }, true],
      ['between', { operator: 'between', left: 'resource.amount', right: [1000, 9000] }, true],
      ['between (outside)', { operator: 'between', left: 'resource.amount', right: [1, 10] }, false],
      ['starts_with', { operator: 'starts_with', left: 'resource.status', right: 'ACT' }, true],
      ['ends_with', { operator: 'ends_with', left: 'resource.status', right: 'IVE' }, true],
      ['exists', { operator: 'exists', left: 'resource.owner_id' }, true],
      ['not_exists', { operator: 'not_exists', left: 'resource.missing' }, true],
      ['matches', { operator: 'matches', left: 'action.permission', right: 'hr.employee.*' }, true],
      ['is_owner', { operator: 'is_owner' }, true],
      ['is_creator', { operator: 'is_creator' }, false],
      ['is_same_company', { operator: 'is_same_company' }, true],
      ['is_same_department', { operator: 'is_same_department' }, false],
      ['is_manager', { operator: 'is_manager' }, true],
      ['is_direct_report', { operator: 'is_direct_report' }, false],
    ];

    for (const [name, tree, expected] of cases) {
      it(`${name} -> ${expected}`, () => {
        expect(evaluator.evaluate(tree as never, context())).toBe(expected);
      });
    }

    it('compares numeric strings numerically', () => {
      const ctx = context({ resource: { amount: '5000' } });
      expect(evaluator.evaluate({ operator: 'greater_than', left: 'resource.amount', right: 100 }, ctx)).toBe(true);
    });

    it('orders ISO dates', () => {
      const ctx = context({ resource: { valid_until: '2027-01-01' } });
      expect(
        evaluator.evaluate(
          { operator: 'greater_than', left: 'resource.valid_until', right: '2026-08-03' },
          ctx,
        ),
      ).toBe(true);
    });

    it('a missing operand never satisfies an ordered comparison', () => {
      expect(
        evaluator.evaluate({ operator: 'greater_than', left: 'resource.missing', right: 1 }, context()),
      ).toBe(false);
    });

    it('is_owner needs both sides present', () => {
      const ctx = context({ subject: { id: 7 }, resource: {} });
      expect(evaluator.evaluate({ operator: 'is_owner' }, ctx)).toBe(false);
    });

    it('compares identity across string and number', () => {
      const ctx = context({ subject: { id: 7 }, resource: { owner_id: '7' } });
      expect(evaluator.evaluate({ operator: 'is_owner' }, ctx)).toBe(true);
    });
  });

  describe('matches is not a regex injection point', () => {
    it('treats metacharacters as literals', () => {
      const ctx = context({ action: { permission: 'hrXemployee' } });
      // '.' must not act as "any character".
      expect(evaluator.evaluate({ operator: 'matches', left: 'action.permission', right: 'hr.employee' }, ctx)).toBe(
        false,
      );
    });

    it('anchors the pattern', () => {
      const ctx = context({ action: { permission: 'prefix.hr.employee.read.suffix' } });
      expect(
        evaluator.evaluate({ operator: 'matches', left: 'action.permission', right: 'hr.employee.read' }, ctx),
      ).toBe(false);
    });

    it('refuses an over-long pattern instead of compiling it', () => {
      const ctx = context({ action: { permission: 'a' } });
      expect(
        evaluator.evaluate({ operator: 'matches', left: 'action.permission', right: 'a'.repeat(300) }, ctx),
      ).toBe(false);
    });

    it('does not hang on a pattern that would backtrack catastrophically', () => {
      const ctx = context({ action: { permission: 'a'.repeat(40) } });
      const started = Date.now();
      evaluator.evaluate({ operator: 'matches', left: 'action.permission', right: '(a+)+$' }, ctx);
      expect(Date.now() - started).toBeLessThan(500);
    });
  });

  it('rejects an unknown operator rather than defaulting to allow', () => {
    expect(() => evaluator.evaluate({ operator: 'drop_table' } as never, context())).toThrow(InvalidConditionError);
  });
});

describe('ConditionEvaluator.validate', () => {
  it('accepts a well-formed tree', () => {
    expect(() =>
      evaluator.validate({ all: [{ operator: 'equals', left: 'resource.status', right: 'ACTIVE' }] }),
    ).not.toThrow();
  });

  it('rejects an unknown operator', () => {
    expect(() => evaluator.validate({ operator: 'exec' } as never)).toThrow('INVALID_POLICY_CONDITION');
  });

  it('rejects excessive nesting', () => {
    let tree: unknown = { operator: 'exists', left: 'resource.id' };
    for (let i = 0; i < 15; i += 1) tree = { all: [tree] };
    expect(() => evaluator.validate(tree as never)).toThrow('INVALID_POLICY_CONDITION_DEPTH');
  });

  it('rejects an oversized group', () => {
    const children = Array.from({ length: 51 }, () => ({ operator: 'exists' as const, left: 'resource.id' }));
    expect(() => evaluator.validate({ all: children })).toThrow('INVALID_POLICY_CONDITION_GROUP');
  });
});
