<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Services\Authorization\PermissionTreeBuilder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PermissionTreeBuilderTest extends TestCase
{
    use RefreshDatabase;

    private PermissionTreeBuilder $builder;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RbacSeeder::class);
        $this->builder = app(PermissionTreeBuilder::class);
    }

    private function roleWith(array $codes, string $code): Role
    {
        $role = Role::create([
            'name' => 'Tree ' . $code, 'code' => $code,
            'type' => 'Custom', 'is_active' => true, 'status' => 'ACTIVE',
        ]);

        foreach ($codes as $permission) {
            $id = Permission::where('code', $permission)->value('id');
            $this->assertNotNull($id, "Permission {$permission} must exist.");
            DB::table('role_permissions')->insert([
                'role_id' => $role->id, 'permission_id' => $id, 'effect' => 'ALLOW',
            ]);
        }

        return $role;
    }

    private function find(array $nodes, string $key): ?array
    {
        foreach ($nodes as $node) {
            if ($node['key'] === $key) {
                return $node;
            }
            if ($found = $this->find($node['children'], $key)) {
                return $found;
            }
        }

        return null;
    }

    public function test_the_tree_is_nested_by_module_and_page(): void
    {
        $tree = $this->builder->build($this->roleWith([], 'tree_empty'));

        $attendance = $this->find($tree, 'attendance');

        $this->assertNotNull($attendance);
        $this->assertSame('module', $attendance['type']);
        $this->assertSame(
            ['attendance.view_attendance', 'attendance.shift'],
            array_column($attendance['children'], 'key')
        );
    }

    public function test_a_page_carries_its_actions_as_children(): void
    {
        $tree = $this->builder->build($this->roleWith([], 'tree_actions'));

        $shift = $this->find($tree, 'attendance.shift');

        $this->assertSame(
            ['attendance.shift.create', 'attendance.shift.update', 'attendance.shift.delete', 'attendance.shift.assign'],
            array_column($shift['children'], 'key')
        );
        $this->assertSame('action', $shift['children'][0]['type']);
    }

    public function test_a_granted_permission_reports_enabled(): void
    {
        $role = $this->roleWith(['hr.shift.create'], 'tree_enabled');
        $tree = $this->builder->build($role);

        $this->assertSame(
            PermissionTreeBuilder::STATE_ENABLED,
            $this->find($tree, 'attendance.shift.create')['state']
        );
        $this->assertSame(
            PermissionTreeBuilder::STATE_DISABLED,
            $this->find($tree, 'attendance.shift.delete')['state']
        );
    }

    public function test_a_grouping_row_is_not_applicable(): void
    {
        $tree = $this->builder->build($this->roleWith([], 'tree_group'));

        $columns = $this->find($tree, 'employees.master.columns');

        $this->assertSame(PermissionTreeBuilder::STATE_NOT_APPLICABLE, $columns['state']);
        $this->assertFalse($columns['assignable']);
        $this->assertNull($columns['permissionKey']);
    }

    public function test_parent_is_unchecked_when_no_descendant_is_granted(): void
    {
        $tree = $this->builder->build($this->roleWith([], 'tree_none'));

        $this->assertSame(
            PermissionTreeBuilder::PARENT_UNCHECKED,
            $this->find($tree, 'attendance.shift')['aggregateState']
        );
    }

    public function test_parent_is_indeterminate_when_some_descendants_are_granted(): void
    {
        $role = $this->roleWith(['hr.shift.create'], 'tree_some');
        $tree = $this->builder->build($role);

        $this->assertSame(
            PermissionTreeBuilder::PARENT_INDETERMINATE,
            $this->find($tree, 'attendance.shift')['aggregateState']
        );
    }

    public function test_parent_is_checked_when_every_descendant_is_granted(): void
    {
        $role = $this->roleWith(
            ['hr.shift.create', 'hr.shift.update', 'hr.shift.delete', 'hr.shift.assign'],
            'tree_all'
        );
        $tree = $this->builder->build($role);

        $this->assertSame(
            PermissionTreeBuilder::PARENT_CHECKED,
            $this->find($tree, 'attendance.shift')['aggregateState']
        );
    }

    public function test_every_node_publishes_its_required_parent_chain(): void
    {
        $tree = $this->builder->build($this->roleWith([], 'tree_chain'));

        $this->assertSame(
            ['hr.shift.update', 'hr.shift.read', 'ui.admin.attendance.view'],
            $this->find($tree, 'attendance.shift.update')['requiredCodes']
        );
    }

    public function test_sensitive_columns_are_flagged(): void
    {
        $tree = $this->builder->build($this->roleWith([], 'tree_sensitive'));

        $this->assertTrue($this->find($tree, 'employees.master.columns.aadhaar')['sensitive']);
        $this->assertFalse($this->find($tree, 'attendance.shift.create')['sensitive']);
    }

    public function test_summary_counts_exclude_grouping_rows(): void
    {
        $role = $this->roleWith(['hr.shift.create', 'hr.shift.update'], 'tree_summary');
        $summary = $this->builder->summary($role);

        $this->assertSame(2, $summary['enabled']);
        $this->assertGreaterThan(0, $summary['disabled']);
        $this->assertSame(1, $summary['notApplicable']);
        $this->assertSame(
            $summary['enabled'] + $summary['disabled'],
            $summary['totalApplicable']
        );
    }

    public function test_ordering_is_deterministic_across_builds(): void
    {
        $role = $this->roleWith([], 'tree_order');

        $first = array_column($this->builder->build($role), 'key');

        for ($i = 0; $i < 3; $i++) {
            $this->assertSame($first, array_column($this->builder->build($role), 'key'));
        }
    }

    public function test_pages_remain_independently_configurable(): void
    {
        $role = $this->roleWith(['hr.shift.read'], 'tree_independent');
        $tree = $this->builder->build($role);

        $this->assertSame(
            PermissionTreeBuilder::STATE_ENABLED,
            $this->find($tree, 'attendance.shift')['state']
        );
        $this->assertSame(
            PermissionTreeBuilder::STATE_DISABLED,
            $this->find($tree, 'attendance.view_attendance')['state']
        );
    }
}
