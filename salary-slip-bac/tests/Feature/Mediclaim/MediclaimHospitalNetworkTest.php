<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimHospital;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Hospital-network claim handling. Confirmed against
 * Concerns/ValidatesClaimPayload::claimRules() (used by MyClaimController@
 * store and ClaimController@update): `non_network_reason` is
 * `['sometimes','nullable','string','max:1000']` with NO `required_if:
 * is_network_hospital,false` (or any other conditional-required rule)
 * anywhere in the backend — this is a GENUINE GAP, not implemented
 * server-side, confirmed by grepping every reference to
 * `non_network_reason`/`is_network_hospital` across app/. The second test
 * below demonstrates this directly rather than assuming the plan's intended
 * enforcement is real.
 */
class MediclaimHospitalNetworkTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function a_network_hospital_claim_needs_no_extra_justification(): void
    {
        $employee = $this->makeUser('Employee');
        $this->grant($employee, ['self.mediclaim.claim.create']);

        $hospital = MediclaimHospital::create([
            'company_code' => 'nidhi-impex', 'name' => 'Surat Diamond Hospital',
            'city' => 'Surat', 'status' => 'active', 'is_cashless' => true,
        ]);

        $this->actingAsUser($employee)
            ->postJson('/api/v1/mediclaim/me/claims', [
                'hospital_id' => $hospital->id,
                'is_network_hospital' => true,
                'non_network_reason' => null,
            ])->assertCreated();
    }

    #[Test]
    public function a_non_network_hospital_claim_without_a_reason_is_accepted_documenting_a_missing_server_side_requirement(): void
    {
        $employee = $this->makeUser('Employee');
        $this->grant($employee, ['self.mediclaim.claim.create']);

        // No hospital_id, is_network_hospital=false, and deliberately no
        // non_network_reason — per the plan this "should" be required, but
        // there is no server-side rule enforcing it anywhere.
        $response = $this->actingAsUser($employee)
            ->postJson('/api/v1/mediclaim/me/claims', [
                'is_network_hospital' => false,
                'non_network_hospital_name' => 'Some Outside Hospital',
            ])->assertCreated()->json('data');

        $this->assertFalse((bool) $response['is_network_hospital']);
        $this->assertNull($response['non_network_reason']);
    }

    /**
     * 2026-09-22: "Delete" was changed from a status flip to a genuine row
     * delete, at the user's explicit request. `mediclaim_claims.hospital_id`
     * is `nullOnDelete()`, so an already-submitted claim survives a hospital
     * being deleted afterward — it just loses that hospital reference
     * rather than the delete being blocked or the claim being destroyed
     * along with it.
     */
    #[Test]
    public function deleting_a_hospital_permanently_removes_it_but_does_not_break_a_historical_claim(): void
    {
        $employee = $this->makeUser('Employee');
        $admin = $this->makeUser('Hospital Admin', ['role' => 1]);
        $this->grant($employee, ['self.mediclaim.claim.create', 'self.mediclaim.claim.read']);
        $this->grant($admin, ['mediclaim.hospital.delete']);

        $hospital = MediclaimHospital::create([
            'company_code' => 'nidhi-impex', 'name' => 'Kiran Hospital',
            'city' => 'Surat', 'status' => 'active', 'is_cashless' => true,
        ]);

        $claim = $this->actingAsUser($employee)
            ->postJson('/api/v1/mediclaim/me/claims', ['hospital_id' => $hospital->id, 'is_network_hospital' => true])
            ->assertCreated()->json('data');

        $this->actingAsUser($admin)
            ->deleteJson("/api/v1/mediclaim/hospitals/{$hospital->id}")
            ->assertOk()
            ->assertJsonPath('data.deleted', true);

        $this->assertDatabaseMissing('mediclaim_hospitals', ['id' => $hospital->id]);

        $this->actingAsUser($employee)
            ->getJson("/api/v1/mediclaim/claims/{$claim['id']}")
            ->assertOk()
            ->assertJsonPath('data.hospital', null);
    }

    #[Test]
    public function hospitals_are_visible_to_every_company_and_delete_is_permanent(): void
    {
        $creator = $this->makeUser('Hospital Admin', ['role' => 1]);
        $this->grant($creator, ['mediclaim.hospital.create', 'mediclaim.hospital.delete']);
        $viewerOtherCompany = $this->makeUser('Other Company Employee', ['company_code' => 'silver-star']);
        $this->grant($viewerOtherCompany, ['self.mediclaim.coverage.read']);

        // Submitting an explicit company_code is ignored -- every hospital
        // is stored (and visible) as company-agnostic.
        $created = $this->actingAsUser($creator)
            ->postJson('/api/v1/mediclaim/hospitals', [
                'name' => 'Apollo Test Hospital', 'company_code' => 'nidhi-impex', 'status' => 'active',
            ])->assertCreated()->json('data');

        $this->assertSame('all-companies', $created['company_code']);

        // An employee on a COMPLETELY DIFFERENT company still sees it.
        $this->actingAsUser($viewerOtherCompany)
            ->getJson('/api/v1/mediclaim/hospitals')
            ->assertOk()
            ->assertJsonFragment(['name' => 'Apollo Test Hospital']);

        $this->actingAsUser($creator)
            ->deleteJson("/api/v1/mediclaim/hospitals/{$created['id']}")
            ->assertOk()
            ->assertJsonPath('data.deleted', true);

        $this->assertDatabaseMissing('mediclaim_hospitals', ['id' => $created['id']]);
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-hospital-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCH{$number}",
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
