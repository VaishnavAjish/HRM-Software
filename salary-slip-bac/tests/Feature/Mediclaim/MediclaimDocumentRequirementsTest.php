<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Server-side document-completeness enforcement (discharge summary required
 * for hospitalization/surgery, FIR/MLC required when medico-legal).
 *
 * GENUINE GAP CONFIRMED by direct inspection: ClaimWorkflowService::submit()
 * (full method read) never references Document/MediclaimDocumentLink at all;
 * MediclaimClaim::TREATMENT_TYPES_REQUIRING_DISCHARGE_SUMMARY exists as a
 * constant but is read nowhere outside its own declaration (grepped
 * repo-wide); ClaimDocumentController@store validates only that
 * `document_type` is a KNOWN DocumentType slug, never that a specific
 * required type has actually been uploaded before a claim may submit; and
 * MediclaimNotifier::missingDocuments() is explicitly documented as
 * "Not currently wired to a caller" with no call site anywhere. The tests
 * below assert the REAL (permissive) behavior and document the gap plainly,
 * per the task's instruction not to silently work around a missing backend
 * validation.
 */
class MediclaimDocumentRequirementsTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function a_hospitalization_claim_with_no_discharge_summary_still_submits_successfully_documenting_a_gap(): void
    {
        $employee = $this->makeUser('Employee');
        $this->grant($employee, ['self.mediclaim.claim.create', 'self.mediclaim.claim.submit', 'self.mediclaim.claim.read']);

        $created = $this->actingAsUser($employee)
            ->postJson('/api/v1/mediclaim/me/claims', ['treatment_type' => 'hospitalization'])
            ->assertCreated()->json('data');

        $this->assertSame(
            0,
            DB::table('mediclaim_document_links')->where('linkable_id', $created['id'])->count(),
            'Sanity check: no documents are attached to this claim.'
        );

        // Per the plan, a hospitalization claim without a discharge summary
        // should arguably be rejected or at least flagged. Real behavior:
        // it submits exactly like a fully-documented claim.
        $this->actingAsUser($employee)
            ->postJson("/api/v1/mediclaim/claims/{$created['id']}/submit")
            ->assertOk();
    }

    #[Test]
    public function a_medico_legal_claim_with_no_fir_mlc_report_still_submits_successfully_documenting_a_gap(): void
    {
        $employee = $this->makeUser('Employee');
        $this->grant($employee, ['self.mediclaim.claim.create', 'self.mediclaim.claim.submit']);

        $created = $this->actingAsUser($employee)
            ->postJson('/api/v1/mediclaim/me/claims', [
                'treatment_type' => 'hospitalization',
                'is_medico_legal_case' => true,
                'reported_to_police' => true,
                'police_station_details' => 'Surat City Police Station',
            ])->assertCreated()->json('data');

        $this->actingAsUser($employee)
            ->postJson("/api/v1/mediclaim/claims/{$created['id']}/submit")
            ->assertOk();
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-docreq-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCDR{$number}",
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'unit' => 'Surat',
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }

    private function grant(User $user, array $codes): void
    {
        foreach ($codes as $code) {
            $parts = explode('.', $code);
            $action = array_pop($parts);
            $permission = Permission::query()->firstOrCreate(['code' => $code], [
                'name' => $code,
                'resource' => implode('.', $parts),
                'action' => $action,
                'level' => 'ACTION',
                'is_sensitive' => str_contains($code, 'decide'),
                'is_active' => true,
            ]);
            DB::table('user_permissions')->updateOrInsert(
                ['user_id' => $user->id, 'permission_id' => $permission->id],
                ['is_denied' => false],
            );
        }
    }

    private function actingAsUser(User $user): static
    {
        return $this->withToken(auth('api')->login($user));
    }
}
