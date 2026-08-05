<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Support\NavigationRegistry;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class NavigationRegistryPilotTest extends TestCase
{
    use RefreshDatabase;

    private function seedRbac(): void
    {
        parent::seed(RbacSeeder::class);
    }

    public function test_tds_calculation_does_not_use_payslip_permission(): void
    {
        $located = NavigationRegistry::locate('payroll.payslip.read');

        $this->assertNull($located, 'payroll.payslip.read must not be mapped to any TDS page.');

        $tree = collect(NavigationRegistry::tree())->firstWhere('navigationModuleKey', 'tds');
        $calc = collect($tree['resources'])->firstWhere('resourceKey', 'tds_calculation');

        $codes = array_column($calc['actions'], 'permissionKey');

        $this->assertNotContains('payroll.payslip.read', $codes);
        $this->assertSame(['ui.admin.tds.view'], $codes);
    }

    public function test_form16_does_not_use_payslip_permission(): void
    {
        $tree = collect(NavigationRegistry::tree())->firstWhere('navigationModuleKey', 'tds');
        $form16 = collect($tree['resources'])->firstWhere('resourceKey', 'form16');

        $codes = array_column($form16['actions'], 'permissionKey');

        $this->assertNotContains('payroll.payslip.read', $codes);
        $this->assertSame(['ui.admin.form16.view', 'payroll.form16.read'], $codes);
    }

    public function test_tds_calculation_permission_does_not_grant_form16(): void
    {
        $calc = NavigationRegistry::locate('ui.admin.tds.view');
        $form16 = NavigationRegistry::locate('ui.admin.form16.view');

        $this->assertSame('tds_calculation', $calc['resourceKey']);
        $this->assertSame('form16', $form16['resourceKey']);
        $this->assertNotSame($calc['permissionKey'], $form16['permissionKey']);
    }

    public function test_tds_permissions_are_seeded_and_distinct_from_payslip(): void
    {
        $this->seedRbac();

        $this->assertNotNull(Permission::where('code', 'ui.admin.tds.view')->first());
        $this->assertNotNull(Permission::where('code', 'ui.admin.form16.view')->first());

        $payslip = Permission::where('code', 'payroll.payslip.read')->first();
        $tds = Permission::where('code', 'ui.admin.tds.view')->first();

        $this->assertNotSame($payslip->id, $tds->id);
    }

    public function test_every_registry_permission_exists_in_the_database(): void
    {
        $this->seedRbac();

        $this->assertSame([], NavigationRegistry::unknownPermissionCodes());
    }

    public function test_attendance_navigation_module_exists(): void
    {
        $module = collect(NavigationRegistry::tree())->firstWhere('navigationModuleKey', 'attendance');

        $this->assertNotNull($module);
        $this->assertSame('Attendance', $module['navigationModuleLabel']);
    }

    public function test_attendance_contains_view_attendance_and_shift_in_order(): void
    {
        $module = collect(NavigationRegistry::tree())->firstWhere('navigationModuleKey', 'attendance');

        $keys = array_column($module['resources'], 'resourceKey');
        $labels = array_column($module['resources'], 'resourceLabel');

        $this->assertSame(['view_attendance', 'shift'], $keys);
        $this->assertSame(['View Attendance', 'Shift'], $labels);
    }

    public function test_technical_resource_codes_map_to_navigation_resources(): void
    {
        $module = collect(NavigationRegistry::tree())->firstWhere('navigationModuleKey', 'attendance');

        $byKey = collect($module['resources'])->keyBy('resourceKey');

        $this->assertSame('hr.attendance', $byKey['view_attendance']['technicalResourceCode']);
        $this->assertSame('hr.shift', $byKey['shift']['technicalResourceCode']);
    }

    public function test_resource_ordering_is_deterministic(): void
    {
        $first = array_column(collect(NavigationRegistry::tree())->firstWhere('navigationModuleKey', 'attendance')['resources'], 'resourceKey');

        for ($i = 0; $i < 5; $i++) {
            $again = array_column(collect(NavigationRegistry::tree())->firstWhere('navigationModuleKey', 'attendance')['resources'], 'resourceKey');
            $this->assertSame($first, $again);
        }
    }

    public function test_attendance_has_no_duplicate_action_labels(): void
    {
        $this->assertSame([], NavigationRegistry::duplicateLabelsWithin('attendance'));
    }

    public function test_view_attendance_exposes_only_enforced_actions(): void
    {
        $module = collect(NavigationRegistry::tree())->firstWhere('navigationModuleKey', 'attendance');
        $resource = collect($module['resources'])->firstWhere('resourceKey', 'view_attendance');

        $this->assertSame(
            ['ui.admin.attendance.view', 'hr.attendance.read', 'hr.attendance.update', 'hr.attendance.import'],
            array_column($resource['actions'], 'permissionKey')
        );
    }

    public function test_view_attendance_does_not_expose_unsupported_actions(): void
    {
        $module = collect(NavigationRegistry::tree())->firstWhere('navigationModuleKey', 'attendance');
        $resource = collect($module['resources'])->firstWhere('resourceKey', 'view_attendance');

        $actionKeys = array_column($resource['actions'], 'actionKey');

        foreach (['create', 'delete', 'export', 'print'] as $unsupported) {
            $this->assertNotContains($unsupported, $actionKeys);
        }
    }

    public function test_shift_exposes_only_enforced_actions(): void
    {
        $module = collect(NavigationRegistry::tree())->firstWhere('navigationModuleKey', 'attendance');
        $resource = collect($module['resources'])->firstWhere('resourceKey', 'shift');

        $this->assertSame(
            ['hr.shift.read', 'hr.shift.create', 'hr.shift.update', 'hr.shift.delete', 'hr.shift.assign'],
            array_column($resource['actions'], 'permissionKey')
        );
    }

    public function test_shift_does_not_expose_export(): void
    {
        $module = collect(NavigationRegistry::tree())->firstWhere('navigationModuleKey', 'attendance');
        $resource = collect($module['resources'])->firstWhere('resourceKey', 'shift');

        $this->assertNotContains('export', array_column($resource['actions'], 'actionKey'));
    }

    public function test_unknown_permission_key_is_not_applicable(): void
    {
        $this->assertFalse(NavigationRegistry::isApplicable('hr.attendance.delete'));
        $this->assertFalse(NavigationRegistry::isApplicable('totally.made.up'));
        $this->assertTrue(NavigationRegistry::isApplicable('hr.shift.assign'));
    }

    public function test_audit_label_uses_navigation_friendly_names(): void
    {
        $this->assertSame('Attendance → Shift → Update', NavigationRegistry::auditLabel('hr.shift.update'));
        $this->assertSame('Attendance → View Attendance → List', NavigationRegistry::auditLabel('hr.attendance.read'));
    }

    public function test_registry_permissions_match_enforced_route_middleware(): void
    {
        $routeFile = file_get_contents(base_path('routes/api.php'));

        foreach (['hr.attendance.read', 'hr.attendance.update', 'hr.attendance.import',
            'hr.shift.read', 'hr.shift.create', 'hr.shift.update', 'hr.shift.delete', 'hr.shift.assign'] as $code) {
            $this->assertStringContainsString(
                'permission:' . $code,
                $routeFile,
                "Registry exposes {$code} but no route enforces it."
            );
        }
    }

    public function test_seeder_reruns_do_not_duplicate_tds_permissions(): void
    {
        $this->seedRbac();
        $this->seedRbac();

        $this->assertSame(1, DB::table('permissions')->where('code', 'ui.admin.tds.view')->count());
        $this->assertSame(1, DB::table('permissions')->where('code', 'ui.admin.form16.view')->count());
    }

    public function test_form16_data_endpoint_is_guarded_by_its_own_permission(): void
    {
        $routeFile = file_get_contents(base_path('routes/api.php'));

        $this->assertStringContainsString('permission:payroll.form16.read', $routeFile);
        $this->assertMatchesRegularExpression(
            "/admin\/form16.*\n.*permission:payroll\.form16\.read/",
            $routeFile
        );
    }

    public function test_form16_endpoint_rejects_a_payslip_only_employee(): void
    {
        $this->seedRbac();

        $user = \App\Models\User::create([
            'name' => 'Payslip Employee', 'email' => 'form16-denied@test.local',
            'password' => 'x', 'role' => 3, 'company_code' => 'nidhi-impex',
            'status' => 0, 'is_deleted' => 0,
        ]);

        $response = $this->withToken(auth('api')->login($user))
            ->getJson('/api/admin/form16/employees');

        $this->assertContains($response->status(), [401, 403]);
    }

    public function test_legacy_shadow_mode_still_admits_any_admin_to_every_permission(): void
    {
        $this->seedRbac();

        $user = \App\Models\User::create([
            'name' => 'Plain Admin', 'email' => 'form16-shadow@test.local',
            'password' => 'x', 'role' => 1, 'company_code' => 'nidhi-impex',
            'status' => 0, 'is_deleted' => 0,
        ]);

        $response = $this->withToken(auth('api')->login($user))
            ->getJson('/api/admin/form16/employees');

        $this->assertSame(
            200,
            $response->status(),
            'Pins the pre-existing system-wide shadow-mode fallback: AuthorizationEngine::legacyDecision '
            . 'returns admin => true for every permission, so permission: middleware does not yet deny '
            . 'admin-tier callers. When shadow mode is disabled this assertion must be flipped to 403.'
        );
    }

    public function test_payslip_endpoint_remains_separately_guarded(): void
    {
        $routeFile = file_get_contents(base_path('routes/api.php'));

        $this->assertStringContainsString(
            "Route::get('get', [SalariesSlipController::class, 'index'])->middleware('permission:payroll.payslip.read')",
            $routeFile,
            'Payslip authorization must not be weakened by the Form 16 split.'
        );
    }

    public function test_form16_and_payslip_permissions_are_distinct_rows(): void
    {
        $this->seedRbac();

        $form16 = Permission::where('code', 'payroll.form16.read')->first();
        $payslip = Permission::where('code', 'payroll.payslip.read')->first();

        $this->assertNotNull($form16);
        $this->assertNotNull($payslip);
        $this->assertNotSame($form16->id, $payslip->id);
    }

    public function test_form16_grants_match_historical_payslip_holders(): void
    {
        $this->seedRbac();

        $form16 = Permission::where('code', 'payroll.form16.read')->first();
        $payslip = Permission::where('code', 'payroll.payslip.read')->first();

        $payslipRoles = DB::table('role_permissions')
            ->where('permission_id', $payslip->id)->where('effect', 'ALLOW')
            ->pluck('role_id')->sort()->values()->all();

        $form16Roles = DB::table('role_permissions')
            ->where('permission_id', $form16->id)->where('effect', 'ALLOW')
            ->pluck('role_id')->sort()->values()->all();

        $expanded = array_diff($form16Roles, $payslipRoles);

        $this->assertSame([], array_values($expanded), 'Form 16 access must not expand beyond historical payslip holders.');
    }

    public function test_tds_calculation_remains_page_access_only(): void
    {
        $module = collect(NavigationRegistry::tree())->firstWhere('navigationModuleKey', 'tds');
        $calc = collect($module['resources'])->firstWhere('resourceKey', 'tds_calculation');

        $this->assertSame(['access_page'], array_column($calc['actions'], 'actionKey'));
    }

    public function test_form16_exposes_page_access_and_list_only(): void
    {
        $module = collect(NavigationRegistry::tree())->firstWhere('navigationModuleKey', 'tds');
        $form16 = collect($module['resources'])->firstWhere('resourceKey', 'form16');

        $this->assertSame(['access_page', 'list'], array_column($form16['actions'], 'actionKey'));
        $this->assertSame(
            ['ui.admin.form16.view', 'payroll.form16.read'],
            array_column($form16['actions'], 'permissionKey')
        );
    }

    public function test_existing_attendance_assignments_are_preserved_by_seeding(): void
    {
        $this->seedRbac();

        $shiftRead = Permission::where('code', 'hr.shift.read')->first();
        $before = DB::table('role_permissions')->where('permission_id', $shiftRead->id)->count();

        $this->seedRbac();

        $after = DB::table('role_permissions')->where('permission_id', $shiftRead->id)->count();

        $this->assertSame($before, $after);
        $this->assertGreaterThan(0, $after);
    }
}
