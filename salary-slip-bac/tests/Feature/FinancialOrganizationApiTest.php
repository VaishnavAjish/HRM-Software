<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * DOMAIN 02.05 — Financial Organization (cost/profit centers, GL mappings and
 * allocation rules).
 *
 * Financial organizations are the accounting-side view of the DOMAIN 02 tree;
 * the allocation rules that divide a source center across targets are the part
 * where a bug means money moves to the wrong bucket.
 */
class FinancialOrganizationApiTest extends TestCase
{
    use RefreshDatabase;

    private User $root;

    protected function setUp(): void
    {
        parent::setUp();

        $this->root = User::create([
            'name' => 'Root', 'email' => 'root@fin-org.test', 'password' => 'secret1234',
            'emp_code' => 'FIN-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
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

    private function orgId(Company $company, string $name, string $type = 'cost_center'): int
    {
        return $this->asRoot()->postJson('/api/v1/admin/organization/financial-organizations', [
            'companyId' => $company->id,
            'code' => strtolower(str_replace(' ', '-', $name)),
            'name' => $name,
            'type' => $type,
        ])->assertCreated()->assertJsonPath('success', true)->json('data.id');
    }

    #[Test]
    public function a_financial_org_hangs_under_its_company(): void
    {
        $company = $this->company();
        $id = $this->orgId($company, 'Corporate Services');

        $this->assertDatabaseHas('financial_organizations', ['id' => $id, 'company_id' => $company->id]);

        $this->asRoot()->getJson('/api/v1/admin/organization/financial-organizations')
            ->assertOk()->assertJsonPath('data.0.id', $id);
    }

    #[Test]
    public function a_duplicate_financial_org_name_within_one_company_is_rejected(): void
    {
        $company = $this->company();
        $this->orgId($company, 'Shared Costs');

        $this->asRoot()->postJson('/api/v1/admin/organization/financial-organizations', [
            'companyId' => $company->id, 'code' => 'shared-costs', 'name' => 'Shared Costs',
        ])->assertStatus(422)->assertJsonPath('error.code', 'FINANCIAL_ORGANIZATION_CODE_TAKEN');
    }

    #[Test]
    public function a_gl_mapping_hangs_under_a_financial_org(): void
    {
        $company = $this->company();
        $orgId = $this->orgId($company, 'Treasury');

        $mapping = $this->asRoot()->postJson("/api/v1/admin/organization/financial-organizations/{$orgId}/gl-mappings", [
            'glAccountCode' => 'GL-5001', 'glAccountName' => 'Salaries Expense',
        ])->assertCreated()->json('data');

        $this->assertDatabaseHas('financial_gl_mappings', [
            'id' => $mapping['id'],
            'financial_organization_id' => $orgId,
            'gl_account_code' => 'GL-5001',
        ]);

        $this->asRoot()->getJson("/api/v1/admin/organization/financial-organizations/{$orgId}/gl-mappings")
            ->assertOk()->assertJsonPath('data.0.id', $mapping['id']);
    }

    #[Test]
    public function an_allocation_rule_splits_a_source_across_targets_but_never_over_100(): void
    {
        $company = $this->company();
        $sourceId = $this->orgId($company, 'Head Office Costs');
        $retailId = $this->orgId($company, 'Retail Ops');
        $digitalId = $this->orgId($company, 'Digital Ops');

        $rule = $this->asRoot()->postJson('/api/v1/admin/organization/financial-organizations/allocation-rules', [
            'companyId' => $company->id,
            'code' => 'branch-cost-split',
            'sourceFinancialOrganizationId' => $sourceId,
            'name' => 'Branch Cost Split',
            'effectiveFrom' => '2026-01-01',
        ])->assertCreated()->json('data');

        $this->asRoot()->postJson("/api/v1/admin/organization/financial-organizations/allocation-rules/{$rule['id']}/lines", [
            'targetFinancialOrganizationId' => $retailId, 'percentage' => 60,
        ])->assertCreated();

        $this->asRoot()->postJson("/api/v1/admin/organization/financial-organizations/allocation-rules/{$rule['id']}/lines", [
            'targetFinancialOrganizationId' => $digitalId, 'percentage' => 50,
        ])->assertStatus(422)->assertJsonPath('error.code', 'ALLOCATION_PERCENTAGE_EXCEEDS_100');

        $this->assertDatabaseHas('financial_allocation_lines', [
            'allocation_rule_id' => $rule['id'],
            'target_financial_organization_id' => $retailId,
            'percentage' => 60,
        ]);
        $this->assertDatabaseMissing('financial_allocation_lines', [
            'target_financial_organization_id' => $digitalId,
        ]);
    }

    #[Test]
    public function a_financial_org_cannot_be_its_own_descendant(): void
    {
        $company = $this->company();
        $parentId = $this->orgId($company, 'Corporate');

        $childId = $this->asRoot()->postJson('/api/v1/admin/organization/financial-organizations', [
            'companyId' => $company->id, 'code' => 'sub-corporate', 'name' => 'Sub Corporate', 'parentId' => $parentId,
        ])->assertCreated()->json('data.id');

        $this->asRoot()->putJson("/api/v1/admin/organization/financial-organizations/{$parentId}", [
            'parentId' => $childId,
        ])->assertStatus(422)->assertJsonPath('error.code', 'FINANCIAL_ORGANIZATION_CYCLE_DETECTED');
    }

    #[Test]
    public function a_missing_financial_org_returns_404(): void
    {
        $this->asRoot()->getJson('/api/v1/admin/organization/financial-organizations/999999')
            ->assertNotFound()->assertJsonPath('error.code', 'NOT_FOUND');
    }
}
