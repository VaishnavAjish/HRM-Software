<?php

namespace Tests\Feature;

use App\Models\AuthorizationPolicy;
use App\Models\Permission;
use App\Models\User;
use App\Services\Authorization\AuthorizationEngine;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class EnterpriseAuthorizationEngineTest extends TestCase
{
    use RefreshDatabase;

    private AuthorizationEngine $engine;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser([
            'role' => 1, 'company_code' => 'acme', 'unit' => 'HQ', 'status' => 0, 'is_deleted' => 0,
        ]);
        $this->seed(RbacSeeder::class);
        $this->engine = app(AuthorizationEngine::class);
    }

    #[Test]
    public function a_scoped_role_allows_in_tenant_and_denies_cross_tenant(): void
    {
        $inside = $this->engine->decide($this->admin, 'hr.employee.read', ['id' => 20, 'company_code' => 'acme']);
        $outside = $this->engine->decide($this->admin, 'hr.employee.read', ['id' => 21, 'company_code' => 'other']);

        $this->assertTrue($inside->allowed);
        $this->assertSame('EXPLICIT_ALLOW', $inside->reasonCode);
        $this->assertFalse($outside->allowed);
        $this->assertSame('TENANT_ACCESS_DENIED', $outside->reasonCode);
    }

    #[Test]
    public function explicit_user_deny_overrides_role_allow(): void
    {
        $permission = Permission::where('code', 'hr.employee.read')->firstOrFail();
        DB::table('user_permissions')->insert([
            'user_id' => $this->admin->id, 'permission_id' => $permission->id, 'is_denied' => true,
        ]);

        $decision = $this->engine->decide($this->admin, 'hr.employee.read', ['company_code' => 'acme']);
        $this->assertFalse($decision->allowed);
        $this->assertSame('EXPLICIT_DENY', $decision->reasonCode);
    }

    #[Test]
    public function default_is_deny_when_no_source_or_policy_matches(): void
    {
        Permission::create([
            'name' => 'finance.ledger.close', 'code' => 'finance.ledger.close', 'resource' => 'finance.ledger',
            'action' => 'close', 'level' => 'ACTION', 'is_active' => true,
        ]);
        $decision = $this->engine->decide($this->admin, 'finance.ledger.close', ['company_code' => 'acme']);
        $this->assertFalse($decision->allowed);
        $this->assertSame('PERMISSION_NOT_ASSIGNED', $decision->reasonCode);
    }

    #[Test]
    public function a_published_conditional_policy_only_allows_matching_records(): void
    {
        $employee = $this->makeUser([
            'role' => 3, 'company_code' => 'acme', 'department' => 'HR', 'status' => 0, 'is_deleted' => 0,
        ]);
        AuthorizationPolicy::create([
            'tenant_id' => 'acme', 'code' => 'self-profile-update', 'name' => 'Self profile update',
            'effect' => 'ALLOW', 'subjects' => ['userIds' => [$employee->id]], 'actions' => ['hr.profile.update'],
            'resources' => ['hr.profile'], 'scope_type' => 'TENANT',
            'conditions' => ['operator' => 'is_owner'], 'status' => 'ACTIVE', 'version' => 1,
        ]);

        $own = $this->engine->decide($employee, 'hr.profile.update', [
            'id' => $employee->id, 'owner_id' => $employee->id, 'company_code' => 'acme', 'resource_type' => 'hr.profile',
        ]);
        $other = $this->engine->decide($employee, 'hr.profile.update', [
            'id' => 999, 'owner_id' => 999, 'company_code' => 'acme', 'resource_type' => 'hr.profile',
        ]);

        $this->assertTrue($own->allowed);
        $this->assertFalse($other->allowed);
    }

    #[Test]
    public function expired_direct_access_is_ignored(): void
    {
        $permission = Permission::where('code', 'hr.employee.aadhaar.reveal')->firstOrFail();
        DB::table('user_permissions')->insert([
            'user_id' => $this->admin->id, 'permission_id' => $permission->id, 'is_denied' => false,
            'valid_from' => now()->subDays(2), 'valid_until' => now()->subDay(),
        ]);
        $decision = $this->engine->decide($this->admin, $permission->code, ['company_code' => 'acme']);
        $this->assertFalse($decision->allowed);
    }

    private function makeUser(array $attributes): User
    {
        return User::create(array_merge([
            'name' => 'Authorization Test User', 'email' => uniqid('authz-', true) . '@example.test',
            'password' => 'password', 'emp_code' => strtoupper(substr(uniqid(), -8)),
            'role' => 3, 'company_code' => 'acme', 'status' => 0, 'is_deleted' => 0,
        ], $attributes));
    }
}
