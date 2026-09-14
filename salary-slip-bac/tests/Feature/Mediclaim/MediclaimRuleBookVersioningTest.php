<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Mediclaim\MediclaimRuleBook;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Rule book status visibility and acknowledgement recording.
 *
 * NOTES ON REAL BEHAVIOR (confirmed against Admin\RuleBookController and
 * routes/mediclaim.php): there is no self-service rule-book endpoint at all
 * — only `GET/POST /rule-books` and `POST /rule-books/{id}/publish`, all
 * gated by the staff-only `mediclaim.rule_book.*` permission codes (there is
 * no `self.mediclaim.rule_book.read`). `index()` does not filter to
 * `published` automatically — it returns every status unless the caller
 * passes `?status=`. So "only a published rule book is visible to
 * employees" is, as implemented, a QUERY-PARAMETER convention the caller
 * must apply, not a backend-enforced restriction baked into the endpoint —
 * the first two tests below demonstrate this precisely. There is also no
 * archive transition or acknowledgement-recording HTTP endpoint anywhere
 * (confirmed by grep) — those two tests exercise the model/pivot/DB layer
 * directly.
 */
class MediclaimRuleBookVersioningTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function filtering_by_published_status_excludes_a_draft_rule_book(): void
    {
        $actor = $this->makeUser('Employee-ish Reader');
        $this->grant($actor, ['mediclaim.rule_book.read']);

        $published = MediclaimRuleBook::create(['company_code' => 'nidhi-impex', 'version_label' => 'v1', 'status' => 'published']);
        $draft = MediclaimRuleBook::create(['company_code' => 'nidhi-impex', 'version_label' => 'v2-draft', 'status' => 'draft']);

        $response = $this->actingAsUser($actor)
            ->getJson('/api/v1/mediclaim/rule-books?status=published')
            ->assertOk();

        $response->assertJsonFragment(['id' => $published->id]);
        $ids = array_column($response->json('data'), 'id');
        $this->assertNotContains($draft->id, $ids);
    }

    #[Test]
    public function without_a_status_filter_every_status_is_returned_this_is_a_client_convention_not_a_backend_restriction(): void
    {
        $actor = $this->makeUser('Reader');
        $this->grant($actor, ['mediclaim.rule_book.read']);

        $published = MediclaimRuleBook::create(['company_code' => 'nidhi-impex', 'version_label' => 'v1', 'status' => 'published']);
        $draft = MediclaimRuleBook::create(['company_code' => 'nidhi-impex', 'version_label' => 'v2-draft', 'status' => 'draft']);

        $response = $this->actingAsUser($actor)
            ->getJson('/api/v1/mediclaim/rule-books')
            ->assertOk();

        $ids = array_column($response->json('data'), 'id');
        $this->assertContains($published->id, $ids);
        $this->assertContains($draft->id, $ids, 'Confirms the endpoint does not automatically hide drafts without an explicit status filter.');
    }

    #[Test]
    public function acknowledgement_is_recorded_with_ip_and_timestamp(): void
    {
        $ruleBook = MediclaimRuleBook::create(['company_code' => 'nidhi-impex', 'version_label' => 'v1', 'status' => 'published']);
        $employee = $this->makeUser('Employee');

        $ruleBook->acknowledgedBy()->attach($employee->id, [
            'acknowledged_at' => now(),
            'ip_address' => '127.0.0.1',
            'user_agent' => 'PHPUnit test agent',
        ]);

        $this->assertDatabaseHas('mediclaim_rule_book_acknowledgements', [
            'rule_book_id' => $ruleBook->id,
            'user_id' => $employee->id,
            'ip_address' => '127.0.0.1',
        ]);

        $row = DB::table('mediclaim_rule_book_acknowledgements')
            ->where('rule_book_id', $ruleBook->id)->where('user_id', $employee->id)->first();
        $this->assertNotNull($row->acknowledged_at);
    }

    #[Test]
    public function an_archived_version_remains_readable_by_hr_even_though_excluded_from_a_published_only_filter(): void
    {
        $hr = $this->makeUser('HR', ['role' => 1]);
        $this->grant($hr, ['mediclaim.rule_book.read']);

        $archived = MediclaimRuleBook::create(['company_code' => 'nidhi-impex', 'version_label' => 'v0-old', 'status' => 'archived']);

        $publishedOnly = $this->actingAsUser($hr)->getJson('/api/v1/mediclaim/rule-books?status=published')->assertOk();
        $this->assertNotContains($archived->id, array_column($publishedOnly->json('data'), 'id'));

        $archivedFilter = $this->actingAsUser($hr)->getJson('/api/v1/mediclaim/rule-books?status=archived')->assertOk();
        $this->assertContains($archived->id, array_column($archivedFilter->json('data'), 'id'));
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-rulebook-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCRB{$number}",
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
