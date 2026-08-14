<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\FeatureFlags;
use Database\Seeders\AdminUserManagementPermissionSeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * DOMAIN 02.01 — Enterprise Management.
 *
 * The enterprise is the top of the DOMAIN 02 tree. Code uniqueness is the guard
 * that matters most: an enterprise code is the label every grouping screen
 * shows, and a duplicate silently splits the group into two.
 */
class OrganizationEnterpriseApiTest extends TestCase
{
    use RefreshDatabase;

    private User $root;

    protected function setUp(): void
    {
        parent::setUp();

        $this->root = User::create([
            'name' => 'Root', 'email' => 'root@org-enterprise.test', 'password' => 'secret1234',
            'emp_code' => 'ENT-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
    }

    private function asRoot(): static
    {
        return $this->withToken(auth('api')->login($this->root));
    }

    private function company(string $code = 'nidhi-impex'): Company
    {
        return Company::query()->firstOrCreate(
            ['code' => $code],
            ['name' => ucwords(str_replace('-', ' ', $code)), 'is_active' => true]
        );
    }

    #[Test]
    public function a_super_admin_can_create_an_enterprise_and_list_it(): void
    {
        $company = $this->company();

        $response = $this->asRoot()->postJson('/api/v1/admin/organization/enterprises', [
            'code' => 'acme-group',
            'enterpriseType' => 'group',
            'name' => 'Acme Group',
            'currency' => 'INR',
            'companyIds' => [$company->id],
        ])->assertCreated()->assertJsonPath('success', true);

        $id = $response->json('data.id');

        $this->assertDatabaseHas('enterprises', ['id' => $id, 'code' => 'acme-group']);
        $this->assertDatabaseHas('enterprise_company_memberships', [
            'enterprise_id' => $id,
            'company_id' => $company->id,
        ]);

        $this->asRoot()->getJson('/api/v1/admin/organization/enterprises')
            ->assertOk()
            ->assertJsonPath('data.0.id', $id);
    }

    #[Test]
    public function an_enterprise_code_is_unique(): void
    {
        $this->asRoot()->postJson('/api/v1/admin/organization/enterprises', [
            'code' => 'dup-group', 'name' => 'First',
        ])->assertCreated();

        $this->asRoot()->postJson('/api/v1/admin/organization/enterprises', [
            'code' => 'dup-group', 'name' => 'Second',
        ])->assertStatus(422)->assertJsonPath('error.code', 'ENTERPRISE_CODE_TAKEN');
    }

    #[Test]
    public function a_super_admin_can_update_status_and_read_history(): void
    {
        $created = $this->asRoot()->postJson('/api/v1/admin/organization/enterprises', [
            'code' => 'state-group', 'name' => 'State Group',
        ])->assertCreated()->json('data');

        $this->asRoot()->patchJson('/api/v1/admin/organization/enterprises/'.$created['id'].'/status', [
            'isActive' => false,
        ])->assertOk()->assertJsonPath('data.isActive', false);

        $this->asRoot()->getJson('/api/v1/admin/organization/enterprises/'.$created['id'].'/history')
            ->assertOk()->assertJsonPath('success', true);

        $this->assertDatabaseHas('enterprises', ['id' => $created['id'], 'is_active' => false]);
    }

    #[Test]
    public function an_enterprise_with_companies_cannot_be_deleted(): void
    {
        $company = $this->company();

        $created = $this->asRoot()->postJson('/api/v1/admin/organization/enterprises', [
            'code' => 'busy-group', 'name' => 'Busy Group', 'companyIds' => [$company->id],
        ])->assertCreated()->json('data');

        $this->asRoot()->deleteJson('/api/v1/admin/organization/enterprises/'.$created['id'])
            ->assertStatus(422)->assertJsonPath('error.code', 'ENTERPRISE_HAS_COMPANIES');

        $this->assertDatabaseHas('enterprises', ['id' => $created['id']]);
    }

    #[Test]
    public function the_assignable_companies_endpoint_lists_the_company(): void
    {
        $company = $this->company();

        $this->asRoot()->getJson('/api/v1/admin/organization/enterprises/companies')
            ->assertOk()
            ->assertJsonPath('data.0.id', $company->id);
    }

    #[Test]
    public function a_missing_enterprise_returns_404(): void
    {
        $this->asRoot()->getJson('/api/v1/admin/organization/enterprises/999999')
            ->assertNotFound()->assertJsonPath('error.code', 'NOT_FOUND');
    }

    /**
     * Reads are granted to the tenant administrator because the pickers on other
     * screens need the lists; writing is not — enterprise master data is the
     * tenant key. A real (non-super) actor passing the read gate proves the
     * permission wiring rather than a super-admin bypass.
     */
    #[Test]
    public function a_tenant_administrator_can_read_but_not_write(): void
    {
        $this->seed(RbacSeeder::class);
        $this->seed(AdminUserManagementPermissionSeeder::class);

        DB::table('authorization_feature_flags')->updateOrInsert(
            ['tenant_id' => '*', 'key' => 'authorization_shadow_mode'],
            ['enabled' => false, 'created_at' => now(), 'updated_at' => now()]
        );
        app(FeatureFlags::class)->forget('authorization_shadow_mode', null);
        app(FeatureFlags::class)->forget('authorization_shadow_mode', 'nidhi-impex');

        $this->company('nidhi-impex');

        $tenantAdmin = User::create([
            'name' => 'Tenant Admin', 'email' => 'tenant@org-enterprise.test', 'password' => 'secret1234',
            'emp_code' => 'ENT-TEN', 'role' => 1, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
        $tenantAdmin->roles()->syncWithoutDetaching([
            (int) Role::query()->where('code', 'tenant_administrator')->firstOrFail()->id,
        ]);

        $this->withToken(auth('api')->login($tenantAdmin))
            ->getJson('/api/v1/admin/organization/enterprises')->assertOk();

        $this->withToken(auth('api')->login($tenantAdmin))
            ->postJson('/api/v1/admin/organization/enterprises', [
                'code' => 'sneaky', 'name' => 'Sneaky',
            ])->assertStatus(403);

        $this->assertDatabaseMissing('enterprises', ['code' => 'sneaky']);
    }
}
