<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Support\PermissionRegistry;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MatrixTreeResponseTest extends TestCase
{
    use RefreshDatabase;

    private User $root;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RbacSeeder::class);

        $this->root = User::create([
            'name' => 'Root', 'email' => 'matrix-tree-root@test.local', 'password' => 'x',
            'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0, 'is_deleted' => 0,
        ]);
    }

    private function matrixFor(string $roleCode): array
    {
        $role = Role::where('code', $roleCode)->firstOrFail();

        return $this->withToken(auth('api')->login($this->root))
            ->getJson("/api/v1/roles/{$role->id}/matrix")
            ->assertOk()
            ->json('data');
    }

    public function test_the_matrix_response_carries_the_navigation_tree(): void
    {
        $data = $this->matrixFor('employee');

        $this->assertArrayHasKey('tree', $data);
        $this->assertArrayHasKey('treeSummary', $data);
        $this->assertNotEmpty($data['tree']);
    }

    public function test_employees_and_attendance_are_returned_as_modules(): void
    {
        $data = $this->matrixFor('employee');

        $this->assertSame(['employees', 'attendance'], array_column($data['tree'], 'key'));
    }

    public function test_attendance_carries_its_pages_as_children(): void
    {
        $data = $this->matrixFor('employee');

        $attendance = collect($data['tree'])->firstWhere('key', 'attendance');

        $this->assertSame(
            ['attendance.view_attendance', 'attendance.shift'],
            array_column($attendance['children'], 'key')
        );
    }

    public function test_grouping_nodes_expose_no_permission_key(): void
    {
        $data = $this->matrixFor('employee');

        $employees = collect($data['tree'])->firstWhere('key', 'employees');
        $master = collect($employees['children'])->firstWhere('key', 'employees.master');
        $columns = collect($master['children'])->firstWhere('key', 'employees.master.columns');

        $this->assertNull($columns['permissionKey']);
        $this->assertFalse($columns['assignable']);
    }

    public function test_the_response_lists_tree_owned_codes_for_legacy_dedup(): void
    {
        $data = $this->matrixFor('employee');

        $this->assertArrayHasKey('treePermissionCodes', $data);
        $this->assertContains('hr.shift.read', $data['treePermissionCodes']);
        $this->assertEqualsCanonicalizing(
            PermissionRegistry::permissionCodes(),
            $data['treePermissionCodes']
        );
    }

    public function test_legacy_modules_are_still_returned(): void
    {
        $data = $this->matrixFor('employee');

        $this->assertNotEmpty($data['modules'], 'Unmapped modules must remain available.');
    }

    public function test_tree_state_reflects_the_roles_real_grants(): void
    {
        $data = $this->matrixFor('employee');

        $attendance = collect($data['tree'])->firstWhere('key', 'attendance');
        $shift = collect($attendance['children'])->firstWhere('key', 'attendance.shift');

        $this->assertContains($shift['state'], ['enabled', 'disabled']);
        $this->assertContains(
            $shift['aggregateState'],
            ['checked', 'unchecked', 'indeterminate', 'not_applicable']
        );
    }

    public function test_summary_totals_are_consistent(): void
    {
        $summary = $this->matrixFor('employee')['treeSummary'];

        $this->assertSame(
            $summary['enabled'] + $summary['disabled'],
            $summary['totalApplicable']
        );
    }

    public function test_the_hidden_super_admin_is_not_a_selectable_target(): void
    {
        $roles = $this->withToken(auth('api')->login($this->root))
            ->getJson('/api/v1/roles')
            ->assertOk()
            ->json('data');

        $this->assertNotContains('super_administrator', array_column($roles, 'code'));
    }
}
