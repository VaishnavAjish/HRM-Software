<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Mediclaim\MediclaimCard;
use App\Models\Mediclaim\MediclaimEnrollment;
use App\Models\Mediclaim\MediclaimMember;
use App\Models\Mediclaim\MediclaimPolicy;
use App\Models\Mediclaim\MediclaimPolicyVersion;
use App\Models\User;
use App\Services\Mediclaim\MediclaimCardService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * MediclaimCardService::generate()/revoke()/regenerateIfStale(): only a
 * SHA-256 hash of the QR token is ever persisted (plaintext returned once,
 * from generate()'s own return value); revoke() nulls the hash so a scan of
 * the old token stops matching; regeneration creates a NEW row and marks the
 * OLD row `superseded_by_card_id` (confirmed direction: old row points at
 * the new row), never deleting it.
 *
 * As of this snapshot there is no HTTP route wired to card generation
 * (`mediclaim.card.create` is seeded as a permission but no controller
 * action calls MediclaimCardService::generate()/regenerateIfStale() —
 * confirmed against the routes/mediclaim.php route table) — these
 * assertions exercise the service directly.
 */
class MediclaimCardLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function generation_creates_a_card_row_with_a_hashed_not_plaintext_token(): void
    {
        $member = $this->enrolledSelfMember();
        $actor = $this->makeUser('Admin', ['role' => 1]);

        $result = app(MediclaimCardService::class)->generate($member, $actor);
        $card = $result['card'];
        $token = $result['token'];

        $this->assertInstanceOf(MediclaimCard::class, $card);
        $this->assertNotNull($card->id);
        $this->assertSame($member->id, $card->member_id);
        $this->assertSame('active', $card->status);

        $this->assertNotSame($token, $card->qr_token_hash, 'The plaintext token must never be stored as-is.');
        $this->assertSame(hash('sha256', $token), $card->qr_token_hash);
        $this->assertSame(64, strlen($card->qr_token_hash), 'A sha256 hex digest is 64 characters.');

        $this->assertDatabaseHas('mediclaim_cards', ['id' => $card->id, 'qr_token_hash' => hash('sha256', $token)]);
    }

    #[Test]
    public function the_plaintext_token_is_only_ever_available_from_the_generate_call_itself(): void
    {
        $member = $this->enrolledSelfMember();
        $actor = $this->makeUser('Admin', ['role' => 1]);

        $result = app(MediclaimCardService::class)->generate($member, $actor);
        $card = $result['card'];

        // Nothing about the persisted row (fresh from DB) exposes the
        // plaintext token — only its hash.
        $fresh = MediclaimCard::findOrFail($card->id);
        $this->assertArrayNotHasKey('qr_token', $fresh->toArray());
        $this->assertArrayNotHasKey('token', $fresh->toArray());
        $this->assertArrayNotHasKey('plaintext_token', $fresh->toArray());
    }

    #[Test]
    public function revoking_a_card_nulls_its_hash_so_the_old_token_no_longer_verifies(): void
    {
        $member = $this->enrolledSelfMember();
        $actor = $this->makeUser('Admin', ['role' => 1]);
        $service = app(MediclaimCardService::class);

        ['card' => $card, 'token' => $token] = $service->generate($member, $actor);

        $this->assertNotNull($service->verifyByToken($token), 'Sanity check: the freshly-generated token verifies.');

        $revoked = $service->revoke($card, $actor);

        $this->assertSame('revoked', $revoked->status);
        $this->assertNull($revoked->qr_token_hash);
        $this->assertNotNull($revoked->revoked_at);
        $this->assertSame($actor->id, $revoked->revoked_by);

        $this->assertNull($service->verifyByToken($token), 'A revoked token must no longer verify.');
    }

    #[Test]
    public function regeneration_creates_a_new_row_and_supersedes_the_old_one_without_deleting_it(): void
    {
        $member = $this->enrolledSelfMember();
        $actor = $this->makeUser('Admin', ['role' => 1]);
        $service = app(MediclaimCardService::class);

        ['card' => $originalCard] = $service->generate($member, $actor);
        $result = $service->regenerateIfStale($member, $actor);
        $newCard = $result['card'];

        $this->assertNotSame($originalCard->id, $newCard->id);
        $this->assertSame('active', $newCard->status);

        $this->assertDatabaseHas('mediclaim_cards', ['id' => $originalCard->id]);
        $oldFresh = MediclaimCard::findOrFail($originalCard->id);
        $this->assertSame('superseded', $oldFresh->status);
        $this->assertSame($newCard->id, $oldFresh->superseded_by_card_id, 'The OLD row must point at the NEW row, not the other way around.');
    }

    private function enrolledSelfMember(): MediclaimMember
    {
        $employee = $this->makeUser('Employee');

        $policy = MediclaimPolicy::create([
            'company_code' => 'nidhi-impex', 'policy_code' => 'POL-CARD-' . self::$sequence,
            'name' => 'Nidhi Impex Mediclaim', 'status' => 'active',
        ]);
        $version = MediclaimPolicyVersion::create([
            'policy_id' => $policy->id, 'version_number' => 1, 'status' => 'active',
            'rules' => ['floater_limit_amount' => 300000],
            'effective_from' => '2020-01-01', 'effective_to' => null,
        ]);
        $enrollment = MediclaimEnrollment::create([
            'policy_version_id' => $version->id, 'employee_user_id' => $employee->id,
            'company_code' => 'nidhi-impex', 'status' => 'active', 'enrolled_at' => '2020-01-01',
        ]);

        return MediclaimMember::create([
            'enrollment_id' => $enrollment->id, 'employee_user_id' => $employee->id,
            'full_name' => $employee->name, 'relationship_type' => 'self',
            'date_of_birth' => '1990-01-01', 'status' => 'active', 'effective_from' => '2020-01-01',
        ]);
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-card-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCC{$number}",
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'unit' => 'Surat',
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }
}
