<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\AuthorizationEngine;
use App\Services\Authorization\FeatureFlags;
use App\Support\PermissionRegistry;
use Database\Seeders\PermissionRegistrySeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * An employee can reach their own self-service pages, and nothing else.
 *
 * When the employee shell pages gained registry routes, canRoute() started
 * enforcing them and three of the six went dark for every employee: My Form 16,
 * My Tickets and the Appointment Form. Two of those had declared ADMIN codes —
 * payroll.form16.read guards the administrative Form 16 listing and
 * hr.appointment.read guards the whole appointment directory — so the only way
 * to restore the menu entry would have been to give all 341 employees an
 * administrative capability.
 *
 * The pages now declare what they actually call, and the test asserts both
 * halves: the employee reaches their own pages, and holds none of the admin
 * codes that the mis-declaration would have handed them.
 */
class EmployeeSelfServiceAccessTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RbacSeeder::class);
        $this->seed(PermissionRegistrySeeder::class);

        DB::table('authorization_feature_flags')->updateOrInsert(
            ['tenant_id' => '*', 'key' => 'authorization_shadow_mode'],
            ['enabled' => false, 'created_at' => now(), 'updated_at' => now()]
        );

        foreach ([null, 'nidhi-impex'] as $tenant) {
            app(FeatureFlags::class)->forget('authorization_shadow_mode', $tenant);
        }

        $this->employee = User::create([
            'name' => 'Self Service', 'email' => 'self@employee.local', 'password' => 'secret1234',
            'emp_code' => 'SS-1', 'role' => 3, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->employee->roles()->sync([Role::query()->where('code', 'employee')->value('id')]);
    }

    public function test_every_employee_shell_page_declares_a_capability_the_role_can_hold(): void
    {
        /*
         * The invariant that broke. A page whose declared code is an
         * administrative one cannot be granted to employees without an
         * escalation, so it ends up granted to nobody and simply disappears.
         */
        $adminOnly = ['payroll.form16.read', 'hr.appointment.read', 'hr.employee.read', 'admin.user.read'];
        $offenders = [];

        foreach (PermissionRegistry::all() as $code => $node) {
            if (! str_starts_with($code, 'ui.portals.employee')) {
                continue;
            }

            foreach (PermissionRegistry::impliedCodes($code) as $implied) {
                if (in_array($implied, $adminOnly, true)) {
                    $offenders[] = "{$code} implies {$implied}";
                }
            }
        }

        $this->assertSame(
            [],
            $offenders,
            "An employee shell page declares an administrative capability. Granting it would\n"
            . "hand every employee that admin surface; withholding it hides the page. Declare\n"
            . "what the page actually calls instead:\n  " . implode("\n  ", $offenders)
        );
    }

    public function test_the_employee_role_can_open_its_own_pages(): void
    {
        $engine = app(AuthorizationEngine::class);
        $denied = [];

        foreach (PermissionRegistry::routes() as $route => $code) {
            if (! str_starts_with($route, '/employee')) {
                continue;
            }

            if (! $engine->decide($this->employee, $code)->allowed) {
                $denied[] = "{$route} ({$code})";
            }
        }

        $this->assertSame(
            [],
            $denied,
            "These self-service pages are denied to an ordinary employee, so they vanish\n"
            . "from the employee menu and the route is blocked:\n  " . implode("\n  ", $denied)
        );
    }

    public function test_an_employee_holds_no_administrative_capability(): void
    {
        $engine = app(AuthorizationEngine::class);

        foreach (['payroll.form16.read', 'hr.appointment.read', 'hr.employee.read', 'admin.user.read', 'admin.role.read'] as $code) {
            $this->assertFalse(
                $engine->decide($this->employee, $code)->allowed,
                "An employee must not hold {$code}.",
            );
        }
    }
}
