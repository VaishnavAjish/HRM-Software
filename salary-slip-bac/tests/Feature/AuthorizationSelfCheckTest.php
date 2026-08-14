<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\PermissionRegistrySeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * S5 self-check endpoints (/api/v1/authorization/check, check-batch).
 *
 * They stay JWT-authenticated but intentionally do NOT require self.profile.read
 * (that would be circular — the client needs them to learn its own grants).
 * They evaluate only the caller, cap the batch, are throttled, and never persist
 * a decision-log row.
 *
 * Runs on the disposable database only (see phpunit.disposable.xml).
 */
class AuthorizationSelfCheckTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RbacSeeder::class);
        $this->seed(PermissionRegistrySeeder::class);
    }

    private function user(int $tier = 3): User
    {
        return User::create([
            'name' => 'S' . Str::random(5),
            'email' => Str::lower(Str::random(10)) . '@selfcheck.test',
            'password' => 'x',
            'role' => $tier,
            'company_code' => 'nidhi-impex',
            'emp_code' => strtoupper(Str::random(8)),
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }

    public function test_check_requires_authentication(): void
    {
        $this->postJson('/api/v1/authorization/check', ['permissionCode' => 'self.profile.read'])
            ->assertUnauthorized();

        $this->postJson('/api/v1/authorization/check-batch', ['checks' => [['permissionCode' => 'self.profile.read']]])
            ->assertUnauthorized();
    }

    public function test_check_batch_rejects_more_than_25_checks(): void
    {
        $user = $this->user();
        $checks = array_map(fn () => ['permissionCode' => 'self.profile.read'], range(1, 26));

        $this->withToken(auth('api')->login($user))
            ->postJson('/api/v1/authorization/check-batch', ['checks' => $checks])
            ->assertStatus(422);
    }

    public function test_check_batch_allows_exactly_25_checks(): void
    {
        $user = $this->user();
        $checks = array_map(fn () => ['permissionCode' => 'self.profile.read'], range(1, 25));

        $this->withToken(auth('api')->login($user))
            ->postJson('/api/v1/authorization/check-batch', ['checks' => $checks])
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_check_evaluates_only_the_caller_ignoring_a_supplied_subject(): void
    {
        // A super admin exists whose identity an attacker might try to borrow.
        User::create([
            'name' => 'Root', 'email' => 'selfcheck-root@test.local',
            'password' => 'x', 'role' => 0, 'company_code' => 'nidhi-impex',
            'status' => 0, 'is_deleted' => 0,
        ]);

        // The caller is an ordinary employee with no admin grant.
        $user = $this->user(3);

        $response = $this->withToken(auth('api')->login($user))
            ->postJson('/api/v1/authorization/check', [
                'permissionCode' => 'admin.user.create',
                // These must be ignored — the endpoint only ever evaluates the caller.
                'subjectId' => 1,
                'context' => ['audit' => true],
            ])
            ->assertOk();

        $this->assertFalse(
            (bool) $response->json('data.allowed'),
            'The self-check must evaluate the caller, never a supplied subject.'
        );
    }

    public function test_check_persists_no_decision_log_row(): void
    {
        if (! Schema::hasTable('authorization_decision_logs')) {
            $this->markTestSkipped('authorization_decision_logs table absent.');
        }

        $user = $this->user();
        $before = DB::table('authorization_decision_logs')->count();

        $this->withToken(auth('api')->login($user))
            ->postJson('/api/v1/authorization/check', ['permissionCode' => 'self.profile.read'])
            ->assertOk();

        $this->withToken(auth('api')->login($user))
            ->postJson('/api/v1/authorization/check-batch', [
                'checks' => [
                    ['permissionCode' => 'self.profile.read'],
                    ['permissionCode' => 'admin.user.create'],
                ],
            ])
            ->assertOk();

        $this->assertSame(
            $before,
            DB::table('authorization_decision_logs')->count(),
            'Self-checks must not write decision-log rows.'
        );
    }

    public function test_self_check_routes_are_throttled(): void
    {
        $middlewareFor = function (string $uri, string $method): array {
            foreach (Route::getRoutes() as $route) {
                if ($route->uri() === $uri && in_array($method, $route->methods(), true)) {
                    return $route->gatherMiddleware();
                }
            }

            return [];
        };

        $hasThrottle = fn (array $mw) => (bool) array_filter($mw, fn ($m) => is_string($m) && str_starts_with($m, 'throttle:'));

        $check = $middlewareFor('api/v1/authorization/check', 'POST');
        $batch = $middlewareFor('api/v1/authorization/check-batch', 'POST');

        $this->assertTrue($hasThrottle($check), 'check must be throttled.');
        $this->assertTrue($hasThrottle($batch), 'check-batch must be throttled.');
        $this->assertContains('throttle:60,1', $check);
        $this->assertContains('throttle:20,1', $batch);
    }
}
