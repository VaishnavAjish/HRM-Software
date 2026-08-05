<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\FeatureFlags;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AccessRequestEscalationTest extends TestCase
{
    use RefreshDatabase;

    private User $approver;

    private User $requester;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RbacSeeder::class);

        DB::table('authorization_feature_flags')->updateOrInsert(
            ['tenant_id' => '*', 'key' => 'authorization_shadow_mode'],
            ['enabled' => false, 'created_at' => now(), 'updated_at' => now()]
        );
        app(FeatureFlags::class)->forget('authorization_shadow_mode', null);
        app(FeatureFlags::class)->forget('authorization_shadow_mode', 'nidhi-impex');

        $this->approver = User::create([
            'name' => 'Tenant Admin', 'email' => 'esc-approver@test.local', 'password' => 'secret1234',
            'emp_code' => 'E-APP', 'role' => 1, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->requester = User::create([
            'name' => 'Requester', 'email' => 'esc-requester@test.local', 'password' => 'secret1234',
            'emp_code' => 'E-RQ2', 'role' => 3, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $adminRole = Role::query()->where('code', 'tenant_administrator')->firstOrFail();
        $this->approver->roles()->syncWithoutDetaching([$adminRole->id]);

        DB::table('authorization_role_assignments')->insert([
            'user_id' => $this->approver->id, 'role_id' => $adminRole->id,
            'tenant_id' => 'nidhi-impex', 'scope_type' => 'GLOBAL',
            'assignment_source' => 'MANUAL', 'status' => 'ACTIVE',
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function asApprover(): static
    {
        return $this->withToken(auth('api')->login($this->approver));
    }

    private function requestForRole(int $roleId): int
    {
        return $this->withToken(auth('api')->login($this->requester))
            ->postJson('/api/v1/access-requests', [
                'roleId' => $roleId,
                'scopeType' => 'COMPANY',
                'scopeId' => 'nidhi-impex',
                'businessReason' => 'Requesting elevated access for the quarterly audit.',
            ])->assertCreated()->json('data.id');
    }

    public function test_an_admin_approver_cannot_grant_the_admin_role(): void
    {
        $adminRole = Role::query()->where('code', 'tenant_administrator')->firstOrFail();

        $id = $this->requestForRole($adminRole->id);

        $blocked = false;
        for ($step = 0; $step < 3; $step++) {
            $response = $this->asApprover()->postJson("/api/v1/access-requests/{$id}/approve", [
                'decisionReason' => 'Approving elevated access for the audit.',
            ]);

            if ($response->status() === 403) {
                $response->assertJsonPath('code', 'ROLE_ASSIGNMENT_FORBIDDEN');
                $blocked = true;
                break;
            }
        }

        $this->assertTrue($blocked, 'Approving an Admin-tier role request must be refused.');

        $this->assertDatabaseMissing('user_roles', [
            'user_id' => $this->requester->id,
            'role_id' => $adminRole->id,
        ]);
    }

    public function test_the_blocked_escalation_is_audited(): void
    {
        $adminRole = Role::query()->where('code', 'tenant_administrator')->firstOrFail();
        $id = $this->requestForRole($adminRole->id);

        for ($step = 0; $step < 3; $step++) {
            $r = $this->asApprover()->postJson("/api/v1/access-requests/{$id}/approve", [
                'decisionReason' => 'Approving elevated access for the audit.',
            ]);
            if ($r->status() === 403) {
                break;
            }
        }

        $this->assertTrue(
            DB::table('authorization_permission_audit_logs')
                ->where('change_type', 'PRIVILEGE_ESCALATION_BLOCKED')
                ->exists(),
            'A blocked escalation must leave an audit record.'
        );
    }

    public function test_an_admin_approver_may_still_grant_a_custom_role(): void
    {
        $custom = Role::create([
            'name' => 'Report Viewer', 'code' => 'report_viewer',
            'type' => 'Custom', 'is_active' => true, 'status' => 'ACTIVE',
        ]);

        $id = $this->requestForRole($custom->id);

        $granted = false;
        for ($step = 0; $step < 3; $step++) {
            $response = $this->asApprover()->postJson("/api/v1/access-requests/{$id}/approve", [
                'decisionReason' => 'Approving report access for the audit.',
            ]);

            $this->assertNotSame(403, $response->status(), 'A custom role must remain grantable by an Admin.');

            if ($response->json('data.status') === 'APPROVED') {
                $granted = true;
            }
        }

        $this->assertTrue($granted, 'The custom role request should reach APPROVED.');
    }
}
