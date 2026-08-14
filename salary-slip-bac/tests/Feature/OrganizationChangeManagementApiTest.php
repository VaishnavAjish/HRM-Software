<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * DOMAIN 02.09 — Organization Change Management.
 *
 * Draft -> submit -> approve -> schedule -> apply. The workflow rule that
 * matters most is that an approver cannot act out of turn, and a draft cannot
 * be approved before it has been submitted.
 */
class OrganizationChangeManagementApiTest extends TestCase
{
    use RefreshDatabase;

    private User $root;
    private User $ownerApprover;

    protected function setUp(): void
    {
        parent::setUp();

        $this->root = User::create([
            'name' => 'Root', 'email' => 'root@change.test', 'password' => 'secret1234',
            'emp_code' => 'CHG-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
        $this->ownerApprover = User::create([
            'name' => 'Owner Approver', 'email' => 'owner@change.test', 'password' => 'secret1234',
            'emp_code' => 'CHG-OWN', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
    }

    private function asRoot(): static
    {
        return $this->withToken(auth('api')->login($this->root));
    }

    private function asApprover(): static
    {
        return $this->withToken(auth('api')->login($this->ownerApprover));
    }

    private function company(string $code = 'nidhi-impex'): Company
    {
        return Company::query()->firstOrCreate(
            ['code' => $code],
            ['name' => ucwords(str_replace('-', ' ', $code)), 'is_active' => true]
        );
    }

    private function changeId(Company $company, string $name = 'Q4 Restructure'): int
    {
        return $this->asRoot()->postJson('/api/v1/admin/organization/org-changes', [
            'companyId' => $company->id,
            'code' => strtolower(str_replace(' ', '-', $name)),
            'name' => $name,
            'changeType' => 'effective_dated_change',
            'organizationOwnerApproverId' => $this->ownerApprover->id,
        ])->assertCreated()->assertJsonPath('success', true)->json('data.id');
    }

    #[Test]
    public function a_draft_cannot_be_approved_before_submission(): void
    {
        $company = $this->company();
        $id = $this->changeId($company);

        $this->asApprover()->postJson("/api/v1/admin/organization/org-changes/{$id}/approve")
            ->assertStatus(422)->assertJsonPath('error.code', 'CHANGE_REQUEST_INVALID_STATE');
    }

    #[Test]
    public function an_empty_request_cannot_be_submitted(): void
    {
        $company = $this->company();
        $id = $this->changeId($company);

        $this->asRoot()->postJson("/api/v1/admin/organization/org-changes/{$id}/submit")
            ->assertStatus(422)->assertJsonPath('error.code', 'CHANGE_REQUEST_EMPTY');
    }

    #[Test]
    public function a_request_flows_draft_to_applied(): void
    {
        $company = $this->company();
        $id = $this->changeId($company);

        $this->asRoot()->postJson("/api/v1/admin/organization/org-changes/{$id}/items", [
            'itemType' => 'create_unit',
            'targetType' => 'organization_unit',
            'afterValues' => [
                'companyId' => $company->id,
                'code' => 'change-approved-unit',
                'name' => 'Change Approved Unit',
                'type' => 'department',
            ],
        ])->assertCreated();

        $this->asRoot()->postJson("/api/v1/admin/organization/org-changes/{$id}/submit")
            ->assertOk()->assertJsonPath('data.status', 'pending_approval');

        $this->asApprover()->postJson("/api/v1/admin/organization/org-changes/{$id}/approve", [
            'comments' => 'Approved',
        ])->assertOk()->assertJsonPath('data.status', 'approved');

        $this->asApprover()->postJson("/api/v1/admin/organization/org-changes/{$id}/schedule", [
            'scheduledAt' => '2026-02-01',
        ])->assertOk()->assertJsonPath('data.status', 'scheduled');

        $this->asApprover()->postJson("/api/v1/admin/organization/org-changes/{$id}/apply")
            ->assertOk()->assertJsonPath('data.status', 'applied');

        $this->assertDatabaseHas('organization_units', [
            'company_id' => $company->id,
            'name' => 'Change Approved Unit',
        ]);
    }

    #[Test]
    public function the_requester_cannot_be_their_own_approver(): void
    {
        $company = $this->company();

        $id = $this->asRoot()->postJson('/api/v1/admin/organization/org-changes', [
            'companyId' => $company->id,
            'code' => 'self-approved',
            'name' => 'Self Approved',
            'changeType' => 'effective_dated_change',
            'organizationOwnerApproverId' => $this->root->id,
        ])->assertCreated()->json('data.id');

        $this->asRoot()->postJson("/api/v1/admin/organization/org-changes/{$id}/items", [
            'itemType' => 'create_unit',
            'targetType' => 'organization_unit',
            'afterValues' => ['companyId' => $company->id, 'name' => 'Self Unit'],
        ])->assertCreated();

        $this->asRoot()->postJson("/api/v1/admin/organization/org-changes/{$id}/submit")
            ->assertStatus(422)->assertJsonPath('error.code', 'CHANGE_REQUEST_SELF_APPROVAL');
    }

    #[Test]
    public function a_missing_change_request_returns_404(): void
    {
        $this->asRoot()->getJson('/api/v1/admin/organization/org-changes/999999')
            ->assertNotFound()->assertJsonPath('error.code', 'NOT_FOUND');
    }
}