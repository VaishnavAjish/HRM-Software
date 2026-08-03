import { beforeEach, describe, expect, it } from 'vitest';

import {
  AuthorizationEngine,
  type AuthorizationRepository,
  type DecisionLogEntry,
  type GrantRow,
  type PolicyRow,
  type RoleContext,
  type TemporaryGrantRow,
} from './authorization.engine.js';
import type { Subject } from './authorization.types.js';

/**
 * In-memory repository.
 *
 * The engine's contract is "deny wins, tenant first, conditions gate" — all
 * of which are assertable without Postgres. Binding these tests to a live
 * database would make the most security-critical suite in the codebase the
 * one most likely to be skipped.
 */
class FakeRepo implements AuthorizationRepository {
  direct: GrantRow[] = [];
  roles: RoleContext[] = [];
  rolePerms = new Map<string, GrantRow[]>();
  policyRows: PolicyRow[] = [];
  temporary: TemporaryGrantRow[] = [];
  rels: string[] = [];
  global = false;
  written: DecisionLogEntry[] = [];

  async directGrants(): Promise<GrantRow[]> {
    return this.direct;
  }
  async roleContexts(): Promise<RoleContext[]> {
    return this.roles;
  }
  async rolePermissions(roleId: number, code: string): Promise<GrantRow[]> {
    return this.rolePerms.get(`${roleId}:${code}`) ?? [];
  }
  async policies(): Promise<PolicyRow[]> {
    return this.policyRows;
  }
  async temporaryGrants(): Promise<TemporaryGrantRow[]> {
    return this.temporary;
  }
  async relationships(): Promise<string[]> {
    return this.rels;
  }
  async hasGlobalAssignment(): Promise<boolean> {
    return this.global;
  }
  async writeDecision(entry: DecisionLogEntry): Promise<void> {
    this.written.push(entry);
  }
}

const employee: Subject = {
  id: 7,
  role: 3,
  type: null,
  company_code: 'nidhi-impex',
  unit: 'Shreeji',
  department: 'Accounts',
  status: '0',
  is_deleted: false,
};

const allow = (id = 1): GrantRow => ({ id, effect: 'ALLOW', conditions: null, obligations: null });
const deny = (id = 2): GrantRow => ({ id, effect: 'DENY', conditions: null, obligations: null });

let repo: FakeRepo;
let engine: AuthorizationEngine;

beforeEach(() => {
  repo = new FakeRepo();
  engine = new AuthorizationEngine(repo);
});

describe('default deny', () => {
  it('denies when nothing grants', async () => {
    const decision = await engine.decide({ subject: employee, action: 'hr.employee.read' });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe('PERMISSION_NOT_ASSIGNED');
    expect(decision.effectiveState).toBe('NOT_ASSIGNED');
  });

  it('distinguishes not-assigned from explicit deny', async () => {
    repo.direct = [deny()];
    const decision = await engine.decide({ subject: employee, action: 'hr.employee.read' });

    expect(decision.reasonCode).toBe('EXPLICIT_DENY');
    expect(decision.effectiveState).toBe('DENY');
  });
});

describe('subject state', () => {
  it('denies a soft-deleted user before reading any grant', async () => {
    repo.direct = [allow()];
    const decision = await engine.decide({
      subject: { ...employee, is_deleted: 1 },
      action: 'hr.employee.read',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe('SUBJECT_DISABLED');
  });

  it('denies a non-active status', async () => {
    repo.direct = [allow()];
    const decision = await engine.decide({ subject: { ...employee, status: '9' }, action: 'hr.employee.read' });

    expect(decision.reasonCode).toBe('SUBJECT_DISABLED');
  });
});

describe('tenant isolation', () => {
  it('denies a cross-tenant resource even when a grant exists', async () => {
    repo.direct = [allow()];
    const decision = await engine.decide({
      subject: employee,
      action: 'hr.employee.read',
      resource: { id: 1, company_code: 'silver-star' },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe('TENANT_ACCESS_DENIED');
  });

  it('allows a same-tenant resource', async () => {
    repo.direct = [allow()];
    const decision = await engine.decide({
      subject: employee,
      action: 'hr.employee.read',
      resource: { id: 1, company_code: 'nidhi-impex' },
    });

    expect(decision.allowed).toBe(true);
  });

  it('lets a multi-company admin reach both of its companies', async () => {
    repo.direct = [allow()];
    const multi = { ...employee, company_code: 'nidhi-impex,silver-star' };

    for (const tenant of ['nidhi-impex', 'silver-star']) {
      const decision = await engine.decide({
        subject: multi,
        action: 'hr.employee.read',
        resource: { id: 1, company_code: tenant },
      });
      expect(decision.allowed).toBe(true);
    }
  });

  it('lets role 0 cross tenants', async () => {
    repo.direct = [allow()];
    const decision = await engine.decide({
      subject: { ...employee, role: 0 },
      action: 'hr.employee.read',
      resource: { id: 1, company_code: 'silver-star' },
    });

    expect(decision.allowed).toBe(true);
  });
});

describe('explicit deny wins', () => {
  it('beats a direct allow', async () => {
    repo.direct = [allow(1), deny(2)];
    const decision = await engine.decide({ subject: employee, action: 'hr.employee.read' });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe('EXPLICIT_DENY');
  });

  it('beats an allow from a different source type', async () => {
    repo.roles = [{ roleId: 1, roleCode: 'hr_manager', scopeType: 'GLOBAL', scopeId: null, inherited: false }];
    repo.rolePerms.set('1:hr.employee.read', [allow(10)]);
    repo.policyRows = [
      {
        id: 5,
        code: 'block-terminated',
        effect: 'DENY',
        subjects: null,
        actions: ['hr.employee.read'],
        resources: ['*'],
        scopeType: 'GLOBAL',
        scopeId: null,
        conditions: null,
        obligations: null,
        priority: 200,
      },
    ];

    const decision = await engine.decide({ subject: employee, action: 'hr.employee.read' });
    expect(decision.allowed).toBe(false);
    expect(decision.matchedPolicyIds).toContain(5);
  });
});

describe('roles and inheritance', () => {
  it('allows through a scoped role', async () => {
    repo.roles = [{ roleId: 1, roleCode: 'hr_manager', scopeType: 'TENANT', scopeId: null, inherited: false }];
    repo.rolePerms.set('1:hr.employee.read', [allow(10)]);

    const decision = await engine.decide({
      subject: employee,
      action: 'hr.employee.read',
      resource: { id: 1, company_code: 'nidhi-impex' },
    });

    expect(decision.allowed).toBe(true);
    expect(decision.sources[0]?.roleCode).toBe('hr_manager');
  });

  it('skips a role whose scope does not cover the resource', async () => {
    repo.roles = [{ roleId: 1, roleCode: 'branch_admin', scopeType: 'BRANCH', scopeId: '3', inherited: false }];
    repo.rolePerms.set('1:hr.employee.read', [allow(10)]);

    const decision = await engine.decide({
      subject: employee,
      action: 'hr.employee.read',
      resource: { id: 1, branch_id: 9 },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.failedConditions).toContain('scope:branch_admin');
  });

  it('marks an inherited-only allow', async () => {
    repo.roles = [{ roleId: 2, roleCode: 'hr_department_manager', scopeType: 'GLOBAL', scopeId: null, inherited: true }];
    repo.rolePerms.set('2:hr.employee.read', [allow(10)]);

    const decision = await engine.decide({ subject: employee, action: 'hr.employee.read' });
    expect(decision.effectiveState).toBe('INHERITED_ALLOW');
  });

  it('marks an inherited-only deny', async () => {
    repo.roles = [{ roleId: 2, roleCode: 'restricted', scopeType: 'GLOBAL', scopeId: null, inherited: true }];
    repo.rolePerms.set('2:hr.employee.read', [deny(10)]);

    const decision = await engine.decide({ subject: employee, action: 'hr.employee.read' });
    expect(decision.effectiveState).toBe('INHERITED_DENY');
  });
});

describe('conditions', () => {
  it('reports CONDITIONAL when an allow carried a condition', async () => {
    repo.direct = [
      {
        id: 1,
        effect: 'ALLOW',
        conditions: { operator: 'equals', left: 'resource.status', right: 'ACTIVE' },
        obligations: null,
      },
    ];

    const decision = await engine.decide({
      subject: employee,
      action: 'hr.employee.update',
      resource: { id: 1, status: 'ACTIVE' },
    });

    expect(decision.allowed).toBe(true);
    expect(decision.effectiveState).toBe('CONDITIONAL');
  });

  it('denies when the condition fails, and names it', async () => {
    repo.direct = [
      {
        id: 1,
        effect: 'ALLOW',
        conditions: { operator: 'equals', left: 'resource.status', right: 'ACTIVE' },
        obligations: null,
      },
    ];

    const decision = await engine.decide({
      subject: employee,
      action: 'hr.employee.update',
      resource: { id: 1, status: 'TERMINATED' },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.failedConditions).toContain('user_permission:1');
  });

  it('denies rather than opens when a stored condition is malformed', async () => {
    repo.policyRows = [
      {
        id: 1,
        code: 'broken',
        effect: 'ALLOW',
        subjects: null,
        actions: ['*'],
        resources: ['*'],
        scopeType: 'GLOBAL',
        scopeId: null,
        conditions: { operator: 'rm_rf' },
        obligations: null,
        priority: 1,
      },
    ];

    const decision = await engine.decide({ subject: employee, action: 'hr.employee.read' });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe('INVALID_POLICY_CONDITION');
  });
});

describe('obligations', () => {
  it('merges field lists across sources and never shrinks them', async () => {
    repo.direct = [
      { id: 1, effect: 'ALLOW', conditions: null, obligations: { maskedFields: ['bank_account_no'] } },
    ];
    repo.roles = [{ roleId: 1, roleCode: 'hr_manager', scopeType: 'GLOBAL', scopeId: null, inherited: false }];
    repo.rolePerms.set('1:hr.employee.read', [
      { id: 2, effect: 'ALLOW', conditions: null, obligations: { maskedFields: ['pan_card_no'], requireMfa: true } },
    ]);

    const decision = await engine.decide({ subject: employee, action: 'hr.employee.read' });

    expect(decision.obligations.maskedFields).toEqual(
      expect.arrayContaining(['bank_account_no', 'pan_card_no']),
    );
    expect(decision.obligations.requireMfa).toBe(true);
  });

  it('takes the tighter numeric limit', async () => {
    repo.direct = [
      { id: 1, effect: 'ALLOW', conditions: null, obligations: { maxRecords: 500 } },
      { id: 2, effect: 'ALLOW', conditions: null, obligations: { maxRecords: 50 } },
    ];

    const decision = await engine.decide({ subject: employee, action: 'payroll.report.export' });
    expect(decision.obligations.maxRecords).toBe(50);
  });
});

describe('temporary access', () => {
  it('allows through a delegation and forces an audit', async () => {
    repo.temporary = [
      { id: 3, type: 'DELEGATION', permissionCodes: ['hr.appointment.approve'], scopeType: 'GLOBAL', scopeId: null },
    ];

    const decision = await engine.decide({ subject: employee, action: 'hr.appointment.approve' });

    expect(decision.allowed).toBe(true);
    expect(decision.obligations.auditRequired).toBe(true);
    expect(decision.sources[0]?.type).toBe('DELEGATION');
  });

  it('matches a wildcard grant but not an unrelated code', async () => {
    repo.temporary = [
      { id: 4, type: 'EMERGENCY_ACCESS', permissionCodes: ['hr.*'], scopeType: 'GLOBAL', scopeId: null },
    ];

    expect((await engine.decide({ subject: employee, action: 'hr.employee.delete' })).allowed).toBe(true);
    expect((await engine.decide({ subject: employee, action: 'payroll.payslip.read' })).allowed).toBe(false);
  });
});

describe('policies', () => {
  it('matches an action wildcard', async () => {
    repo.policyRows = [
      {
        id: 1,
        code: 'hr-read-all',
        effect: 'ALLOW',
        subjects: null,
        actions: ['hr.*'],
        resources: ['*'],
        scopeType: 'GLOBAL',
        scopeId: null,
        conditions: null,
        obligations: null,
        priority: 10,
      },
    ];

    expect((await engine.decide({ subject: employee, action: 'hr.employee.read' })).allowed).toBe(true);
  });

  it('respects a subject filter by role code', async () => {
    repo.roles = [{ roleId: 1, roleCode: 'hr_manager', scopeType: 'GLOBAL', scopeId: null, inherited: false }];
    repo.policyRows = [
      {
        id: 1,
        code: 'hr-only',
        effect: 'ALLOW',
        subjects: { roleCodes: ['payroll_manager'] },
        actions: ['*'],
        resources: ['*'],
        scopeType: 'GLOBAL',
        scopeId: null,
        conditions: null,
        obligations: null,
        priority: 10,
      },
    ];

    expect((await engine.decide({ subject: employee, action: 'hr.employee.read' })).allowed).toBe(false);

    repo.policyRows[0]!.subjects = { roleCodes: ['hr_manager'] };
    expect((await engine.decide({ subject: employee, action: 'hr.employee.read' })).allowed).toBe(true);
  });
});

describe('audit', () => {
  it('writes one decision row per call', async () => {
    await engine.decide({ subject: employee, action: 'hr.employee.read' });
    expect(repo.written).toHaveLength(1);
    expect(repo.written[0]?.decision).toBe('DENY');
    expect(repo.written[0]?.action).toBe('hr.employee.read');
  });

  it('does not write when the simulator asks it not to', async () => {
    await engine.decide({ subject: employee, action: 'hr.employee.read', context: { audit: false } });
    expect(repo.written).toHaveLength(0);
  });

  it('returns a decision even if the audit write throws', async () => {
    repo.writeDecision = async () => {
      throw new Error('audit table unavailable');
    };
    repo.direct = [allow()];

    const decision = await engine.decide({ subject: employee, action: 'hr.employee.read' });
    expect(decision.allowed).toBe(true);
  });

  it('carries a unique decision id', async () => {
    const a = await engine.decide({ subject: employee, action: 'hr.employee.read' });
    const b = await engine.decide({ subject: employee, action: 'hr.employee.read' });

    expect(a.decisionId).not.toBe(b.decisionId);
    expect(a.decisionId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
