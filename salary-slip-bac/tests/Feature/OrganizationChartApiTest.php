<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * DOMAIN 02.08 — Organization Chart (read-only projections).
 *
 * The chart endpoint is a pure read: it must never mutate state, and it must
 * return the entities the caller can actually see.
 */
class OrganizationChartApiTest extends TestCase
{
    use RefreshDatabase;

    private User $root;

    protected function setUp(): void
    {
        parent::setUp();

        $this->root = User::create([
            'name' => 'Root', 'email' => 'root@org-chart.test', 'password' => 'secret1234',
            'emp_code' => 'CHT-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
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
    public function an_enterprise_chart_lists_the_group_and_its_company(): void
    {
        $company = $this->company();

        $enterprise = $this->asRoot()->postJson('/api/v1/admin/organization/enterprises', [
            'code' => 'chart-group', 'name' => 'Chart Group', 'companyIds' => [$company->id],
        ])->assertCreated()->json('data');

        $response = $this->asRoot()->getJson('/api/v1/admin/organization/org-chart?chartType=enterprise')
            ->assertOk()
            ->assertJsonPath('data.meta.chartType', 'enterprise');

        $nodeIds = array_column($response->json('data.nodes'), 'id');
        $this->assertContains("enterprise_{$enterprise['id']}", $nodeIds);
        $this->assertContains("company_{$company->id}", $nodeIds);
    }

    #[Test]
    public function a_chart_read_never_mutates_state(): void
    {
        $company = $this->company();
        $this->asRoot()->postJson('/api/v1/admin/organization/enterprises', [
            'code' => 'readonly-group', 'name' => 'Readonly Group', 'companyIds' => [$company->id],
        ])->assertCreated();

        $this->asRoot()->getJson('/api/v1/admin/organization/org-chart?chartType=enterprise')->assertOk();

        $this->assertDatabaseCount('organization_units', 0);
        $this->assertDatabaseCount('organization_positions', 0);
    }

    #[Test]
    public function an_invalid_chart_type_is_rejected(): void
    {
        $this->asRoot()->getJson('/api/v1/admin/organization/org-chart?chartType=nonsense')
            ->assertStatus(422);
    }
}