<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Authorization\PermissionEnforcementPolicy;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StagedEnforcementTest extends TestCase
{
    use RefreshDatabase;

    private function policy(): PermissionEnforcementPolicy
    {
        return app(PermissionEnforcementPolicy::class);
    }

    private function admin(string $email): User
    {
        return User::create([
            'name' => 'Staged Admin', 'email' => $email,
            'password' => 'x', 'role' => 1, 'company_code' => 'nidhi-impex',
            'status' => 0, 'is_deleted' => 0,
        ]);
    }

    public function test_default_mode_is_shadow(): void
    {
        $this->assertSame('shadow', config('authorization.enforcement.default_mode'));
        $this->assertSame(
            PermissionEnforcementPolicy::SHADOW,
            $this->policy()->modeFor('hr.employee.read')
        );
    }

    public function test_an_allowlisted_permission_is_enforced(): void
    {
        config(['authorization.enforcement.enforced_permissions' => ['hr.shift.delete']]);

        $this->assertSame(PermissionEnforcementPolicy::ENFORCED, $this->policy()->modeFor('hr.shift.delete'));
        $this->assertSame(PermissionEnforcementPolicy::SHADOW, $this->policy()->modeFor('hr.shift.read'));
    }

    public function test_prefix_rollout_is_supported(): void
    {
        config(['authorization.enforcement.enforced_prefixes' => ['hr.shift.']]);

        $this->assertTrue($this->policy()->isEnforced('hr.shift.assign'));
        $this->assertFalse($this->policy()->isEnforced('hr.attendance.read'));
    }

    public function test_security_administration_is_always_enforced(): void
    {
        config([
            'authorization.enforcement.enforced_permissions' => [],
            'authorization.enforcement.enforced_prefixes' => [],
        ]);

        $this->assertTrue($this->policy()->isEnforced('admin.authorization.manage'));
        $this->assertTrue($this->policy()->isEnforced('admin.policy.update'));
    }

    public function test_an_empty_prefix_never_enforces_everything(): void
    {
        config(['authorization.enforcement.enforced_prefixes' => ['']]);

        $this->assertFalse($this->policy()->isEnforced('hr.attendance.read'));
    }

    /**
     * The shipped config defaults (no AUTHZ_* env set, as in this test run) must
     * fail safe: shadow mode and an empty enforced set, so no business namespace
     * is enforced by accident of a missing or blank env line.
     */
    public function test_shipped_defaults_enforce_no_business_namespace(): void
    {
        $this->assertSame('shadow', config('authorization.enforcement.default_mode'));
        $this->assertSame([], config('authorization.enforcement.enforced_prefixes'));
        $this->assertSame([], config('authorization.enforcement.enforced_permissions'));

        foreach (['hr.', 'payroll.', 'recruitment.', 'document.', 'workflow.', 'self.', 'ui.'] as $prefix) {
            $this->assertSame(
                PermissionEnforcementPolicy::SHADOW,
                $this->policy()->modeFor($prefix . 'anything.read'),
                "Default config must not enforce the {$prefix} namespace.",
            );
        }

        // The two security-administration namespaces are the deliberate exception.
        $this->assertTrue($this->policy()->isEnforced('admin.authorization.manage'));
        $this->assertTrue($this->policy()->isEnforced('admin.policy.update'));
    }

    public function test_shadow_mode_still_admits_an_admin_to_a_staged_permission(): void
    {
        $this->seed(RbacSeeder::class);
        config(['authorization.enforcement.enforced_permissions' => []]);

        $user = $this->admin('staged-shadow@test.local');

        $this->withToken(auth('api')->login($user))
            ->getJson('/api/admin/form16/employees')
            ->assertOk();
    }

    public function test_promoting_a_permission_denies_an_admin_without_the_grant(): void
    {
        $this->seed(RbacSeeder::class);
        config(['authorization.enforcement.enforced_permissions' => ['payroll.form16.read']]);

        $user = $this->admin('staged-enforced@test.local');

        $this->withToken(auth('api')->login($user))
            ->getJson('/api/admin/form16/employees')
            ->assertForbidden();
    }

    public function test_enforcement_ignores_client_supplied_values(): void
    {
        $this->seed(RbacSeeder::class);
        config(['authorization.enforcement.enforced_permissions' => ['payroll.form16.read']]);

        $user = $this->admin('staged-client@test.local');

        $this->withToken(auth('api')->login($user))
            ->getJson('/api/admin/form16/employees?enforcement_mode=shadow&shadow=1')
            ->assertForbidden();
    }

    public function test_authentication_is_enforced_regardless_of_shadow_mode(): void
    {
        config(['authorization.enforcement.enforced_permissions' => []]);

        $this->getJson('/api/admin/form16/employees')->assertUnauthorized();
    }

    public function test_grant_review_report_lists_migrated_roles_and_hides_super_admin(): void
    {
        $this->seed(RbacSeeder::class);

        $exit = \Illuminate\Support\Facades\Artisan::call('authz:tds-grant-review', ['--json' => true]);
        $this->assertSame(0, $exit);

        $json = json_decode(trim(\Illuminate\Support\Facades\Artisan::output()), true) ?: [];

        $codes = array_column($json, 'role_code');

        $this->assertNotContains('super_administrator', $codes, 'Hidden Super Admin must never appear in the review report.');
        $this->assertContains('tenant_administrator', $codes, 'Admin held payroll.payslip.read and must be listed for review.');

        foreach ($json as $row) {
            $this->assertSame('pending', $row['review_status']);
            $this->assertArrayHasKey('provenance', $row);
        }
    }

    public function test_super_admin_bypasses_enforcement(): void
    {
        $this->seed(RbacSeeder::class);
        config(['authorization.enforcement.enforced_permissions' => ['payroll.form16.read']]);

        $root = User::create([
            'name' => 'Root', 'email' => 'staged-root@test.local',
            'password' => 'x', 'role' => 0, 'company_code' => 'nidhi-impex',
            'status' => 0, 'is_deleted' => 0,
        ]);

        $this->withToken(auth('api')->login($root))
            ->getJson('/api/admin/form16/employees')
            ->assertOk();
    }
}
