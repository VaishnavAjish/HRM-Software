<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * DOMAIN 02.03 — Organization Units, Positions and Employee Assignments.
 *
 * A unit hangs under a company; positions hang under a unit; assignments tie an
 * employee to a unit through a position. The code derives from the name and is
 * unique within the company — a duplicate silently merges two departments.
 */
class OrganizationUnitApiTest extends TestCase
{
    use RefreshDatabase;

    private User $root;

    protected function setUp(): void
    {
        parent::setUp();

        $this->root = User::create([
            'name' => 'Root', 'email' => 'root@org-unit.test', 'password' => 'secret1234',
            'emp_code' => 'UNT-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
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

    private function unitId(Company $company, string $name = 'Operations', ?int $parentId = null): int
    {
        $payload = [
            'companyId' => $company->id,
            'code' => strtolower(str_replace(' ', '-', $name)),
            'name' => $name,
            'type' => 'department',
        ];

        if ($parentId !== null) {
            $payload['parentId'] = $parentId;
        }

        return $this->asRoot()->postJson('/api/v1/admin/organization/org-units', $payload)
            ->assertCreated()->assertJsonPath('success', true)->json('data.id');
    }

    #[Test]
    public function a_unit_hangs_under_its_company_and_appears_in_the_tree(): void
    {
        $company = $this->company();
        $id = $this->unitId($company, 'Operations');

        $this->assertDatabaseHas('organization_units', ['id' => $id, 'company_id' => $company->id]);

        $this->asRoot()->getJson('/api/v1/admin/organization/org-units')
            ->assertOk()->assertJsonPath('data.0.id', $id);
    }

    #[Test]
    public function a_duplicate_unit_name_within_one_company_is_rejected(): void
    {
        $company = $this->company();

        $this->unitId($company, 'Operations');

        $this->asRoot()->postJson('/api/v1/admin/organization/org-units', [
            'companyId' => $company->id, 'code' => 'operations', 'name' => 'Operations',
        ])->assertStatus(422)->assertJsonPath('error.code', 'ORGANIZATION_UNIT_CODE_TAKEN');
    }

    #[Test]
    public function a_unit_cannot_be_its_own_descendant(): void
    {
        $company = $this->company();
        $parentId = $this->unitId($company, 'Parent Dept');

        $childId = $this->asRoot()->postJson('/api/v1/admin/organization/org-units', [
            'companyId' => $company->id, 'code' => 'child-dept', 'name' => 'Child Dept', 'parentId' => $parentId,
        ])->assertCreated()->json('data.id');

        $this->asRoot()->putJson('/api/v1/admin/organization/org-units/'.$parentId, [
            'parentId' => $childId,
        ])->assertStatus(422)->assertJsonPath('error.code', 'ORGANIZATION_UNIT_CYCLE_DETECTED');
    }

    #[Test]
    public function a_position_hangs_under_a_unit(): void
    {
        $company = $this->company();
        $unitId = $this->unitId($company, 'Accounts');

        $position = $this->asRoot()->postJson("/api/v1/admin/organization/org-units/{$unitId}/positions", [
            'code' => 'accountant', 'title' => 'Accountant', 'approvedHeadcount' => 2,
        ])->assertCreated()->json('data');

        $this->assertDatabaseHas('organization_positions', [
            'id' => $position['id'],
            'organization_unit_id' => $unitId,
            'title' => 'Accountant',
        ]);
    }

    #[Test]
    public function an_assignment_ties_an_employee_to_a_unit_and_position(): void
    {
        $company = $this->company();
        $unitId = $this->unitId($company, 'Finance');
        $position = $this->asRoot()->postJson("/api/v1/admin/organization/org-units/{$unitId}/positions", [
            'code' => 'financial-analyst', 'title' => 'Financial Analyst',
        ])->assertCreated()->json('data');

        $employee = User::create([
            'name' => 'Analyst', 'email' => 'analyst@org-unit.test', 'password' => 'secret1234',
            'emp_code' => 'UNT-EMP', 'role' => 3, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $assignment = $this->asRoot()->postJson('/api/v1/admin/organization/org-units/assignments', [
            'userId' => $employee->id,
            'organizationUnitId' => $unitId,
            'positionId' => $position['id'],
            'assignmentType' => 'primary',
            'isPrimary' => true,
            'effectiveFrom' => '2026-01-01',
        ])->assertCreated()->json('data');

        $this->assertDatabaseHas('employee_organization_assignments', [
            'id' => $assignment['id'],
            'user_id' => $employee->id,
            'organization_unit_id' => $unitId,
            'position_id' => $position['id'],
            'is_primary' => true,
        ]);

        $this->asRoot()->getJson('/api/v1/admin/organization/org-units/assignments?unit_id='.$unitId)
            ->assertOk()->assertJsonPath('data.0.id', $assignment['id']);
    }

    #[Test]
    public function a_unit_with_positions_cannot_be_deleted(): void
    {
        $company = $this->company();
        $unitId = $this->unitId($company, 'Permanent');

        $this->asRoot()->postJson("/api/v1/admin/organization/org-units/{$unitId}/positions", [
            'code' => 'clerk', 'title' => 'Clerk',
        ])->assertCreated();

        $this->asRoot()->deleteJson('/api/v1/admin/organization/org-units/'.$unitId)
            ->assertStatus(422)->assertJsonPath('error.code', 'ORGANIZATION_UNIT_HAS_POSITIONS');
    }

    #[Test]
    public function a_missing_unit_returns_404(): void
    {
        $this->asRoot()->getJson('/api/v1/admin/organization/org-units/999999')
            ->assertNotFound()->assertJsonPath('error.code', 'NOT_FOUND');
    }
}