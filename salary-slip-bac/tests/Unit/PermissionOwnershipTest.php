<?php

namespace Tests\Unit;

use App\Support\PermissionOwnership;
use App\Support\PermissionRegistry;
use PHPUnit\Framework\TestCase;

/**
 * Regression guard for the sync that crossed an ownership boundary.
 *
 * An earlier synchroniser decided ownership from the `ui.` prefix, concluded
 * `ui.agent.dashboard.view` and `ui.employee.dashboard.view` were core codes
 * that had been dropped, and deactivated them — denying the agent and employee
 * portals to everyone holding them. These tests exist so that inference cannot
 * come back.
 *
 * Pure: ownership resolves from the in-code registry and an explicit prefix map,
 * so none of this needs a database.
 */
class PermissionOwnershipTest extends TestCase
{
    /* ---- ownership resolution ------------------------------------------- */

    public function test_a_registry_member_is_core_owned(): void
    {
        $code = PermissionRegistry::permissionCodes()[0];

        $this->assertSame(PermissionOwnership::HRMS_CORE, PermissionOwnership::ownerOf($code));
        $this->assertTrue(PermissionOwnership::isCoreOwned($code));
    }

    public function test_the_agent_portal_prefix_is_agent_owned(): void
    {
        $this->assertSame(PermissionOwnership::AGENT_PORTAL, PermissionOwnership::ownerOf('ui.agent.dashboard.view'));
    }

    public function test_the_employee_portal_prefixes_are_employee_owned(): void
    {
        $this->assertSame(PermissionOwnership::EMPLOYEE_PORTAL, PermissionOwnership::ownerOf('ui.employee.dashboard.view'));
        $this->assertSame(PermissionOwnership::EMPLOYEE_PORTAL, PermissionOwnership::ownerOf('self.profile.read'));
    }

    public function test_business_namespaces_are_legacy_owned(): void
    {
        foreach (['hr.employee.read', 'payroll.payslip.read', 'admin.role.update', 'ui.admin.reports.view'] as $code) {
            $this->assertSame(PermissionOwnership::LEGACY, PermissionOwnership::ownerOf($code), $code);
        }
    }

    public function test_an_unrecognised_code_is_unknown(): void
    {
        $this->assertSame(PermissionOwnership::UNKNOWN, PermissionOwnership::ownerOf('vendor.future.feature.read'));
    }

    /* ---- precedence ------------------------------------------------------ */

    public function test_registry_membership_beats_a_broad_external_prefix(): void
    {
        // `ui.` is mapped to LEGACY, so without registry precedence every
        // canonical code would be misclassified by its own namespace.
        $code = 'ui.employees.master';

        $this->assertTrue(PermissionRegistry::has($code));
        $this->assertSame(PermissionOwnership::LEGACY, PermissionOwnership::ownerOf('ui.admin.reports.view'));
        $this->assertSame(PermissionOwnership::HRMS_CORE, PermissionOwnership::ownerOf($code));
    }

    public function test_the_longest_matching_prefix_wins(): void
    {
        // `ui.` (LEGACY) and `ui.agent.` (AGENT_PORTAL) both match; the longer,
        // more specific namespace must decide, whatever the map's order.
        $this->assertSame(PermissionOwnership::AGENT_PORTAL, PermissionOwnership::ownerOf('ui.agent.anything.at.all'));
        $this->assertSame(PermissionOwnership::EMPLOYEE_PORTAL, PermissionOwnership::ownerOf('ui.employee.anything'));
        $this->assertSame(PermissionOwnership::LEGACY, PermissionOwnership::ownerOf('ui.somethingelse.view'));
    }

    public function test_prefixes_are_offered_longest_first(): void
    {
        $lengths = array_map('strlen', array_keys(PermissionOwnership::externalPrefixes()));

        $sorted = $lengths;
        rsort($sorted);

        $this->assertSame($sorted, $lengths);
    }

    /* ---- the write boundary ---------------------------------------------- */

    public function test_only_core_owned_codes_are_syncable(): void
    {
        foreach ([
            'ui.agent.dashboard.view',
            'ui.employee.dashboard.view',
            'ui.admin.reports.view',
            'self.profile.read',
            'hr.employee.read',
            'vendor.future.feature.read',
        ] as $code) {
            $this->assertFalse(PermissionOwnership::canCoreSync($code), "{$code} must not be writable by core sync");
        }
    }

    public function test_every_registry_code_is_syncable_by_its_own_registry(): void
    {
        foreach (PermissionRegistry::permissionCodes() as $code) {
            $this->assertTrue(
                PermissionOwnership::canCoreSync($code),
                "Registry code {$code} is not writable by its own registry",
            );
        }
    }

    public function test_ownership_fails_closed_on_an_unmatched_code(): void
    {
        // Uncertainty must resolve to preserve, never to "core may write it".
        $this->assertSame(PermissionOwnership::UNKNOWN, PermissionOwnership::ownerOf('totally.unmapped'));
        $this->assertFalse(PermissionOwnership::canCoreSync('totally.unmapped'));
    }

    /* ---- reporting -------------------------------------------------------- */

    public function test_classification_covers_every_supplied_code(): void
    {
        $classified = PermissionOwnership::classify(['hr.employee.read', 'ui.agent.dashboard.view', 'nope.nope']);

        $this->assertCount(3, $classified);
        $this->assertSame(PermissionOwnership::UNKNOWN, $classified['nope.nope']);
    }

    public function test_counts_report_every_owner_bucket(): void
    {
        $counts = PermissionOwnership::counts(['hr.employee.read', 'ui.agent.dashboard.view', 'nope.nope']);

        foreach (PermissionOwnership::OWNERS as $owner) {
            $this->assertArrayHasKey($owner, $counts);
        }

        $this->assertSame(1, $counts[PermissionOwnership::LEGACY]);
        $this->assertSame(1, $counts[PermissionOwnership::AGENT_PORTAL]);
        $this->assertSame(1, $counts[PermissionOwnership::UNKNOWN]);
    }

    public function test_no_external_prefix_claims_a_canonical_registry_code(): void
    {
        // If this ever fails, core sync would be aimed at a permission another
        // surface owns — the exact failure that broke the portals.
        foreach (PermissionRegistry::permissionCodes() as $code) {
            $this->assertSame(
                PermissionOwnership::HRMS_CORE,
                PermissionOwnership::ownerOf($code),
                "{$code} resolves away from core ownership",
            );
        }
    }
}
