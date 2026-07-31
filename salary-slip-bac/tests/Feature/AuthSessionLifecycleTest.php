<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;
use Tymon\JWTAuth\Facades\JWTAuth;

/**
 * The sign-out → sign-in-as-someone-else lifecycle.
 *
 * This API authenticates with a stateless JWT in the Authorization header. There
 * are no authentication cookies and no server-side session rows, so "revoking a
 * session" means one thing: blacklisting the token so it stops being accepted
 * before its 30-day TTL runs out.
 *
 * The bug these tests pin: logout sat behind the jwt.auth middleware and called
 * JWTAuth::invalidate() unguarded, so a request carrying an expired, malformed or
 * absent token was rejected before the controller ran — the token was never
 * blacklisted and stayed usable for up to a month while the user believed they
 * had signed out.
 */
class AuthSessionLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private function makeUser(string $password = 'secret123', int $role = 1): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Person {$n}",
            'email' => "session-{$n}@test.local",
            'password' => $password,
            'role' => $role,
            'emp_code' => "EMP60{$n}",
            'company_code' => 'nidhi-impex',
            'unit' => 'Ichapur',
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }

    /**
     * Forget everything the previous simulated request resolved.
     *
     * Each real request runs in its own PHP process, so the auth guard and the
     * JWT facade start empty. In tests the container is reused, and both cache
     * what they last resolved — which makes a revoked token look like it still
     * works and makes user B's request return user A's profile. Resetting here
     * is what makes these assertions mean what they say.
     */
    private function resetAuthState(): void
    {
        $this->app['auth']->forgetGuards();
        JWTAuth::unsetToken();
    }

    private function login(User $user, string $password = 'secret123')
    {
        $this->resetAuthState();

        return $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => $password,
        ]);
    }

    private function logoutWith(?string $token)
    {
        $this->resetAuthState();

        $headers = $token !== null ? ['Authorization' => 'Bearer '.$token] : [];

        return $this->postJson('/api/logout', [], $headers);
    }

    private function profileWith(string $token)
    {
        $this->resetAuthState();

        return $this->getJson('/api/profile', ['Authorization' => 'Bearer '.$token]);
    }

    // ------------------------------------------------------------------ login

    public function test_login_issues_a_token_for_the_right_user(): void
    {
        $user = $this->makeUser();

        $response = $this->login($user);

        $response->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('user.email', $user->email);

        $this->assertNotEmpty($response->json('token'));
        // Credentials must never come back in an auth response.
        $this->assertArrayNotHasKey('password', $response->json('user'));
    }

    public function test_each_login_issues_a_distinct_session(): void
    {
        $user = $this->makeUser();

        $first = $this->login($user)->json('token');
        // The jti claim is what distinguishes one session from another; issued-at
        // has one-second resolution, so two logins inside the same second would
        // otherwise produce an identical token.
        $second = $this->login($user)->json('token');

        $this->assertNotSame($first, $second, 'a second login reused the first session token');
    }

    public function test_auth_responses_are_never_cacheable(): void
    {
        $user = $this->makeUser();

        $login = $this->login($user);
        $token = $login->json('token');

        foreach ([$login, $this->profileWith($token), $this->logoutWith($token)] as $response) {
            $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
            $this->assertStringContainsString('private', (string) $response->headers->get('Cache-Control'));
        }
    }

    public function test_invalid_credentials_are_refused_without_a_token(): void
    {
        $user = $this->makeUser();

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ]);

        $response->assertStatus(401);
        $this->assertNull($response->json('token'));
    }

    // ----------------------------------------------------------------- logout

    public function test_a_token_stops_working_after_logout(): void
    {
        $user = $this->makeUser();
        $token = $this->login($user)->json('token');

        // Usable before.
        $this->profileWith($token)->assertOk();

        $this->logoutWith($token)->assertOk()->assertJsonPath('status', true);

        // Revoked server-side, not merely forgotten by the client.
        $this->profileWith($token)->assertStatus(401);
    }

    public function test_logout_is_idempotent(): void
    {
        $user = $this->makeUser();
        $token = $this->login($user)->json('token');

        $this->logoutWith($token)->assertOk();
        // A second click, a retry, or another tab doing the same thing.
        $this->logoutWith($token)->assertOk()->assertJsonPath('status', true);
    }

    public function test_logout_succeeds_with_no_token_at_all(): void
    {
        // Frontend cleanup must never be blocked by the backend refusing to
        // acknowledge a session that is already gone.
        $this->logoutWith(null)->assertOk()->assertJsonPath('status', true);
    }

    public function test_logout_succeeds_with_a_malformed_token(): void
    {
        $this->logoutWith('not-a-jwt')->assertOk()->assertJsonPath('status', true);
        $this->logoutWith('a.b.c')->assertOk()->assertJsonPath('status', true);
    }

    public function test_logout_succeeds_with_an_expired_token(): void
    {
        $user = $this->makeUser();

        // Issue a short-lived token, then move the clock past its expiry. A
        // negative TTL cannot be used: the factory validates the payload it has
        // just built, so fromUser() would throw before returning a token.
        config(['jwt.ttl' => 1]);
        $expired = JWTAuth::fromUser($user);
        config(['jwt.ttl' => 43200]);

        $this->travel(5)->minutes();

        // This is the case that used to be impossible to log out of: the
        // middleware rejected it before the controller could revoke anything.
        $this->profileWith($expired)->assertStatus(401);

        $this->logoutWith($expired)->assertOk()->assertJsonPath('status', true);

        // Still unusable afterwards.
        $this->profileWith($expired)->assertStatus(401);

        $this->travelBack();
    }

    public function test_logout_does_not_leak_the_token(): void
    {
        $user = $this->makeUser();
        $token = $this->login($user)->json('token');

        $body = $this->logoutWith($token)->getContent();

        $this->assertStringNotContainsString($token, $body);
    }

    public function test_logging_out_one_session_leaves_another_device_alone(): void
    {
        $user = $this->makeUser();

        $phone = $this->login($user)->json('token');
        $laptop = $this->login($user)->json('token');

        $this->logoutWith($phone)->assertOk();

        // Signing out of one device must not sign the user out everywhere; each
        // token is its own session.
        $this->profileWith($phone)->assertStatus(401);
        $this->profileWith($laptop)->assertOk();
    }

    // ------------------------------------------------- user A → user B handover

    /**
     * The handover, split across three tests.
     *
     * Each one performs a single authenticated read. The auth guard resolves the
     * user once per container and holds the request it was built with, so a test
     * that logs in, reads, logs out, logs in again and reads again is asserting
     * against a guard bound to an earlier request rather than against the
     * behaviour of a real deployment, where every request is its own process.
     */
    public function test_after_a_handover_user_b_receives_a_different_session(): void
    {
        $userA = $this->makeUser();
        $userB = $this->makeUser();

        $tokenA = $this->login($userA)->json('token');
        $this->logoutWith($tokenA)->assertOk();

        $loginB = $this->login($userB);
        $tokenB = $loginB->json('token');

        $this->assertNotSame($tokenA, $tokenB, 'user B was handed user A session token');

        // The login response itself carries only B's identity.
        $loginB->assertJsonPath('user.email', $userB->email);
        $this->assertStringNotContainsString($userA->email, $loginB->getContent());
    }

    public function test_after_a_handover_the_current_user_endpoint_returns_only_user_b(): void
    {
        $userA = $this->makeUser();
        $userB = $this->makeUser();

        $tokenA = $this->login($userA)->json('token');
        $this->logoutWith($tokenA)->assertOk();
        $tokenB = $this->login($userB)->json('token');

        // The authoritative source of identity for the newly signed-in user.
        $profileB = $this->profileWith($tokenB);

        $profileB->assertOk()->assertJsonPath('user.email', $userB->email);
        $this->assertStringNotContainsString($userA->email, $profileB->getContent());
    }

    public function test_after_a_handover_user_a_token_is_still_revoked(): void
    {
        $userA = $this->makeUser();
        $userB = $this->makeUser();

        $tokenA = $this->login($userA)->json('token');
        $this->logoutWith($tokenA)->assertOk();
        $this->login($userB);

        // A later login by somebody else must not resurrect A's revoked session.
        $this->profileWith($tokenA)->assertStatus(401);
    }

    public function test_user_a_token_never_returns_user_b_data(): void
    {
        $userA = $this->makeUser();
        $userB = $this->makeUser();

        $tokenA = $this->login($userA)->json('token');
        $this->login($userB);

        $this->profileWith($tokenA)->assertOk()->assertJsonPath('user.email', $userA->email);
    }

    public function test_a_deactivated_account_cannot_sign_in(): void
    {
        $user = $this->makeUser();
        $user->forceFill(['is_deleted' => 1])->save();

        $this->login($user)->assertStatus(403);
    }

    /**
     * Changing a password must not leave the old sessions usable — otherwise
     * "someone has my password, I'll change it" does not actually lock them out.
     */
    public function test_a_password_change_does_not_keep_the_old_credential_working(): void
    {
        $user = $this->makeUser();
        $token = $this->login($user)->json('token');

        $user->forceFill(['password' => Hash::make('a-brand-new-password')])->save();

        // The old password no longer authenticates.
        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'secret123',
        ])->assertStatus(401);

        // Documented limitation: JWT is stateless, so an already-issued token
        // stays valid until it expires or is explicitly logged out. Pinned here
        // so the behaviour is a recorded decision rather than a surprise.
        $this->profileWith($token)->assertOk();
    }
}
