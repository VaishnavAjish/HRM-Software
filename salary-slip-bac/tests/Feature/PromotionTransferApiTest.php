<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Designation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * DOMAIN 08 — HR Organization: Promotion/Transfer.
 *
 * A promotion/transfer is a `promotion_transfer` change request carrying a
 * single `update_assignment` item. Creating it never touches the employee's
 * live assignment — only apply() does: it closes the previous primary
 * assignment (effective_to = new effectiveFrom), opens the new one, and
 * (when the manager changed) closes/opens the matching reporting
 * relationship. All of that reuses OrganizationUnitService/
 * ReportingStructureService rather than writing to those tables directly.
 */
class PromotionTransferApiTest extends TestCase
{
    use RefreshDatabase;

    private User $root;
    private User $ownerApprover;
    private User $hrApprover;

    protected function setUp(): void
    {
        parent::setUp();

        $this->root = User::create([
            'name' => 'Root', 'email' => 'root@promo.test', 'password' => 'secret1234',
            'emp_code' => 'PRM-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
        $this->ownerApprover = User::create([
            'name' => 'Owner Approver', 'email' => 'owner@promo.test', 'password' => 'secret1234',
            'emp_code' => 'PRM-OWN', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
        $this->hrApprover = User::create([
            'name' => 'HR Approver', 'email' => 'hr@promo.test', 'password' => 'secret1234',
            'emp_code' => 'PRM-HR', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
    }

    private function asRoot(): static
    {
        return $this->withToken(auth('api')->login($this->root));
    }

    private function asOwnerApprover(): static
    {
        return $this->withToken(auth('api')->login($this->ownerApprover));
    }

    private function asHrApprover(): static
    {
        return $this->withToken(auth('api')->login($this->hrApprover));
    }

    private function company(string $code = 'nidhi-impex'): Company
    {
        return Company::query()->firstOrCreate(
            ['code' => $code],
            ['name' => ucwords(str_replace('-', ' ', $code)), 'is_active' => true]
        );
    }

    private function employee(string $name, string $email, string $empCode, int $role = 3, string $companyCode = 'nidhi-impex'): User
    {
        return User::create([
            'name' => $name, 'email' => $email, 'password' => 'secret1234',
            'emp_code' => $empCode, 'role' => $role, 'company_code' => $companyCode, 'status' => 0,
        ]);
    }

    private function unitId(Company $company, string $name): int
    {
        return $this->asRoot()->postJson('/api/v1/admin/organization/org-units', [
            'companyId' => $company->id,
            'code' => strtolower(str_replace(' ', '-', $name)),
            'name' => $name,
            'type' => 'department',
        ])->assertCreated()->json('data.id');
    }

    private function positionId(int $unitId, string $title, int $approvedHeadcount = 1): int
    {
        return $this->asRoot()->postJson("/api/v1/admin/organization/org-units/{$unitId}/positions", [
            'code' => strtolower(str_replace(' ', '-', $title)),
            'title' => $title,
            'approvedHeadcount' => $approvedHeadcount,
        ])->assertCreated()->json('data.id');
    }

    private function designationId(string $title): int
    {
        return Designation::query()->create([
            'code' => strtolower(str_replace(' ', '-', $title)),
            'title' => $title,
            'status' => 'active',
        ])->id;
    }

    private function assignmentId(int $userId, int $unitId, int $positionId, string $effectiveFrom = '2026-01-01'): int
    {
        return $this->asRoot()->postJson('/api/v1/admin/organization/org-units/assignments', [
            'userId' => $userId,
            'organizationUnitId' => $unitId,
            'positionId' => $positionId,
            'assignmentType' => 'primary',
            'isPrimary' => true,
            'effectiveFrom' => $effectiveFrom,
        ])->assertCreated()->json('data.id');
    }

    /** Draft a promotion/transfer, submit, and get both approvals so it lands on `approved`. */
    private function approvedPromotionTransferId(array $payload): int
    {
        $payload += [
            'organizationOwnerApproverId' => $this->ownerApprover->id,
            'hrApproverId' => $this->hrApprover->id,
        ];

        $id = $this->asRoot()->postJson('/api/v1/admin/organization/org-changes/promotion-transfer', $payload)
            ->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.changeType', 'promotion_transfer')
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.itemCount', 1)
            ->json('data.id');

        $this->asRoot()->postJson("/api/v1/admin/organization/org-changes/{$id}/submit")
            ->assertOk()->assertJsonPath('data.status', 'pending_approval');

        $this->asOwnerApprover()->postJson("/api/v1/admin/organization/org-changes/{$id}/approve")
            ->assertOk()->assertJsonPath('data.status', 'pending_approval');

        $this->asHrApprover()->postJson("/api/v1/admin/organization/org-changes/{$id}/approve")
            ->assertOk()->assertJsonPath('data.status', 'approved');

        return $id;
    }

    #[Test]
    public function a_promotion_transfer_request_can_be_created_as_a_draft(): void
    {
        $company = $this->company();
        $unitFrom = $this->unitId($company, 'Sales');
        $unitTo = $this->unitId($company, 'Marketing');
        $positionFrom = $this->positionId($unitFrom, 'Sales Executive');
        $positionTo = $this->positionId($unitTo, 'Marketing Lead');
        $designation = $this->designationId('Marketing Lead');
        $manager = $this->employee('Manager One', 'manager1@promo.test', 'PRM-MGR1', 2);
        $employee = $this->employee('Riley Rep', 'riley@promo.test', 'PRM-RILEY');
        $currentAssignment = $this->assignmentId($employee->id, $unitFrom, $positionFrom);

        $this->asRoot()->postJson('/api/v1/admin/organization/org-changes/promotion-transfer', [
            'employeeId' => $employee->id,
            'currentAssignmentId' => $currentAssignment,
            'organizationUnitId' => $unitTo,
            'positionId' => $positionTo,
            'designationId' => $designation,
            'managerUserId' => $manager->id,
            'effectiveFrom' => '2026-03-01',
            'reason' => 'Promotion to Marketing Lead',
            'organizationOwnerApproverId' => $this->ownerApprover->id,
            'hrApproverId' => $this->hrApprover->id,
        ])->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.changeType', 'promotion_transfer')
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.itemCount', 1);

        // Creating the request must not touch the live assignment yet.
        $this->assertDatabaseHas('employee_organization_assignments', [
            'id' => $currentAssignment,
            'is_active' => true,
            'is_primary' => true,
            'effective_to' => null,
        ]);
    }

    #[Test]
    public function approving_and_applying_moves_the_employee_and_closes_the_old_assignment(): void
    {
        $company = $this->company();
        $unitFrom = $this->unitId($company, 'Sales');
        $unitTo = $this->unitId($company, 'Marketing');
        $positionFrom = $this->positionId($unitFrom, 'Sales Executive');
        $positionTo = $this->positionId($unitTo, 'Marketing Lead');
        $designation = $this->designationId('Marketing Lead');
        $manager = $this->employee('Manager Two', 'manager2@promo.test', 'PRM-MGR2', 2);
        $employee = $this->employee('Jordan Junior', 'jordan@promo.test', 'PRM-JORDAN');
        $currentAssignment = $this->assignmentId($employee->id, $unitFrom, $positionFrom);

        $id = $this->approvedPromotionTransferId([
            'employeeId' => $employee->id,
            'currentAssignmentId' => $currentAssignment,
            'organizationUnitId' => $unitTo,
            'positionId' => $positionTo,
            'designationId' => $designation,
            'managerUserId' => $manager->id,
            'effectiveFrom' => '2026-03-01',
            'reason' => 'Promotion to Marketing Lead',
        ]);

        $this->asHrApprover()->postJson("/api/v1/admin/organization/org-changes/{$id}/apply")
            ->assertOk()->assertJsonPath('data.status', 'applied');

        // Old assignment closed, demoted, and deactivated as of the new effective date.
        $this->assertDatabaseHas('employee_organization_assignments', [
            'id' => $currentAssignment,
            'is_active' => false,
            'is_primary' => false,
            'effective_to' => '2026-03-01',
        ]);

        // New primary assignment opened with the target unit/position/designation.
        $this->assertDatabaseHas('employee_organization_assignments', [
            'user_id' => $employee->id,
            'organization_unit_id' => $unitTo,
            'position_id' => $positionTo,
            'designation_id' => $designation,
            'manager_user_id' => $manager->id,
            'is_primary' => true,
            'is_active' => true,
            'effective_from' => '2026-03-01',
        ]);

        // Legacy compatibility fields kept in sync (same as any other assignment write).
        $employee->refresh();
        $this->assertSame('Marketing', $employee->department);
        $this->assertSame('Marketing Lead', $employee->designation);

        // Headcount moved from the old position to the new one.
        $this->assertDatabaseHas('organization_positions', ['id' => $positionFrom, 'filled_headcount' => 0]);
        $this->assertDatabaseHas('organization_positions', ['id' => $positionTo, 'filled_headcount' => 1]);

        // Position history recorded the transfer on both positions.
        $this->assertDatabaseHas('position_history', ['position_id' => $positionFrom, 'event_type' => 'transferred']);
        $this->assertDatabaseHas('position_history', ['position_id' => $positionTo, 'event_type' => 'transferred']);
    }

    #[Test]
    public function applying_updates_the_reporting_chain_when_the_manager_changed(): void
    {
        $company = $this->company();
        $unitFrom = $this->unitId($company, 'Sales');
        $unitTo = $this->unitId($company, 'Marketing');
        $positionFrom = $this->positionId($unitFrom, 'Sales Executive');
        $positionTo = $this->positionId($unitTo, 'Marketing Lead');
        $designation = $this->designationId('Marketing Lead');
        $oldManager = $this->employee('Old Manager', 'oldmanager@promo.test', 'PRM-OLDMGR', 2);
        $newManager = $this->employee('New Manager', 'newmanager@promo.test', 'PRM-NEWMGR', 2);
        $employee = $this->employee('Casey Climber', 'casey.climber@promo.test', 'PRM-CASEY');
        $currentAssignment = $this->assignmentId($employee->id, $unitFrom, $positionFrom);

        $this->asRoot()->postJson('/api/v1/admin/organization/reporting/relationships', [
            'employeeId' => $employee->id,
            'managerId' => $oldManager->id,
            'relationshipType' => 'primary',
            'effectiveFrom' => '2026-01-01',
        ])->assertCreated();

        $id = $this->approvedPromotionTransferId([
            'employeeId' => $employee->id,
            'currentAssignmentId' => $currentAssignment,
            'organizationUnitId' => $unitTo,
            'positionId' => $positionTo,
            'designationId' => $designation,
            'managerUserId' => $newManager->id,
            'effectiveFrom' => '2026-03-01',
            'reason' => 'Transfer with new reporting line',
        ]);

        $this->asHrApprover()->postJson("/api/v1/admin/organization/org-changes/{$id}/apply")
            ->assertOk()->assertJsonPath('data.status', 'applied');

        $this->asRoot()->getJson("/api/v1/admin/organization/reporting/chain/{$employee->id}")
            ->assertOk()
            ->assertJsonPath('data.0.level', 1)
            ->assertJsonPath('data.0.managerId', $newManager->id);

        $this->assertDatabaseHas('reporting_relationships', [
            'employee_id' => $employee->id,
            'manager_id' => $oldManager->id,
            'is_active' => false,
        ]);
        $this->assertDatabaseHas('reporting_relationships', [
            'employee_id' => $employee->id,
            'manager_id' => $newManager->id,
            'is_active' => true,
        ]);
    }

    #[Test]
    public function a_promotion_transfer_into_another_companys_unit_is_rejected(): void
    {
        $companyA = $this->company('nidhi-impex');
        $companyB = $this->company('silver-star');

        $unitInCompanyB = $this->unitId($companyB, 'Marketing');
        $positionInCompanyB = $this->positionId($unitInCompanyB, 'Marketing Lead');
        $designation = $this->designationId('Marketing Lead');
        $manager = $this->employee('Scoped Manager', 'scoped-manager@promo.test', 'PRM-SCPMGR', 2);
        $employee = $this->employee('Scoped Employee', 'scoped-employee@promo.test', 'PRM-SCPEMP', 3, 'nidhi-impex');

        $scopedActor = $this->employee('Scoped Actor', 'scoped-actor@promo.test', 'PRM-SCPACT', 2, 'nidhi-impex');

        $this->withToken(auth('api')->login($scopedActor))
            ->postJson('/api/v1/admin/organization/org-changes/promotion-transfer', [
                'employeeId' => $employee->id,
                'organizationUnitId' => $unitInCompanyB,
                'positionId' => $positionInCompanyB,
                'designationId' => $designation,
                'managerUserId' => $manager->id,
                'effectiveFrom' => '2026-03-01',
                'reason' => 'Cross-company attempt',
                'organizationOwnerApproverId' => $this->ownerApprover->id,
            ])->assertStatus(403)->assertJsonPath('error.code', 'COMPANY_FORBIDDEN');
    }

    #[Test]
    public function applying_into_a_frozen_position_is_blocked_and_the_request_is_not_applied(): void
    {
        $company = $this->company();
        $unitFrom = $this->unitId($company, 'Sales');
        $unitTo = $this->unitId($company, 'Marketing');
        $positionFrom = $this->positionId($unitFrom, 'Sales Executive');
        $positionTo = $this->positionId($unitTo, 'Marketing Lead');
        $designation = $this->designationId('Marketing Lead');
        $manager = $this->employee('Manager Three', 'manager3@promo.test', 'PRM-MGR3', 2);
        $employee = $this->employee('Frozen Target', 'frozen@promo.test', 'PRM-FROZEN');
        $currentAssignment = $this->assignmentId($employee->id, $unitFrom, $positionFrom);

        $this->asRoot()->postJson("/api/v1/admin/organization/org-units/{$unitTo}/positions/{$positionTo}/freeze", [
            'reason' => 'Budget freeze',
        ])->assertOk();

        $id = $this->approvedPromotionTransferId([
            'employeeId' => $employee->id,
            'currentAssignmentId' => $currentAssignment,
            'organizationUnitId' => $unitTo,
            'positionId' => $positionTo,
            'designationId' => $designation,
            'managerUserId' => $manager->id,
            'effectiveFrom' => '2026-03-01',
            'reason' => 'Blocked by freeze',
        ]);

        $this->asHrApprover()->postJson("/api/v1/admin/organization/org-changes/{$id}/apply")
            ->assertStatus(422)->assertJsonPath('error.code', 'POSITION_FROZEN');

        // The whole apply() call rolled back — request is still approved, old assignment untouched.
        $this->asRoot()->getJson("/api/v1/admin/organization/org-changes/{$id}")
            ->assertOk()->assertJsonPath('data.status', 'approved');

        $this->assertDatabaseHas('employee_organization_assignments', [
            'id' => $currentAssignment,
            'is_active' => true,
            'is_primary' => true,
            'effective_to' => null,
        ]);
    }

    #[Test]
    public function a_missing_change_request_returns_404(): void
    {
        $this->asRoot()->postJson('/api/v1/admin/organization/org-changes/999999/apply')
            ->assertNotFound()->assertJsonPath('error.code', 'NOT_FOUND');
    }
}
