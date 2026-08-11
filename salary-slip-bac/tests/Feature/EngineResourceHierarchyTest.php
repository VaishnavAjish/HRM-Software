<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\AuthorizationEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The engine honours the module → page → action hierarchy.
 *
 * EffectiveStateResolver applies this when the Permission Matrix renders, and
 * the browser applies it through the requires chain the snapshot publishes. The
 * engine did neither: it resolved each code alone, so a role holding
 * ui.portals.employee_dashboard was granted it while ui.portals — the module
 * containing it — was denied. The matrix said DENY, the browser said DENY, and
 * the thing that actually authorises requests said ALLOW.
 *
 * These cases are the ones the hierarchy exists for, pinned against the engine
 * itself rather than the matrix, because a route wired to one of these codes
 * later would otherwise inherit the defect silently.
 */
class EngineResourceHierarchyTest extends TestCase
{
    use RefreshDatabase;

    private AuthorizationEngine $engine;
    private User $actor;
    private Role $role;

    protected function setUp(): void
    {
        parent::setUp();

        $this->actor = User::create([
            'name' => 'Hierarchy Actor', 'email' => uniqid('hier-', true).'@example.test',
            'password' => 'password', 'emp_code' => strtoupper(substr(uniqid(), -8)),
            'role' => 3, 'company_code' => 'acme', 'status' => 0, 'is_deleted' => 0,
        ]);

        $this->role = Role::create([
            'name' => 'Hierarchy Test', 'code' => 'hierarchy_test', 'is_active' => true,
        ]);

        DB::table('user_roles')->insert([
            'user_id' => $this->actor->id, 'role_id' => $this->role->id,
        ]);

        $this->engine = app(AuthorizationEngine::class);
    }

    private function grant(string $code, string $effect = 'ALLOW'): void
    {
        $permission = Permission::firstOrCreate(
            ['code' => $code],
            ['name' => $code, 'guard_name' => 'api', 'is_active' => true],
        );

        DB::table('role_permissions')->updateOrInsert(
            ['role_id' => $this->role->id, 'permission_id' => $permission->id],
            ['effect' => $effect],
        );
    }

    private function allows(string $code): bool
    {
        return $this->engine->decide($this->actor, $code, ['company_code' => 'acme'], ['audit' => false])->allowed;
    }

    #[Test]
    public function a_child_is_denied_while_its_module_is_not_granted(): void
    {
        $this->grant('ui.employees.view');

        $this->assertFalse($this->allows('ui.employees.view'));
    }

    #[Test]
    public function the_same_child_is_allowed_once_its_module_is_granted(): void
    {
        $this->grant('ui.employees');
        $this->grant('ui.employees.view');

        $this->assertTrue($this->allows('ui.employees.view'));
    }

    #[Test]
    public function a_portal_page_is_denied_while_its_module_is_not_granted(): void
    {
        $this->grant('ui.portals.employee_dashboard');

        $this->assertFalse($this->allows('ui.portals.employee_dashboard'));
    }

    #[Test]
    public function a_portal_page_is_allowed_once_its_module_is_granted(): void
    {
        $this->grant('ui.portals');
        $this->grant('ui.portals.employee_dashboard');

        $this->assertTrue($this->allows('ui.portals.employee_dashboard'));
    }

    #[Test]
    public function a_denied_module_suppresses_its_page_and_action(): void
    {
        $this->grant('ui.salary', 'DENY');
        $this->grant('ui.salary.batch');
        $this->grant('ui.salary.batch.print');

        $this->assertFalse($this->allows('ui.salary'));
        $this->assertFalse($this->allows('ui.salary.batch'));
        $this->assertFalse($this->allows('ui.salary.batch.print'));
    }

    #[Test]
    public function a_denied_page_suppresses_its_action_but_not_its_module(): void
    {
        $this->grant('ui.salary');
        $this->grant('ui.salary.batch', 'DENY');
        $this->grant('ui.salary.batch.print');

        $this->assertTrue($this->allows('ui.salary'));
        $this->assertFalse($this->allows('ui.salary.batch'));
        $this->assertFalse($this->allows('ui.salary.batch.print'));
    }

    #[Test]
    public function a_fully_granted_chain_allows_the_action(): void
    {
        $this->grant('ui.salary');
        $this->grant('ui.salary.batch');
        $this->grant('ui.salary.batch.print');

        $this->assertTrue($this->allows('ui.salary.batch.print'));
    }

    /**
     * Suppression is not deletion. The grant stays on the role so that allowing
     * the parent restores the child, rather than requiring every descendant to
     * be configured a second time.
     */
    #[Test]
    public function suppression_leaves_the_childs_configuration_in_place(): void
    {
        $this->grant('ui.salary', 'DENY');
        $this->grant('ui.salary.batch.print');

        $this->assertFalse($this->allows('ui.salary.batch.print'));

        $permission = Permission::where('code', 'ui.salary.batch.print')->firstOrFail();

        $this->assertDatabaseHas('role_permissions', [
            'role_id' => $this->role->id,
            'permission_id' => $permission->id,
            'effect' => 'ALLOW',
        ]);
    }

    /**
     * Business codes are enforced directly by route middleware and have no
     * parent in the registry, so the gate must leave them alone.
     */
    #[Test]
    public function a_business_code_without_a_registry_parent_is_unaffected(): void
    {
        $this->grant('hr.attendance.read');

        $this->assertTrue($this->allows('hr.attendance.read'));
    }
}
