<?php

namespace Tests\Feature;

use App\Models\Asset;
use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * DOMAIN 08 — Asset Allocation tenant isolation.
 *
 * `show`/`update`/`destroy` used to load an asset with a bare `find($id)`
 * and no scope check, while `index`/`allocate`/`returnAsset`/`transfer` on
 * the same controller correctly called `denyUnlessRecordInScope()`. A
 * company-scoped actor (role != 0, single company_code) could read, edit,
 * or delete another company's asset just by guessing its numeric id.
 */
class AssetCrossCompanyApiTest extends TestCase
{
    use RefreshDatabase;

    private User $root;
    private User $companyAActor;
    private User $companyBActor;
    private Asset $assetA;
    private Asset $assetB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company('nidhi-impex');
        $this->company('silver-star');

        $this->root = User::create([
            'name' => 'Root', 'email' => 'root@asset.test', 'password' => 'secret1234',
            'emp_code' => 'AST-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex,silver-star', 'status' => 0,
        ]);

        $this->companyAActor = User::create([
            'name' => 'Company A HR', 'email' => 'hr-a@asset.test', 'password' => 'secret1234',
            'emp_code' => 'AST-HRA', 'role' => 1, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->companyBActor = User::create([
            'name' => 'Company B HR', 'email' => 'hr-b@asset.test', 'password' => 'secret1234',
            'emp_code' => 'AST-HRB', 'role' => 1, 'company_code' => 'silver-star', 'status' => 0,
        ]);

        $this->assetA = Asset::create([
            'asset_tag' => 'LAPTOP-A-001', 'category' => 'laptop', 'status' => 'available',
            'company_code' => 'nidhi-impex', 'unit' => null, 'qr_code_value' => 'LAPTOP-A-001',
        ]);

        $this->assetB = Asset::create([
            'asset_tag' => 'LAPTOP-B-001', 'category' => 'laptop', 'status' => 'available',
            'company_code' => 'silver-star', 'unit' => null, 'qr_code_value' => 'LAPTOP-B-001',
        ]);
    }

    private function company(string $code): Company
    {
        return Company::query()->firstOrCreate(
            ['code' => $code],
            ['name' => ucwords(str_replace('-', ' ', $code)), 'is_active' => true]
        );
    }

    private function as(User $user): static
    {
        return $this->withToken(auth('api')->login($user));
    }

    #[Test]
    public function a_company_actor_can_view_and_edit_its_own_asset(): void
    {
        $this->as($this->companyAActor)->getJson("/api/hr/assets/show/{$this->assetA->id}")
            ->assertOk()->assertJsonPath('data.asset_tag', 'LAPTOP-A-001');

        $this->as($this->companyAActor)->putJson("/api/hr/assets/update/{$this->assetA->id}", [
            'category' => 'desktop',
        ])->assertOk()->assertJsonPath('data.category', 'desktop');
    }

    #[Test]
    public function a_company_actor_cannot_view_another_companys_asset_by_id(): void
    {
        $this->as($this->companyAActor)->getJson("/api/hr/assets/show/{$this->assetB->id}")
            ->assertStatus(404);
    }

    #[Test]
    public function a_company_actor_cannot_edit_another_companys_asset_by_id(): void
    {
        $this->as($this->companyAActor)->putJson("/api/hr/assets/update/{$this->assetB->id}", [
            'category' => 'desktop',
        ])->assertStatus(404);

        $this->assertDatabaseHas('assets', ['id' => $this->assetB->id, 'category' => 'laptop']);
    }

    #[Test]
    public function a_company_actor_cannot_delete_another_companys_asset(): void
    {
        $this->as($this->companyAActor)->deleteJson("/api/hr/assets/delete/{$this->assetB->id}")
            ->assertStatus(404);

        $this->assertDatabaseHas('assets', ['id' => $this->assetB->id]);
    }

    #[Test]
    public function a_company_actor_can_delete_its_own_asset(): void
    {
        $this->as($this->companyAActor)->deleteJson("/api/hr/assets/delete/{$this->assetA->id}")
            ->assertOk();

        $this->assertDatabaseMissing('assets', ['id' => $this->assetA->id]);
    }

    #[Test]
    public function the_asset_list_excludes_other_companies_assets(): void
    {
        $this->as($this->companyAActor)->getJson('/api/hr/assets/get')
            ->assertOk()
            ->assertJsonFragment(['asset_tag' => 'LAPTOP-A-001'])
            ->assertJsonMissing(['asset_tag' => 'LAPTOP-B-001']);
    }

    #[Test]
    public function root_retains_cross_company_access(): void
    {
        $this->as($this->root)->getJson("/api/hr/assets/show/{$this->assetB->id}")
            ->assertOk()->assertJsonPath('data.asset_tag', 'LAPTOP-B-001');
    }
}
