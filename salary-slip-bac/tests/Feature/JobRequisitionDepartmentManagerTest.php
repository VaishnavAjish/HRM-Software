<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\JobRequisition;
use App\Models\ReportingRelationship;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class JobRequisitionDepartmentManagerTest extends TestCase
{
    use RefreshDatabase;

    private static int $seq = 0;

    private Department $engineering;

    private Department $sales;

    private User $globalAdmin;

    private User $alphaAdmin;

    private User $engineeringManager;

    private User $salesManager;

    protected function setUp(): void
    {
        parent::setUp();

        $this->engineering = Department::create(['name' => 'Engineering']);
        $this->sales = Department::create(['name' => 'Sales']);

        $this->globalAdmin = $this->makeUser(1, 'alpha');
        $this->alphaAdmin = $this->makeUser(2, 'alpha');

        $this->engineeringManager = $this->makeUser(2, 'alpha');
        $engineer = $this->makeUser(3, 'alpha', 'Engineering');
        $this->line($engineer, $this->engineeringManager);

        $this->salesManager = $this->makeUser(2, 'alpha');
        $seller = $this->makeUser(3, 'alpha', 'Sales');
        $this->line($seller, $this->salesManager);
    }

    private function makeUser(int $role, string $companyCode, ?string $department = null, array $overrides = []): User
    {
        $n = ++self::$seq;

        return User::create($overrides + [
            'name' => "Req Actor {$n}",
            'email' => "req-dm-{$n}@test.local",
            'password' => 'x',
            'emp_code' => "RDM{$n}",
            'role' => $role,
            'company_code' => $companyCode,
            'unit' => 'Ichapur',
            'status' => 0,
            'is_deleted' => 0,
            'department' => $department,
        ]);
    }

    private function line(User $employee, User $manager): ReportingRelationship
    {
        return ReportingRelationship::create([
            'employee_user_id' => $employee->id,
            'manager_user_id' => $manager->id,
            'relationship_type' => 'primary',
            'status' => 'active',
            'effective_from' => now()->subDay()->toDateString(),
        ]);
    }

    private function actingAsUser(User $user): static
    {
        return $this->withToken(auth('api')->login($user));
    }

    private function validPayload(array $overrides = []): array
    {
        return $overrides + [
            'title' => 'Senior Software Engineer',
            'department_id' => $this->engineering->id,
            'department_manager_id' => $this->engineeringManager->id,
            'openings' => 2,
            'priority' => 'medium',
            'employment_type' => 'full_time',
        ];
    }

    #[Test]
    public function an_unauthenticated_caller_cannot_create_a_requisition(): void
    {
        $this->postJson('/api/hr/requisitions/store', $this->validPayload())->assertStatus(401);
    }

    #[Test]
    public function an_employee_without_requisition_permission_is_refused(): void
    {
        $employee = $this->makeUser(3, 'alpha');

        $status = $this->actingAsUser($employee)
            ->postJson('/api/hr/requisitions/store', $this->validPayload())
            ->status();

        $this->assertContains($status, [401, 403]);
    }

    #[Test]
    public function a_valid_department_and_manager_pair_creates_the_requisition(): void
    {
        $this->actingAsUser($this->alphaAdmin)
            ->postJson('/api/hr/requisitions/store', $this->validPayload())
            ->assertStatus(201)
            ->assertJsonPath('data.department_id', $this->engineering->id)
            ->assertJsonPath('data.department_manager_id', $this->engineeringManager->id);

        $this->assertDatabaseHas('job_requisitions', [
            'title' => 'Senior Software Engineer',
            'department_id' => $this->engineering->id,
            'department_manager_id' => $this->engineeringManager->id,
        ]);
    }

    #[Test]
    public function a_missing_department_is_rejected(): void
    {
        $this->actingAsUser($this->alphaAdmin)
            ->postJson('/api/hr/requisitions/store', $this->validPayload(['department_id' => null]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['department_id']);
    }

    #[Test]
    public function a_missing_manager_is_rejected(): void
    {
        $this->actingAsUser($this->alphaAdmin)
            ->postJson('/api/hr/requisitions/store', $this->validPayload(['department_manager_id' => null]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['department_manager_id']);
    }

    #[Test]
    public function an_unknown_department_is_rejected(): void
    {
        $this->actingAsUser($this->alphaAdmin)
            ->postJson('/api/hr/requisitions/store', $this->validPayload(['department_id' => 999999]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['department_id']);
    }

    #[Test]
    public function a_manager_of_a_different_department_is_rejected(): void
    {
        $this->actingAsUser($this->alphaAdmin)
            ->postJson('/api/hr/requisitions/store', $this->validPayload(['department_manager_id' => $this->salesManager->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['department_manager_id']);
    }

    #[Test]
    public function a_user_with_no_reports_in_the_department_is_rejected_even_if_real(): void
    {
        $bystander = $this->makeUser(2, 'alpha');

        $this->actingAsUser($this->alphaAdmin)
            ->postJson('/api/hr/requisitions/store', $this->validPayload(['department_manager_id' => $bystander->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['department_manager_id']);
    }

    #[Test]
    public function an_inactive_manager_is_rejected(): void
    {
        $this->engineeringManager->update(['is_deleted' => 1]);

        $this->actingAsUser($this->alphaAdmin)
            ->postJson('/api/hr/requisitions/store', $this->validPayload())
            ->assertStatus(422)
            ->assertJsonValidationErrors(['department_manager_id']);
    }

    #[Test]
    public function a_manager_from_another_company_is_rejected_for_a_scoped_actor(): void
    {
        $betaManager = $this->makeUser(2, 'beta');
        $betaEngineer = $this->makeUser(3, 'beta', 'Engineering');
        $this->line($betaEngineer, $betaManager);

        $this->actingAsUser($this->alphaAdmin)
            ->postJson('/api/hr/requisitions/store', $this->validPayload(['department_manager_id' => $betaManager->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['department_manager_id']);
    }

    #[Test]
    public function experience_and_salary_ranges_must_be_ordered(): void
    {
        $this->actingAsUser($this->alphaAdmin)
            ->postJson('/api/hr/requisitions/store', $this->validPayload(['min_experience' => 6, 'max_experience' => 3]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['max_experience']);

        $this->actingAsUser($this->alphaAdmin)
            ->postJson('/api/hr/requisitions/store', $this->validPayload(['salary_min' => 900000, 'salary_max' => 600000]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['salary_max']);
    }

    #[Test]
    public function the_managers_endpoint_lists_only_that_departments_managers(): void
    {
        $response = $this->actingAsUser($this->alphaAdmin)
            ->getJson("/api/hr/requisitions/departments/{$this->engineering->id}/managers")
            ->assertOk()
            ->assertJsonPath('status', true);

        $rows = $response->json('data');
        $ids = array_column($rows, 'id');

        $this->assertContains($this->engineeringManager->id, $ids);
        $this->assertNotContains($this->salesManager->id, $ids);
        $this->assertSame(['id', 'name', 'designation'], array_keys($rows[0]));
    }

    #[Test]
    public function the_managers_endpoint_does_not_leak_another_companys_managers(): void
    {
        $betaManager = $this->makeUser(2, 'beta');
        $betaEngineer = $this->makeUser(3, 'beta', 'Engineering');
        $this->line($betaEngineer, $betaManager);

        $ids = array_column(
            $this->actingAsUser($this->alphaAdmin)
                ->getJson("/api/hr/requisitions/departments/{$this->engineering->id}/managers")
                ->assertOk()
                ->json('data'),
            'id'
        );

        $this->assertNotContains($betaManager->id, $ids);
        $this->assertContains($this->engineeringManager->id, $ids);
    }

    #[Test]
    public function the_managers_endpoint_answers_404_for_an_unknown_department(): void
    {
        $this->actingAsUser($this->alphaAdmin)
            ->getJson('/api/hr/requisitions/departments/999999/managers')
            ->assertStatus(404);
    }

    #[Test]
    public function a_department_with_no_reporting_lines_returns_an_empty_manager_list(): void
    {
        $orphan = Department::create(['name' => 'Facilities']);
        $this->makeUser(3, 'alpha', 'Facilities');

        $this->actingAsUser($this->alphaAdmin)
            ->getJson("/api/hr/requisitions/departments/{$orphan->id}/managers")
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    #[Test]
    public function updating_the_department_requires_a_manager_of_the_new_department(): void
    {
        $requisition = $this->createRequisition();

        $this->actingAsUser($this->alphaAdmin)
            ->putJson("/api/hr/requisitions/update/{$requisition->id}", ['department_id' => $this->sales->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['department_manager_id']);

        $this->actingAsUser($this->alphaAdmin)
            ->putJson("/api/hr/requisitions/update/{$requisition->id}", [
                'department_id' => $this->sales->id,
                'department_manager_id' => $this->salesManager->id,
            ])
            ->assertOk();

        $this->assertSame($this->salesManager->id, $requisition->fresh()->department_manager_id);
    }

    #[Test]
    public function approval_status_cannot_be_changed_through_the_normal_update_endpoint(): void
    {
        $requisition = $this->createRequisition();

        $this->actingAsUser($this->alphaAdmin)
            ->putJson("/api/hr/requisitions/update/{$requisition->id}", ['status' => 'pending_approval'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['status']);

        $this->assertSame('draft', $requisition->fresh()->status);
    }

    #[Test]
    public function another_companys_requisition_cannot_be_read_updated_or_deleted_by_id(): void
    {
        $foreign = JobRequisition::create([
            'title' => 'Foreign Role',
            'status' => 'draft',
            'company_code' => 'beta',
            'unit' => 'Ichapur',
        ]);

        $this->actingAsUser($this->alphaAdmin)
            ->getJson("/api/hr/requisitions/show/{$foreign->id}")
            ->assertStatus(404);

        $this->actingAsUser($this->alphaAdmin)
            ->putJson("/api/hr/requisitions/update/{$foreign->id}", ['title' => 'Hijacked'])
            ->assertStatus(404);

        $this->actingAsUser($this->alphaAdmin)
            ->deleteJson("/api/hr/requisitions/delete/{$foreign->id}")
            ->assertStatus(404);

        $this->actingAsUser($this->alphaAdmin)
            ->postJson("/api/hr/requisitions/approve/{$foreign->id}")
            ->assertStatus(404);

        $this->actingAsUser($this->alphaAdmin)
            ->postJson("/api/hr/requisitions/publish/{$foreign->id}")
            ->assertStatus(404);

        $this->assertSame('Foreign Role', $foreign->fresh()->title);
    }

    #[Test]
    public function a_global_admin_can_still_reach_requisitions_across_companies(): void
    {
        $foreign = JobRequisition::create([
            'title' => 'Foreign Role',
            'status' => 'draft',
            'company_code' => 'beta',
            'unit' => 'Ichapur',
        ]);

        $this->actingAsUser($this->globalAdmin)
            ->getJson("/api/hr/requisitions/show/{$foreign->id}")
            ->assertOk();
    }

    private function createRequisition(): JobRequisition
    {
        return JobRequisition::create([
            'title' => 'Senior Software Engineer',
            'status' => 'draft',
            'department_id' => $this->engineering->id,
            'department_manager_id' => $this->engineeringManager->id,
            'company_code' => 'alpha',
            'unit' => 'Ichapur',
        ]);
    }
}
