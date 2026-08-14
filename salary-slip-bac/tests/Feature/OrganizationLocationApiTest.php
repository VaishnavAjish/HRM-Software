<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\OrganizationUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * DOMAIN 02.04 — Organization Locations, Location Types and Work-Location
 * Mappings.
 *
 * Locations are the physical side of the DOMAIN 02 tree. Location types are a
 * configurable catalogue; mappings hang a unit, position or employee off a
 * location with an effective date.
 */
class OrganizationLocationApiTest extends TestCase
{
    use RefreshDatabase;

    private User $root;

    protected function setUp(): void
    {
        parent::setUp();

        $this->root = User::create([
            'name' => 'Root', 'email' => 'root@org-loc.test', 'password' => 'secret1234',
            'emp_code' => 'LOC-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
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

    private function locationId(Company $company, string $name = 'Head Office'): int
    {
        return $this->asRoot()->postJson('/api/v1/admin/organization/org-locations', [
            'companyId' => $company->id,
            'code' => strtolower(str_replace(' ', '-', $name)),
            'name' => $name,
            'kind' => 'office',
        ])->assertCreated()->assertJsonPath('success', true)->json('data.id');
    }

    #[Test]
    public function a_location_hangs_under_its_company(): void
    {
        $company = $this->company();
        $id = $this->locationId($company, 'Head Office');

        $this->assertDatabaseHas('organization_locations', ['id' => $id, 'company_id' => $company->id]);

        $this->asRoot()->getJson('/api/v1/admin/organization/org-locations')
            ->assertOk()->assertJsonPath('data.0.id', $id);
    }

    #[Test]
    public function a_duplicate_location_name_within_one_company_is_rejected(): void
    {
        $company = $this->company();
        $this->locationId($company, 'Plant');

        $this->asRoot()->postJson('/api/v1/admin/organization/org-locations', [
            'companyId' => $company->id, 'code' => 'plant', 'name' => 'Plant',
        ])->assertStatus(422)->assertJsonPath('error.code', 'ORGANIZATION_LOCATION_CODE_TAKEN');
    }

    #[Test]
    public function a_location_type_can_be_created(): void
    {
        $type = $this->asRoot()->postJson('/api/v1/admin/organization/org-locations/types', [
            'code' => 'godown', 'name' => 'Godown',
        ])->assertCreated()->json('data');

        $this->assertDatabaseHas('organization_location_types', ['id' => $type['id'], 'code' => 'godown']);

        $this->asRoot()->getJson('/api/v1/admin/organization/org-locations/types')
            ->assertOk()->assertJsonPath('data.0.id', $type['id']);
    }

    #[Test]
    public function a_work_location_mapping_links_a_unit_to_a_location(): void
    {
        $company = $this->company();
        $locationId = $this->locationId($company, 'Plant');

        $unit = OrganizationUnit::query()->create([
            'company_id' => $company->id,
            'code' => 'mapping-unit',
            'name' => 'Mapping Unit',
            'type' => 'department',
            'status' => 'active',
        ]);

        $mapping = $this->asRoot()->postJson('/api/v1/admin/organization/org-locations/mappings', [
            'organizationLocationId' => $locationId,
            'organizationUnitId' => $unit->id,
            'mappingType' => 'unit',
            'effectiveFrom' => '2026-01-01',
        ])->assertCreated()->json('data');

        $this->assertDatabaseHas('organization_work_location_mappings', [
            'id' => $mapping['id'],
            'organization_location_id' => $locationId,
            'organization_unit_id' => $unit->id,
        ]);

        $this->asRoot()->getJson('/api/v1/admin/organization/org-locations/mappings')
            ->assertOk()->assertJsonPath('data.0.id', $mapping['id']);
    }

    #[Test]
    public function a_location_with_children_cannot_be_deleted(): void
    {
        $company = $this->company();
        $parentId = $this->locationId($company, 'Zone A');

        $this->asRoot()->postJson('/api/v1/admin/organization/org-locations', [
            'companyId' => $company->id, 'code' => 'zone-a-store', 'name' => 'Zone A Store', 'kind' => 'store', 'parentId' => $parentId,
        ])->assertCreated();

        $this->asRoot()->deleteJson('/api/v1/admin/organization/org-locations/'.$parentId)
            ->assertStatus(422);
    }

    #[Test]
    public function a_missing_location_returns_404(): void
    {
        $this->asRoot()->getJson('/api/v1/admin/organization/org-locations/999999')
            ->assertNotFound()->assertJsonPath('error.code', 'NOT_FOUND');
    }
}