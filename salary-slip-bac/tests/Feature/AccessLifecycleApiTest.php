<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\FeatureFlags;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AccessLifecycleApiTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $requester;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RbacSeeder::class);
        $this->disableShadowMode();

        $this->admin = User::create([
            'name' => 'Security Admin', 'email' => 'sec-admin@test.local', 'password' => 'secret1234',
            'emp_code' => 'E-SEC', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->requester = User::create([
            'name' => 'Requester', 'email' => 'requester@test.local', 'password' => 'secret1234',
            'emp_code' => 'E-REQ', 'role' => 1, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $superAdmin = Role::query()->where('code', 'super_administrator')->firstOrFail();
        $this->admin->roles()->syncWithoutDetaching([$superAdmin->id]);

        DB::table('authorization_role_assignments')->insert([
            'user_id' => $this->admin->id, 'role_id' => $superAdmin->id,
            'tenant_id' => $this->admin->company_code, 'scope_type' => 'GLOBAL',
            'assignment_source' => 'MANUAL', 'status' => 'ACTIVE',
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function disableShadowMode(): void
    {
        DB::table('authorization_feature_flags')->updateOrInsert(
            ['tenant_id' => '*', 'key' => 'authorization_shadow_mode'],
            ['enabled' => false, 'created_at' => now(), 'updated_at' => now()]
        );

        app(FeatureFlags::class)->forget('authorization_shadow_mode', null);
        app(FeatureFlags::class)->forget('authorization_shadow_mode', 'nidhi-impex');
    }

    private function asAdmin(): static
    {
        return $this->withToken(auth('api')->login($this->admin));
    }

    private function asRequester(): static
    {
        return $this->withToken(auth('api')->login($this->requester));
    }

    private function grantViaRole(User $user, array $codes): void
    {
        $role = Role::create([
            'name' => 'Granted ' . $user->id, 'code' => 'granted_' . $user->id,
            'type' => 'Custom', 'is_active' => true, 'status' => 'ACTIVE',
        ]);

        foreach ($codes as $code) {
            DB::table('role_permissions')->insert([
                'role_id' => $role->id,
                'permission_id' => DB::table('permissions')->where('name', $code)->value('id'),
                'effect' => 'ALLOW',
            ]);
        }

        $user->roles()->syncWithoutDetaching([$role->id]);

        DB::table('authorization_role_assignments')->insert([
            'user_id' => $user->id, 'role_id' => $role->id,
            'tenant_id' => $user->company_code, 'scope_type' => 'GLOBAL',
            'assignment_source' => 'MANUAL', 'status' => 'ACTIVE',
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function createRequest(array $overrides = []): int
    {
        return $this->asRequester()->postJson('/api/v1/access-requests', array_merge([
            'permissionCode' => 'hr.employee.read',
            'scopeType' => 'COMPANY',
            'scopeId' => 'nidhi-impex',
            'businessReason' => 'Need to review employee records for the audit.',
        ], $overrides))->assertCreated()->json('data.id');
    }

    private function approveAll(int $id): void
    {
        for ($step = 0; $step < 3; $step++) {
            $this->asAdmin()->postJson("/api/v1/access-requests/{$id}/approve", [
                'decisionReason' => 'Approved for the quarterly audit.',
            ])->assertOk();
        }
    }

    public function test_a_request_creates_the_full_approval_chain(): void
    {
        $id = $this->createRequest();

        $steps = DB::table('authorization_access_request_approvals')
            ->where('access_request_id', $id)->orderBy('step')->pluck('approver_type')->all();

        $this->assertSame(['MANAGER', 'RESOURCE_OWNER', 'SECURITY'], $steps);
    }

    public function test_a_request_needs_a_substantive_reason(): void
    {
        $this->asRequester()->postJson('/api/v1/access-requests', [
            'permissionCode' => 'hr.employee.read',
            'scopeType' => 'COMPANY',
            'businessReason' => 'why',
        ])->assertStatus(422);
    }

    public function test_a_request_must_name_a_role_or_permission(): void
    {
        $this->asRequester()->postJson('/api/v1/access-requests', [
            'scopeType' => 'COMPANY',
            'businessReason' => 'Need access to something unspecified.',
        ])->assertStatus(422);
    }

    public function test_a_request_stays_pending_until_every_step_approves(): void
    {
        $id = $this->createRequest();

        $this->asAdmin()->postJson("/api/v1/access-requests/{$id}/approve", [
            'decisionReason' => 'Manager approval.',
        ])->assertOk()->assertJsonPath('data.status', 'PENDING');

        $this->assertDatabaseHas('authorization_access_requests', ['id' => $id, 'status' => 'PENDING']);

        $this->assertSame(2, DB::table('authorization_access_request_approvals')
            ->where('access_request_id', $id)->where('status', 'PENDING')->count());
    }

    public function test_the_final_approval_closes_the_request(): void
    {
        $id = $this->createRequest();
        $this->approveAll($id);

        $this->assertDatabaseHas('authorization_access_requests', ['id' => $id, 'status' => 'APPROVED']);
    }

    public function test_approving_a_role_request_creates_the_assignment(): void
    {
        $role = Role::query()->where('code', 'hr_manager')->firstOrFail();

        $id = $this->createRequest(['permissionCode' => null, 'roleId' => $role->id]);
        $this->approveAll($id);

        $this->assertDatabaseHas('user_roles', [
            'user_id' => $this->requester->id, 'role_id' => $role->id,
        ]);

        $this->assertDatabaseHas('authorization_role_assignments', [
            'user_id' => $this->requester->id, 'role_id' => $role->id,
            'assignment_source' => 'ACCESS_REQUEST', 'status' => 'ACTIVE',
        ]);
    }

    public function test_a_rejection_skips_the_remaining_steps(): void
    {
        $id = $this->createRequest();

        $this->asAdmin()->postJson("/api/v1/access-requests/{$id}/reject", [
            'decisionReason' => 'Not justified by the stated work.',
        ])->assertOk()->assertJsonPath('data.status', 'REJECTED');

        $statuses = DB::table('authorization_access_request_approvals')
            ->where('access_request_id', $id)->orderBy('step')->pluck('status')->all();

        $this->assertSame(['REJECTED', 'SKIPPED', 'SKIPPED'], $statuses);
    }

    public function test_you_cannot_decide_your_own_request(): void
    {
        $this->grantViaRole($this->requester, ['admin.access_request.approve']);
        $id = $this->createRequest();

        $this->asRequester()->postJson("/api/v1/access-requests/{$id}/approve", [
            'decisionReason' => 'Approving my own request.',
        ])->assertStatus(403);
    }

    public function test_only_an_approved_request_can_be_revoked(): void
    {
        $id = $this->createRequest();

        $this->asAdmin()->postJson("/api/v1/access-requests/{$id}/revoke", [
            'decisionReason' => 'Changed my mind.',
        ])->assertStatus(409);

        $this->approveAll($id);

        $this->asAdmin()->postJson("/api/v1/access-requests/{$id}/revoke", [
            'decisionReason' => 'Audit finished.',
        ])->assertOk();

        $this->assertDatabaseHas('authorization_access_requests', ['id' => $id, 'status' => 'REVOKED']);
    }

    public function test_a_delegation_cannot_hand_over_access_the_delegator_lacks(): void
    {
        $this->grantViaRole($this->requester, ['admin.delegation.manage']);

        $this->asRequester()->postJson('/api/v1/delegations', [
            'delegateId' => $this->admin->id,
            'permissionCodes' => ['payroll.run.execute'],
            'scopeType' => 'COMPANY',
            'validFrom' => now()->toDateTimeString(),
            'validUntil' => now()->addDays(5)->toDateTimeString(),
            'reason' => 'Covering while I am on leave next week.',
        ])->assertStatus(403);
    }

    public function test_a_delegation_is_created_and_can_be_revoked(): void
    {
        $id = $this->asAdmin()->postJson('/api/v1/delegations', [
            'delegateId' => $this->requester->id,
            'permissionCodes' => ['hr.employee.read'],
            'scopeType' => 'COMPANY',
            'validFrom' => now()->toDateTimeString(),
            'validUntil' => now()->addDays(5)->toDateTimeString(),
            'reason' => 'Covering while I am on leave next week.',
        ])->assertCreated()->json('data.id');

        $this->assertDatabaseHas('authorization_delegations', ['id' => $id, 'status' => 'ACTIVE']);

        $this->asAdmin()->postJson("/api/v1/delegations/{$id}/revoke", [
            'reason' => 'Returned early.',
        ])->assertOk();

        $this->assertDatabaseHas('authorization_delegations', ['id' => $id, 'status' => 'REVOKED']);
    }

    public function test_a_delegation_cannot_run_longer_than_ninety_days(): void
    {
        $this->asAdmin()->postJson('/api/v1/delegations', [
            'delegateId' => $this->requester->id,
            'permissionCodes' => ['hr.employee.read'],
            'scopeType' => 'COMPANY',
            'validFrom' => now()->toDateTimeString(),
            'validUntil' => now()->addDays(120)->toDateTimeString(),
            'reason' => 'Covering an extended sabbatical this year.',
        ])->assertStatus(422);
    }

    public function test_you_cannot_delegate_to_yourself(): void
    {
        $this->asAdmin()->postJson('/api/v1/delegations', [
            'delegateId' => $this->admin->id,
            'permissionCodes' => ['hr.employee.read'],
            'scopeType' => 'COMPANY',
            'validFrom' => now()->toDateTimeString(),
            'validUntil' => now()->addDays(5)->toDateTimeString(),
            'reason' => 'Delegating to myself for no good reason.',
        ])->assertStatus(422);
    }

    public function test_an_emergency_grant_is_capped_at_twenty_four_hours(): void
    {
        $this->asAdmin()->postJson('/api/v1/emergency-access', [
            'userId' => $this->requester->id,
            'permissionCodes' => ['hr.employee.read'],
            'scopeType' => 'COMPANY',
            'validUntil' => now()->addDays(3)->toDateTimeString(),
            'reason' => 'Payroll incident INC-1024 needs immediate investigation.',
        ])->assertStatus(422);
    }

    public function test_an_emergency_grant_cannot_be_given_to_yourself(): void
    {
        $this->asAdmin()->postJson('/api/v1/emergency-access', [
            'userId' => $this->admin->id,
            'permissionCodes' => ['hr.employee.read'],
            'scopeType' => 'COMPANY',
            'validUntil' => now()->addHours(4)->toDateTimeString(),
            'reason' => 'Payroll incident INC-1024 needs immediate investigation.',
        ])->assertStatus(422);
    }

    public function test_an_emergency_grant_is_recorded_and_revocable(): void
    {
        $id = $this->asAdmin()->postJson('/api/v1/emergency-access', [
            'userId' => $this->requester->id,
            'permissionCodes' => ['hr.employee.read'],
            'scopeType' => 'COMPANY',
            'validUntil' => now()->addHours(4)->toDateTimeString(),
            'reason' => 'Payroll incident INC-1024 needs immediate investigation.',
        ])->assertCreated()->json('data.id');

        $this->assertDatabaseHas('authorization_permission_audit_logs', [
            'subject_type' => 'EMERGENCY_GRANT', 'subject_id' => (string) $id, 'change_type' => 'GRANT',
        ]);

        $this->asAdmin()->postJson("/api/v1/emergency-access/{$id}/revoke", [
            'reason' => 'Incident closed.',
        ])->assertOk();

        $this->assertDatabaseHas('authorization_emergency_grants', ['id' => $id, 'status' => 'REVOKED']);
    }

    public function test_a_policy_is_created_as_a_draft_and_versioned(): void
    {
        $id = $this->asAdmin()->postJson('/api/v1/policies', [
            'code' => 'payroll.export.restrict',
            'name' => 'Restrict payroll export',
            'effect' => 'DENY',
            'actions' => ['export'],
            'resources' => ['payroll.payslip'],
            'scopeType' => 'COMPANY',
            'businessReason' => 'Payroll exports must stay inside the finance team.',
        ])->assertCreated()->json('data.id');

        $this->assertDatabaseHas('authorization_policies', ['id' => $id, 'status' => 'DRAFT', 'version' => 1]);
        $this->assertDatabaseHas('authorization_policy_versions', ['policy_id' => $id, 'version' => 1]);
    }

    public function test_a_duplicate_policy_code_is_refused(): void
    {
        $payload = [
            'code' => 'payroll.export.restrict',
            'name' => 'Restrict payroll export',
            'effect' => 'DENY',
            'actions' => ['export'],
            'resources' => ['payroll.payslip'],
            'scopeType' => 'COMPANY',
        ];

        $this->asAdmin()->postJson('/api/v1/policies', $payload)->assertCreated();
        $this->asAdmin()->postJson('/api/v1/policies', $payload)->assertStatus(422);
    }

    public function test_publishing_marks_the_current_version_deployed(): void
    {
        $id = $this->asAdmin()->postJson('/api/v1/policies', [
            'code' => 'payroll.export.restrict',
            'name' => 'Restrict payroll export',
            'effect' => 'DENY',
            'actions' => ['export'],
            'resources' => ['payroll.payslip'],
            'scopeType' => 'COMPANY',
        ])->assertCreated()->json('data.id');

        $this->asAdmin()->postJson("/api/v1/policies/{$id}/publish", [
            'businessReason' => 'Reviewed and approved by the security council.',
        ])->assertOk();

        $this->assertDatabaseHas('authorization_policies', ['id' => $id, 'status' => 'PUBLISHED']);
        $this->assertDatabaseHas('authorization_policy_versions', [
            'policy_id' => $id, 'version' => 1, 'deployment_status' => 'DEPLOYED',
        ]);
    }

    public function test_editing_a_published_policy_returns_it_to_draft(): void
    {
        $id = $this->asAdmin()->postJson('/api/v1/policies', [
            'code' => 'payroll.export.restrict',
            'name' => 'Restrict payroll export',
            'effect' => 'DENY',
            'actions' => ['export'],
            'resources' => ['payroll.payslip'],
            'scopeType' => 'COMPANY',
        ])->assertCreated()->json('data.id');

        $this->asAdmin()->postJson("/api/v1/policies/{$id}/publish", [
            'businessReason' => 'Reviewed and approved by the security council.',
        ])->assertOk();

        $this->asAdmin()->patchJson("/api/v1/policies/{$id}", [
            'name' => 'Restrict payroll export (revised)',
            'businessReason' => 'Widened to cover print as well.',
        ])->assertOk();

        $this->assertDatabaseHas('authorization_policies', ['id' => $id, 'status' => 'DRAFT', 'version' => 2]);
    }

    public function test_rolling_back_restores_an_earlier_snapshot(): void
    {
        $id = $this->asAdmin()->postJson('/api/v1/policies', [
            'code' => 'payroll.export.restrict',
            'name' => 'Original name',
            'effect' => 'DENY',
            'actions' => ['export'],
            'resources' => ['payroll.payslip'],
            'scopeType' => 'COMPANY',
        ])->assertCreated()->json('data.id');

        $this->asAdmin()->patchJson("/api/v1/policies/{$id}", [
            'name' => 'Changed name',
            'businessReason' => 'Renamed for clarity in the console.',
        ])->assertOk();

        $this->asAdmin()->postJson("/api/v1/policies/{$id}/rollback", [
            'version' => 1,
            'businessReason' => 'The rename confused the on-call rota.',
        ])->assertOk();

        $this->assertDatabaseHas('authorization_policies', [
            'id' => $id, 'name' => 'Original name', 'status' => 'DRAFT', 'version' => 3,
        ]);
    }

    public function test_the_lifecycle_endpoints_are_refused_without_permission(): void
    {
        $employee = User::create([
            'name' => 'Plain', 'email' => 'plain@test.local', 'password' => 'secret1234',
            'emp_code' => 'E-PLAIN', 'role' => 3, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->withToken(auth('api')->login($employee))
            ->getJson('/api/v1/policies')->assertStatus(403);

        $this->withToken(auth('api')->login($employee))
            ->getJson('/api/v1/emergency-access')->assertStatus(403);

        $this->withToken(auth('api')->login($employee))
            ->getJson('/api/v1/delegations')->assertStatus(403);
    }
}
