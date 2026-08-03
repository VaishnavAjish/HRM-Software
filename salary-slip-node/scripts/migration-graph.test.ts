import { describe, it, expect } from 'vitest';

import { dependenciesOf, dependentsOf } from './authz-migrate.js';

/**
 * Dependency enforcement for the authorization migrations.
 *
 * These exist because of a specific production failure. On 2026-08-03,
 * `down 0001 --confirm` ran while 0003 and 0004 were applied on top of it. The
 * rollback dropped their objects and left their ledger rows, so the runner then
 * believed work was done that no longer existed — and a later `up` would have
 * rebuilt the schema with those two silently skipped.
 *
 * The graph below is what makes that refusable. Every case here is a statement
 * about which rollbacks must fail.
 */

const IDS = ['0001', '0002', '0003', '0004'];

describe('dependency graph', () => {
  it('treats the chain as linear by default', () => {
    // 0002 declares 0001; anything undeclared falls back to its predecessor.
    expect(dependenciesOf('0002', IDS)).toEqual(['0001']);
  });

  it('gives the first migration no dependencies', () => {
    expect(dependenciesOf('0001', IDS)).toEqual([]);
  });

  it('reads an explicit dependency over the positional default', () => {
    // 0003 sits after 0002 but is declared against 0001 — it repairs the
    // schema 0001 built, and does not need 0002's row updates.
    expect(dependenciesOf('0003', IDS)).toEqual(['0001']);
    expect(dependenciesOf('0004', IDS)).toEqual(['0003']);
  });

  it('resolves dependents transitively', () => {
    // The case that mattered: 0004 depends on 0003 depends on 0001, so a
    // rollback of 0001 has to see BOTH as blocking, not just the direct child.
    expect(dependentsOf('0001', IDS)).toEqual(['0002', '0003', '0004']);
  });

  it('reports nothing blocking the last migration', () => {
    expect(dependentsOf('0004', IDS)).toEqual([]);
  });

  it('does not treat a sibling as a dependent', () => {
    // 0002 and 0003 both hang off 0001. Rolling back 0002 must not be blocked
    // by 0003, which was never built on it.
    expect(dependentsOf('0002', IDS)).toEqual([]);
  });

  it('would have refused the rollback that caused the incident', () => {
    const applied = new Set(['0001', '0002', '0003', '0004']);
    const blocking = dependentsOf('0001', IDS).filter((id) => applied.has(id));

    expect(blocking).toEqual(['0002', '0003', '0004']);
    expect(blocking.length).toBeGreaterThan(0); // -> `down 0001` exits non-zero
  });

  it('permits the rollback once the dependents are already down', () => {
    const applied = new Set(['0001']);
    expect(dependentsOf('0001', IDS).filter((id) => applied.has(id))).toEqual([]);
  });

  it('has no cycles', () => {
    // A cycle would make dependentsOf loop forever, so this is a guard on the
    // manifest as much as on the algorithm.
    for (const id of IDS) expect(dependentsOf(id, IDS)).not.toContain(id);
  });
});
