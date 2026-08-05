<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\EffectivePermission;
use App\Support\PermissionRegistry;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class EffectivePermissionTest extends TestCase
{
    use RefreshDatabase;

    private EffectivePermission $evaluator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RbacSeeder::class);
        $this->evaluator = app(EffectivePermission::class);
    }

    private function userWithCodes(array $codes, string $email): User
    {
        $user = User::create([
            'name' => 'Scoped', 'email' => $email, 'password' => 'x',
            'role' => 1, 'company_code' => 'nidhi-impex', 'status' => 0, 'is_deleted' => 0,
        ]);

        $role = Role::create([
            'name' => 'Scoped ' . $email, 'code' => 'scoped_' . md5($email),
            'type' => 'Custom', 'is_active' => true, 'status' => 'ACTIVE',
        ]);

        foreach ($codes as $code) {
            $id = Permission::where('code', $code)->value('id');
            $this->assertNotNull($id, "Permission {$code} must exist.");
            DB::table('role_permissions')->insert([
                'role_id' => $role->id, 'permission_id' => $id, 'effect' => 'ALLOW',
            ]);
        }

        $user->roles()->syncWithoutDetaching([$role->id]);

        return $user;
    }

    public function test_super_admin_is_allowed_every_node_without_permission_rows(): void
    {
        $root = User::create([
            'name' => 'Root', 'email' => 'eff-root@test.local', 'password' => 'x',
            'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0, 'is_deleted' => 0,
        ]);

        foreach (array_keys(PermissionRegistry::all()) as $key) {
            $this->assertTrue($this->evaluator->allows($root, $key), "Super admin must hold {$key}.");
        }
    }

    public function test_a_child_is_ineffective_when_its_parent_is_missing(): void
    {
        $user = $this->userWithCodes(['hr.shift.update'], 'eff-orphan@test.local');

        $this->assertFalse(
            $this->evaluator->allows($user, 'attendance.shift.update'),
            'Shift Update must be ineffective without the Shift page and Attendance module permissions.'
        );
    }

    public function test_a_child_becomes_effective_once_the_whole_chain_is_held(): void
    {
        $user = $this->userWithCodes(
            ['ui.admin.attendance.view', 'hr.shift.read', 'hr.shift.update'],
            'eff-chain@test.local'
        );

        $this->assertTrue($this->evaluator->allows($user, 'attendance.shift.update'));
        $this->assertTrue($this->evaluator->allows($user, 'attendance.shift'));
        $this->assertTrue($this->evaluator->allows($user, 'attendance'));
    }

    public function test_removing_the_module_makes_every_descendant_ineffective(): void
    {
        $user = $this->userWithCodes(
            ['hr.shift.read', 'hr.shift.update', 'hr.shift.delete'],
            'eff-nomodule@test.local'
        );

        foreach (['attendance.shift', 'attendance.shift.update', 'attendance.shift.delete'] as $key) {
            $this->assertFalse($this->evaluator->allows($user, $key), "{$key} must be blocked by the module.");
        }
    }

    public function test_a_sibling_page_is_unaffected_by_another_pages_permissions(): void
    {
        $user = $this->userWithCodes(
            ['ui.admin.attendance.view', 'hr.shift.read'],
            'eff-sibling@test.local'
        );

        $this->assertTrue($this->evaluator->allows($user, 'attendance.shift'));
        $this->assertFalse($this->evaluator->allows($user, 'attendance.view_attendance'));
    }

    public function test_stored_child_values_survive_a_missing_parent(): void
    {
        $user = $this->userWithCodes(['hr.shift.update'], 'eff-preserve@test.local');

        $this->assertFalse($this->evaluator->allows($user, 'attendance.shift.update'));

        $module = Permission::where('code', 'ui.admin.attendance.view')->value('id');
        $page = Permission::where('code', 'hr.shift.read')->value('id');
        $roleId = $user->roles()->pluck('roles.id')->first();

        DB::table('role_permissions')->insert([
            ['role_id' => $roleId, 'permission_id' => $module, 'effect' => 'ALLOW'],
            ['role_id' => $roleId, 'permission_id' => $page, 'effect' => 'ALLOW'],
        ]);

        $this->assertTrue(
            app(EffectivePermission::class)->allows($user->fresh(), 'attendance.shift.update'),
            'Restoring the parent must restore the stored child without re-granting it.'
        );
    }

    public function test_sensitive_columns_are_filtered_independently(): void
    {
        $user = $this->userWithCodes(
            ['ui.admin.employees.view', 'hr.employee.read', 'hr.employee.salary.read'],
            'eff-columns@test.local'
        );

        $visible = $this->evaluator->visibleColumns($user, 'employees.master.columns');

        $this->assertContains('employees.master.columns.salary', $visible);
        $this->assertNotContains('employees.master.columns.aadhaar', $visible);
        $this->assertNotContains('employees.master.columns.bank_account', $visible);
    }

    public function test_columns_vanish_when_the_page_is_removed(): void
    {
        $user = $this->userWithCodes(
            ['hr.employee.salary.read'],
            'eff-nocolumns@test.local'
        );

        $this->assertSame([], $this->evaluator->visibleColumns($user, 'employees.master.columns'));
    }

    public function test_an_unknown_node_is_denied(): void
    {
        $user = $this->userWithCodes(['hr.employee.read'], 'eff-unknown@test.local');

        $this->assertFalse($this->evaluator->allows($user, 'totally.made.up'));
    }

    public function test_an_anonymous_actor_is_denied(): void
    {
        $this->assertFalse($this->evaluator->allows(null, 'attendance'));
        $this->assertSame([], $this->evaluator->allowedNodes(null));
    }

    public function test_required_codes_include_the_whole_ancestor_chain(): void
    {
        $this->assertSame(
            ['hr.shift.update', 'hr.shift.read', 'ui.admin.attendance.view'],
            PermissionRegistry::requiredCodesFor('attendance.shift.update')
        );
    }

    public function test_grouping_rows_carry_no_grantable_permission(): void
    {
        $node = PermissionRegistry::node('employees.master.columns');

        $this->assertNull($node['permission']);
        $this->assertSame(PermissionRegistry::TYPE_FEATURE, $node['type']);
    }

    public function test_every_registry_permission_code_exists_in_the_catalogue(): void
    {
        $missing = [];

        foreach (PermissionRegistry::all() as $key => $node) {
            $code = $node['permission'] ?? null;
            if ($code !== null && ! Permission::where('code', $code)->exists()) {
                $missing[] = $key . ' => ' . $code;
            }
        }

        $this->assertSame([], $missing, 'The registry must not reference permissions that do not exist.');
    }

    public function test_assignable_descendants_exclude_grouping_rows(): void
    {
        $descendants = PermissionRegistry::assignableDescendantsOf('employees.master.columns');

        $this->assertContains('employees.master.columns.salary', $descendants);
        $this->assertNotContains('employees.master.columns', $descendants);
    }
}
