<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\OrganizationUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * DOMAIN 02.07 — Reporting Structure.
 *
 * A primary reporting relationship is the single line every approval chain and
 * chart follows. Cross-scope pairings are the guard that matters: a manager
 * from one company cannot quietly appear as the boss of an employee in another.
 */
class ReportingStructureApiTest extends TestCase
{
    use RefreshDatabase;

    private User $root;

    protected function setUp(): void
    {
        parent::setUp();

        $this->root = User::create([
            'name' => 'Root', 'email' => 'root@reporting.test', 'password' => 'secret1234',
            'emp_code' => 'RPT-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
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

    private function employee(string $name, string $email, string $empCode, string $companyCode = 'nidhi-impex'): User
    {
        return User::create([
            'name' => $name, 'email' => $email, 'password' => 'secret1234',
            'emp_code' => $empCode, 'role' => 3, 'company_code' => $companyCode, 'status' => 0,
        ]);
    }

    #[Test]
    public function a_reporting_relationship_ties_an_employee_to_a_manager(): void
    {
        $company = $this->company();
        $employee = $this->employee('Alex Worker', 'alex@reporting.test', 'RPT-ALEX');
        $manager = $this->employee('Morgan Boss', 'morgan@reporting.test', 'RPT-MORG');

        $relationship = $this->asRoot()->postJson('/api/v1/admin/organization/reporting/relationships', [
            'employeeId' => $employee->id,
            'managerId' => $manager->id,
            'companyId' => $company->id,
            'relationshipType' => 'primary',
            'effectiveFrom' => '2026-01-01',
        ])->assertCreated()->json('data');

        $this->assertDatabaseHas('reporting_relationships', [
            'id' => $relationship['id'],
            'employee_id' => $employee->id,
            'manager_id' => $manager->id,
            'relationship_type' => 'primary',
        ]);

        $this->asRoot()->getJson('/api/v1/admin/organization/reporting/relationships')
            ->assertOk()->assertJsonPath('data.0.id', $relationship['id']);
    }

    #[Test]
    public function the_reporting_chain_walks_up_to_the_manager(): void
    {
        $employee = $this->employee('Casey Clerk', 'casey@reporting.test', 'RPT-CASEY');
        $manager = $this->employee('Taylor Lead', 'taylor@reporting.test', 'RPT-TAYLOR');

        $this->asRoot()->postJson('/api/v1/admin/organization/reporting/relationships', [
            'employeeId' => $employee->id,
            'managerId' => $manager->id,
            'relationshipType' => 'primary',
            'effectiveFrom' => '2026-01-01',
        ])->assertCreated();

        $this->asRoot()->getJson("/api/v1/admin/organization/reporting/chain/{$employee->id}")
            ->assertOk()
            ->assertJsonPath('data.0.level', 1)
            ->assertJsonPath('data.0.managerId', $manager->id);
    }

    #[Test]
    public function an_employee_cannot_be_their_own_manager(): void
    {
        $employee = $this->employee('Jamie Solo', 'jamie@reporting.test', 'RPT-JAMIE');

        $this->asRoot()->postJson('/api/v1/admin/organization/reporting/relationships', [
            'employeeId' => $employee->id,
            'managerId' => $employee->id,
            'relationshipType' => 'primary',
            'effectiveFrom' => '2026-01-01',
        ])->assertStatus(422)->assertJsonPath('error.code', 'REPORTING_SELF_MANAGER');
    }

    #[Test]
    public function a_cross_company_manager_pairing_is_rejected(): void
    {
        $company = $this->company();
        $employee = $this->employee('Riley Local', 'riley@reporting.test', 'RPT-RILEY');
        $foreignManager = $this->employee('Drew Abroad', 'drew@reporting.test', 'RPT-DREW', 'acme-corp');

        $this->asRoot()->postJson('/api/v1/admin/organization/reporting/relationships', [
            'employeeId' => $employee->id,
            'managerId' => $foreignManager->id,
            'companyId' => $company->id,
            'relationshipType' => 'primary',
            'effectiveFrom' => '2026-01-01',
        ])->assertStatus(422)->assertJsonPath('error.code', 'REPORTING_CROSS_SCOPE');
    }

    #[Test]
    public function a_leadership_assignment_attaches_a_leader_to_a_scope(): void
    {
        $company = $this->company();
        $unit = OrganizationUnit::query()->create([
            'company_id' => $company->id,
            'code' => 'leadership-unit',
            'name' => 'Leadership Unit',
            'type' => 'department',
            'status' => 'active',
        ]);
        $leader = $this->employee('Robin Chief', 'robin@reporting.test', 'RPT-ROBIN');

        $assignment = $this->asRoot()->postJson('/api/v1/admin/organization/reporting/leadership-assignments', [
            'userId' => $leader->id,
            'companyId' => $company->id,
            'scopeId' => $unit->id,
            'scopeType' => 'organization_unit',
            'leadershipType' => 'department_head',
            'effectiveFrom' => '2026-01-01',
        ])->assertCreated()->json('data');

        $this->assertDatabaseHas('organization_leadership_assignments', [
            'id' => $assignment['id'],
            'user_id' => $leader->id,
            'scope_id' => $unit->id,
            'leadership_type' => 'department_head',
        ]);

        $this->asRoot()->getJson('/api/v1/admin/organization/reporting/leadership-assignments')
            ->assertOk()->assertJsonPath('data.0.id', $assignment['id']);
    }
}