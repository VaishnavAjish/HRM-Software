<?php

namespace Tests\Unit;

use App\Services\Authorization\Matrix\PermissionMigrationReport;
use App\Support\PermissionOwnership;
use App\Support\PermissionRegistry;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

/**
 * The migration report's classification rules.
 *
 * `analyseRole` and `reconcile` are the whole judgement of this report: given
 * what a role holds today, is each decision accounted for canonically? They are
 * pure functions of a grant map, so they are exercised directly here — no
 * database, no fixtures that could drift from the real registry.
 *
 * The cases that matter most are the two that previously produced wrong answers:
 * protected-role rows inflating "active use", and other-owner DENY rows silently
 * disappearing.
 */
class PermissionMigrationReportTest extends TestCase
{
    private PermissionMigrationReport $report;

    protected function setUp(): void
    {
        parent::setUp();
        $this->report = new PermissionMigrationReport();
    }

    /** @return array<string,mixed> */
    private function analyse(array $held): array
    {
        $method = new ReflectionMethod($this->report, 'analyseRole');

        return $method->invoke($this->report, $held);
    }

    private function reconcile(string $legacyState, array $heldTargets, array $held): string
    {
        $method = new ReflectionMethod($this->report, 'reconcile');

        return $method->invoke($this->report, $legacyState, $heldTargets, $held);
    }

    /** A legacy code the registry really maps, with its canonical targets. */
    private function mappedLegacyCode(): array
    {
        foreach (PermissionRegistry::impliedPermissionCodes() as $code) {
            if (PermissionOwnership::ownerOf($code) !== PermissionOwnership::LEGACY) {
                continue;
            }

            $targets = PermissionRegistry::nodesImplying($code);

            if (count($targets) === 1) {
                return [$code, $targets[0]];
            }
        }

        $this->fail('No singly-mapped legacy code found in the registry.');
    }

    /* ---- mapping outcomes ------------------------------------------------ */

    public function test_a_legacy_allow_with_a_matching_canonical_allow_is_migrated(): void
    {
        [$legacy, $canonical] = $this->mappedLegacyCode();

        $result = $this->analyse([$legacy => 'ALLOW', $canonical => 'ALLOW']);

        $this->assertCount(1, $result['migrated']);
        $this->assertSame([], $result['pending']);
        $this->assertSame([], $result['mismatch']);
    }

    public function test_a_legacy_allow_with_no_canonical_decision_is_pending(): void
    {
        [$legacy] = $this->mappedLegacyCode();

        $result = $this->analyse([$legacy => 'ALLOW']);

        $this->assertCount(1, $result['pending']);
        $this->assertCount(0, $result['migrated']);
    }

    public function test_a_legacy_allow_answered_by_a_canonical_deny_is_a_mismatch(): void
    {
        // A canonical row existing is not migration. This would silently change
        // behaviour at cutover.
        [$legacy, $canonical] = $this->mappedLegacyCode();

        $result = $this->analyse([$legacy => 'ALLOW', $canonical => 'DENY']);

        $this->assertCount(1, $result['mismatch']);
        $this->assertCount(0, $result['migrated']);
    }

    public function test_a_legacy_deny_answered_by_a_canonical_allow_is_a_mismatch(): void
    {
        // Worse than the reverse: a canonical grant projects onto the very code
        // the legacy row denies, so cutover would re-grant refused access.
        [$legacy, $canonical] = $this->mappedLegacyCode();

        $result = $this->analyse([$legacy => 'DENY', $canonical => 'ALLOW']);

        $this->assertCount(1, $result['mismatch']);
    }

    public function test_a_legacy_deny_answered_by_a_canonical_deny_is_migrated(): void
    {
        [$legacy, $canonical] = $this->mappedLegacyCode();

        $result = $this->analyse([$legacy => 'DENY', $canonical => 'DENY']);

        $this->assertCount(1, $result['migrated']);
    }

    public function test_a_legacy_code_with_no_canonical_target_is_unmapped(): void
    {
        $result = $this->analyse(['admin.permission.read' => 'ALLOW']);

        $this->assertCount(1, $result['unmapped']);
        $this->assertSame('admin.permission.read', $result['unmapped'][0]['legacyCode']);
    }

    public function test_a_conditional_legacy_decision_is_unsupported_not_migrated(): void
    {
        [$legacy, $canonical] = $this->mappedLegacyCode();

        $result = $this->analyse([$legacy => 'CONDITIONAL', $canonical => 'ALLOW']);

        $this->assertCount(1, $result['unsupported']);
        $this->assertCount(0, $result['migrated']);
    }

    /* ---- reconciliation --------------------------------------------------- */

    public function test_reconcile_requires_at_least_one_allow_for_a_legacy_allow(): void
    {
        $this->assertSame(
            PermissionMigrationReport::MIGRATED,
            $this->reconcile('ALLOW', ['a', 'b'], ['a' => 'DENY', 'b' => 'ALLOW']),
        );
    }

    public function test_reconcile_requires_every_target_denied_for_a_legacy_deny(): void
    {
        // One canonical ALLOW is enough to re-grant the denied business code.
        $this->assertSame(
            PermissionMigrationReport::MISMATCH,
            $this->reconcile('DENY', ['a', 'b'], ['a' => 'DENY', 'b' => 'ALLOW']),
        );

        $this->assertSame(
            PermissionMigrationReport::MIGRATED,
            $this->reconcile('DENY', ['a', 'b'], ['a' => 'DENY', 'b' => 'DENY']),
        );
    }

    /* ---- owner separation, the previous reporting bugs -------------------- */

    public function test_an_other_owner_deny_stays_visible_and_is_not_a_migration_defect(): void
    {
        // EMP and ACC really carry this row. An earlier report skipped non-core
        // owners entirely, so it vanished from the output.
        $result = $this->analyse(['self.profile.read' => 'DENY']);

        $this->assertCount(1, $result['otherOwners']);
        $this->assertSame('DENY', $result['otherOwners'][0]['state']);
        $this->assertSame(PermissionOwnership::EMPLOYEE_PORTAL, $result['otherOwners'][0]['owner']);

        $this->assertSame(0, $result['legacyCount']);
        $this->assertSame([], $result['unmapped']);
        $this->assertSame([], $result['mismatch']);
    }

    public function test_an_unknown_owner_grant_is_reported_separately(): void
    {
        $result = $this->analyse(['vendor.future.feature.read' => 'ALLOW']);

        $this->assertCount(1, $result['unknownOwners']);
        $this->assertSame([], $result['unmapped']);
    }

    public function test_a_core_owned_decision_counts_as_canonical_not_legacy(): void
    {
        $canonical = PermissionRegistry::permissionCodes()[0];

        $result = $this->analyse([$canonical => 'ALLOW']);

        $this->assertSame(1, $result['canonicalCount']);
        $this->assertSame(0, $result['legacyCount']);
    }

    public function test_every_held_decision_lands_in_exactly_one_bucket(): void
    {
        // Nothing a role holds may quietly vanish from the report.
        [$legacy, $canonical] = $this->mappedLegacyCode();

        $held = [
            $legacy => 'ALLOW',
            $canonical => 'ALLOW',
            'self.profile.read' => 'DENY',
            'vendor.future.feature.read' => 'ALLOW',
            'admin.permission.read' => 'ALLOW',
        ];

        $result = $this->analyse($held);

        $bucketed = $result['canonicalCount']
            + count($result['migrated']) + count($result['pending']) + count($result['unmapped'])
            + count($result['ambiguous']) + count($result['mismatch']) + count($result['unsupported'])
            + count($result['otherOwners']) + count($result['unknownOwners']);

        $this->assertSame(count($held), $bucketed);
    }
}
