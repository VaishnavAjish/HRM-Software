<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Authorization\AuthorizationEngine;
use App\Services\Authorization\SchemaSupport;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The engine against a pre-enterprise schema.
 *
 * Deployments that never ran the enterprise migration — or that rolled back to
 * the _pre_authz_* snapshot — keep the thin RBAC tables: no authorization_*
 * tables, and no code/is_active on permissions, no effect/conditions/validity on
 * the grant pivots. Rolling the migration back here reproduces that shape
 * exactly, so these tests fail if a query reintroduces an unguarded column.
 */
class AuthorizationLegacySchemaTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = $this->makeUser(['role' => 1, 'company_code' => 'acme', 'unit' => 'HQ']);
        $this->seed(RbacSeeder::class);

        $this->downgradeToLegacySchema();
    }

    #[Test]
    public function decide_resolves_against_base_rbac_without_enterprise_columns(): void
    {
        $decision = app(AuthorizationEngine::class)
            ->decide($this->admin, 'hr.employee.read', ['company_code' => 'acme']);

        $this->assertContains($decision->reasonCode, ['EXPLICIT_ALLOW', 'PERMISSION_NOT_ASSIGNED']);
        $this->assertNotSame('', $decision->effectiveState);
    }

    #[Test]
    public function decide_denies_cross_tenant_on_legacy_schema(): void
    {
        $decision = app(AuthorizationEngine::class)
            ->decide($this->admin, 'hr.employee.read', ['id' => 7, 'company_code' => 'other']);

        $this->assertFalse($decision->allowed);
        $this->assertSame('TENANT_ACCESS_DENIED', $decision->reasonCode);
    }

    #[Test]
    public function me_endpoint_returns_a_snapshot_instead_of_failing(): void
    {
        $response = $this->withToken(auth('api')->login($this->admin))
            ->getJson('/api/v1/authorization/me');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.authorizationVersion', 'v2')
            ->assertJsonStructure(['data' => ['cacheVersion', 'permissions', 'roles', 'featureFlags']]);
    }

    #[Test]
    public function me_reports_roles_from_the_base_pivot_when_assignments_are_absent(): void
    {
        $role = \App\Models\Role::query()->first();
        $this->admin->roles()->attach($role->id);

        $response = $this->withToken(auth('api')->login($this->admin))
            ->getJson('/api/v1/authorization/me');

        $response->assertOk();
        $roles = $response->json('data.roles');
        $this->assertNotEmpty($roles);
        $this->assertSame($role->name, $roles[0]['name']);
        $this->assertNull($roles[0]['scopeType']);
    }

    #[Test]
    public function check_endpoint_survives_the_legacy_schema(): void
    {
        $this->withToken(auth('api')->login($this->admin))
            ->postJson('/api/v1/authorization/check', ['permissionCode' => 'hr.employee.read'])
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    /**
     * Roll the enterprise migration back, leaving the base RBAC tables only.
     * SchemaSupport memoises its probes, so it has to forget what it learned
     * from the fully migrated schema built moments earlier.
     */
    private function downgradeToLegacySchema(): void
    {
        $migration = require database_path(
            'migrations/2026_08_03_000001_create_enterprise_authorization_platform.php'
        );
        $migration->down();

        SchemaSupport::flush();

        $this->assertFalse(SchemaSupport::hasTable('authorization_role_assignments'));
        $this->assertFalse(SchemaSupport::hasColumn('permissions', 'code'));
        $this->assertFalse(SchemaSupport::hasColumn('role_permissions', 'effect'));
    }

    private function makeUser(array $attributes): User
    {
        return User::create(array_merge([
            'name' => 'Legacy Schema User', 'email' => uniqid('legacy-', true) . '@example.test',
            'password' => 'password', 'emp_code' => strtoupper(substr(uniqid(), -8)),
            'role' => 3, 'company_code' => 'acme', 'status' => 0, 'is_deleted' => 0,
        ], $attributes));
    }
}
