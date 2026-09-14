<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Mediclaim\MediclaimEnrollment;
use App\Models\Mediclaim\MediclaimHospital;
use App\Models\Mediclaim\MediclaimMember;
use App\Models\Mediclaim\MediclaimPolicy;
use App\Models\Mediclaim\MediclaimPolicyVersion;
use App\Models\User;
use App\Services\Mediclaim\MediclaimCardService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The public GET /api/v1/mediclaim/cards/verify/{token} endpoint
 * (CardVerificationController@show, outside jwt.auth): only the whitelisted
 * fields from MediclaimCardService::verifyByToken() are ever returned, and
 * an unknown token vs. a revoked token are byte-identical (both collapse to
 * `verifyByToken()` returning null, since a revoked card's `status` is no
 * longer 'active' AND its hash is nulled by revoke() — confirmed against
 * the real query, which filters `where('status','active')`).
 */
class MediclaimCardQrPrivacyTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function a_valid_tokens_response_contains_only_the_whitelisted_fields(): void
    {
        [$member, $token] = $this->issuedCard();

        $response = $this->getJson("/api/v1/mediclaim/cards/verify/{$token}")
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.valid', true)
            ->assertHeader('Cache-Control', 'no-store');

        $data = $response->json('data');

        foreach (['member_name', 'member_number_masked', 'policy_number_masked', 'company', 'insurer_name', 'valid_from', 'valid_to', 'approved_hospitals'] as $expectedKey) {
            $this->assertArrayHasKey($expectedKey, $data, "Expected whitelisted key '{$expectedKey}' to be present.");
        }

        $forbiddenKeys = [
            'date_of_birth', 'dob', 'diagnosis', 'address', 'claim_history', 'claims',
            'employee_code', 'emp_code', 'card_number', 'policy_code', 'member_number', 'policy_number',
            'nature_of_illness', 'documents',
        ];
        foreach ($forbiddenKeys as $forbiddenKey) {
            $this->assertArrayNotHasKey($forbiddenKey, $data, "Field '{$forbiddenKey}' must never be exposed by the public verify endpoint.");
        }

        $this->assertStringStartsWith('XXXX-', $data['member_number_masked']);
    }

    #[Test]
    public function an_unknown_token_returns_a_generic_404(): void
    {
        $this->getJson('/api/v1/mediclaim/cards/verify/this-token-never-existed')
            ->assertStatus(404)
            ->assertExactJson([
                'success' => false,
                'error' => ['code' => 'NOT_FOUND', 'message' => 'This card could not be verified.'],
            ])
            ->assertHeader('Cache-Control', 'no-store');
    }

    #[Test]
    public function a_revoked_tokens_response_is_byte_identical_to_an_unknown_token(): void
    {
        [, $token] = $this->issuedCard();
        $card = \App\Models\Mediclaim\MediclaimCard::query()->firstOrFail();
        app(MediclaimCardService::class)->revoke($card, $this->makeUser('Revoker', ['role' => 1]));

        $revokedResponse = $this->getJson("/api/v1/mediclaim/cards/verify/{$token}")->assertStatus(404);
        $unknownResponse = $this->getJson('/api/v1/mediclaim/cards/verify/some-other-unknown-token')->assertStatus(404);

        $this->assertSame($unknownResponse->status(), $revokedResponse->status());
        $this->assertSame($unknownResponse->json(), $revokedResponse->json());
    }

    /** @return array{0:MediclaimMember,1:string} */
    private function issuedCard(): array
    {
        $employee = $this->makeUser('Employee');
        $actor = $this->makeUser('Admin', ['role' => 1]);

        $policy = MediclaimPolicy::create([
            'company_code' => 'nidhi-impex', 'policy_code' => 'POL-QR-' . self::$sequence,
            'name' => 'Nidhi Impex Mediclaim', 'insurer_name' => 'Test Insurer', 'status' => 'active',
        ]);
        $version = MediclaimPolicyVersion::create([
            'policy_id' => $policy->id, 'version_number' => 1, 'status' => 'active',
            'rules' => ['floater_limit_amount' => 300000],
            'effective_from' => '2020-01-01', 'effective_to' => null,
        ]);
        $hospital = MediclaimHospital::create([
            'company_code' => 'nidhi-impex', 'name' => 'Surat Diamond Hospital', 'city' => 'Surat', 'status' => 'active',
        ]);
        $version->hospitals()->attach($hospital->id);

        $enrollment = MediclaimEnrollment::create([
            'policy_version_id' => $version->id, 'employee_user_id' => $employee->id,
            'company_code' => 'nidhi-impex', 'status' => 'active', 'enrolled_at' => '2020-01-01',
        ]);
        $member = MediclaimMember::create([
            'enrollment_id' => $enrollment->id, 'employee_user_id' => $employee->id,
            'full_name' => $employee->name, 'relationship_type' => 'self',
            'date_of_birth' => '1990-01-01', 'status' => 'active', 'effective_from' => '2020-01-01',
        ]);

        $result = app(MediclaimCardService::class)->generate($member, $actor);

        return [$member, $result['token']];
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-qr-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCQ{$number}",
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'unit' => 'Surat',
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }
}
