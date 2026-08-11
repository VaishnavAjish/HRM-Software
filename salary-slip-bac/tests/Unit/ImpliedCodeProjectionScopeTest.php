<?php

namespace Tests\Unit;

use App\Support\PermissionRegistry;
use PHPUnit\Framework\TestCase;

/**
 * The set of business codes a matrix save has to reconcile.
 *
 * RoleMatrixWriter projects canonical grants onto the business codes the route
 * middleware enforces. It used to reconcile only the codes implied by the edited
 * rows, which silently lost grants: setting a child while its module was
 * unassigned resolved to DENY so nothing projected, and granting the module
 * afterwards carried only the module's own implied codes. The child's business
 * code was then never written, leaving a page the matrix reported as ALLOW whose
 * API answered 403.
 *
 * Editing a node has to reconcile that node's whole subtree, because that is
 * exactly the set whose effective state the edit can move. These assertions pin
 * the reachability the writer depends on; if a registry edit detaches one of
 * these codes from its module, the projection silently narrows again.
 */
class ImpliedCodeProjectionScopeTest extends TestCase
{
    /** @return array<string,true> */
    private function reconciledBy(string $editedKey): array
    {
        $keys = array_merge(
            [$editedKey],
            PermissionRegistry::assignableDescendantsOf($editedKey),
        );

        $codes = [];

        foreach ($keys as $key) {
            foreach (PermissionRegistry::impliedCodes($key) as $code) {
                $codes[$code] = true;
            }
        }

        return $codes;
    }

    public function test_editing_a_module_reconciles_its_pages_business_codes(): void
    {
        $codes = $this->reconciledBy('ui.attendance');

        $this->assertArrayHasKey('hr.attendance.read', $codes);
    }

    public function test_editing_a_module_reconciles_its_action_business_codes(): void
    {
        $codes = $this->reconciledBy('ui.salary');

        $this->assertArrayHasKey('payroll.payslip.read', $codes);
        $this->assertArrayHasKey('payroll.report.print', $codes);
        $this->assertArrayHasKey('payroll.payslip.delete', $codes);
    }

    public function test_editing_a_page_reconciles_its_own_actions(): void
    {
        $codes = $this->reconciledBy('ui.salary.batch');

        $this->assertArrayHasKey('payroll.payslip.read', $codes);
        $this->assertArrayHasKey('payroll.report.export', $codes);
    }

    /**
     * The subtree is the boundary. Reconciling the whole registry would strip
     * business grants configured outside the matrix, so an unrelated module's
     * codes must stay out of scope.
     */
    public function test_editing_a_module_leaves_an_unrelated_module_alone(): void
    {
        $codes = $this->reconciledBy('ui.attendance');

        $this->assertArrayNotHasKey('payroll.payslip.read', $codes);
        $this->assertArrayNotHasKey('payroll.report.print', $codes);
    }

    public function test_every_action_business_code_is_reachable_from_its_module(): void
    {
        foreach (PermissionRegistry::all() as $key => $node) {
            if (($node['type'] ?? null) !== 'action') {
                continue;
            }

            $module = explode('.', $key)[1] ?? null;

            if ($module === null || ! PermissionRegistry::has("ui.{$module}")) {
                continue;
            }

            $codes = $this->reconciledBy("ui.{$module}");

            foreach (PermissionRegistry::impliedCodes($key) as $implied) {
                $this->assertArrayHasKey(
                    $implied,
                    $codes,
                    "{$key} implies {$implied}, which a save of ui.{$module} would not reconcile",
                );
            }
        }
    }
}
