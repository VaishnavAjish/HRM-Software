<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Admin\UserAccountService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * S4: every admin-initiated password change revokes tokens issued before it.
 *
 * JwtMiddleware rejects a token whose iat predates users.password_changed_at, so
 * stamping that column on a reset invalidates a stolen 30-day token immediately.
 * Verified through /api/v1/authorization/me, which is gated on jwt.auth alone so
 * the assertion isolates token validity from permission enforcement.
 *
 * Runs on the disposable database only (see phpunit.disposable.xml).
 */
class PasswordChangeRevocationTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(int $tier = 3): User
    {
        return User::create([
            'name' => 'P' . Str::random(5),
            'email' => Str::lower(Str::random(10)) . '@pwreset.test',
            'password' => 'OldPassword1',
            'role' => $tier,
            'company_code' => 'nidhi-impex',
            'emp_code' => strtoupper(Str::random(8)),
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }

    public function test_admin_reset_service_revokes_earlier_tokens(): void
    {
        $target = $this->makeUser();
        $actor = $this->makeUser(0); // super admin

        $oldToken = auth('api')->login($target);

        // The token is valid before the reset.
        $this->withToken($oldToken)->getJson('/api/v1/authorization/me')->assertOk();

        // Advance whole seconds so password_changed_at is strictly after iat.
        $this->travel(2)->minutes();
        app(UserAccountService::class)->resetPassword($target->fresh(), $actor->fresh(), 'BrandNewPass1', 'test reset');

        // The pre-reset token is now dead.
        $this->withToken($oldToken)->getJson('/api/v1/authorization/me')->assertUnauthorized();

        // A token issued after the reset works.
        $this->travel(1)->minutes();
        $newToken = auth('api')->login($target->fresh());
        $this->withToken($newToken)->getJson('/api/v1/authorization/me')->assertOk();
    }

    public function test_legacy_employee_update_password_change_revokes_earlier_tokens(): void
    {
        $target = $this->makeUser();
        $admin = $this->makeUser(0); // super admin bypasses permission + field guards

        $oldToken = auth('api')->login($target);
        $this->withToken($oldToken)->getJson('/api/v1/authorization/me')->assertOk();

        $this->travel(2)->minutes();

        $this->withToken(auth('api')->login($admin))
            ->putJson("/api/employee/edit/{$target->id}", [
                'name' => $target->name,
                'password' => 'ChangedByAdmin1',
            ])
            ->assertOk();

        $this->withToken($oldToken)->getJson('/api/v1/authorization/me')->assertUnauthorized();

        $this->travel(1)->minutes();
        $newToken = auth('api')->login($target->fresh());
        $this->withToken($newToken)->getJson('/api/v1/authorization/me')->assertOk();
    }

    public function test_legacy_update_without_password_change_keeps_tokens_valid(): void
    {
        $target = $this->makeUser();
        $admin = $this->makeUser(0);

        $token = auth('api')->login($target);
        $this->travel(2)->minutes();

        // An edit that does not touch the password must not revoke sessions, and
        // must not overwrite the stored hash with a blank one.
        $this->withToken(auth('api')->login($admin))
            ->putJson("/api/employee/edit/{$target->id}", [
                'name' => 'Renamed Person',
                'password' => '',
            ])
            ->assertOk();

        $this->withToken($token)->getJson('/api/v1/authorization/me')->assertOk();
        $this->assertNull($target->fresh()->password_changed_at, 'A no-password edit must not stamp password_changed_at.');
    }
}
