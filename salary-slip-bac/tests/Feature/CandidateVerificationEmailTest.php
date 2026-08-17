<?php

namespace Tests\Feature;

use App\Mail\CandidateVerifyEmailMail;
use App\Models\CandidateAccount;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Root cause of the "no verification email" report: FRONTEND_URL was unset,
 * so CandidateAuthController silently skipped Mail::send() and registration
 * still returned success. These tests cover the recovery path added for it
 * (resend-verification) and the guardrails around it.
 */
class CandidateVerificationEmailTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('services.frontend_url', 'https://careers.test');
        // The 'candidate-resend' rate limiter persists in the cache store
        // across tests in this process (CACHE_STORE=array is process-wide,
        // not per-test) — flush so tests don't leak throttle state into
        // each other via a shared "jane@example.com".
        Cache::flush();
    }

    private function unverifiedAccount(string $email = 'jane@example.com'): CandidateAccount
    {
        return CandidateAccount::create([
            'name' => 'Jane Candidate',
            'email' => $email,
            'password' => Hash::make('password123'),
        ]);
    }

    #[Test]
    public function resend_sends_a_fresh_verification_email_for_an_unverified_account(): void
    {
        Mail::fake();
        $this->unverifiedAccount();

        $response = $this->postJson('/api/candidate/auth/resend-verification', ['email' => 'jane@example.com']);

        $response->assertOk()->assertExactJson([
            'status' => true,
            'message' => 'If the account exists and requires verification, a verification email has been sent.',
        ]);
        Mail::assertSent(CandidateVerifyEmailMail::class, fn ($mail) => $mail->hasTo('jane@example.com'));
    }

    #[Test]
    public function resend_response_is_identical_for_an_unknown_email(): void
    {
        Mail::fake();

        $response = $this->postJson('/api/candidate/auth/resend-verification', ['email' => 'nobody@example.com']);

        $response->assertOk()->assertExactJson([
            'status' => true,
            'message' => 'If the account exists and requires verification, a verification email has been sent.',
        ]);
        Mail::assertNothingSent();
    }

    #[Test]
    public function resend_does_not_email_an_already_verified_account(): void
    {
        Mail::fake();
        $account = $this->unverifiedAccount('verified@example.com');
        $account->update(['email_verified_at' => now()]);

        $response = $this->postJson('/api/candidate/auth/resend-verification', ['email' => 'verified@example.com']);

        $response->assertOk()->assertExactJson([
            'status' => true,
            'message' => 'If the account exists and requires verification, a verification email has been sent.',
        ]);
        Mail::assertNothingSent();
    }

    #[Test]
    public function resending_invalidates_the_previous_verification_token(): void
    {
        Mail::fake();
        $account = $this->unverifiedAccount();
        $originalTokenHash = $account->verification_token;

        $this->postJson('/api/candidate/auth/resend-verification', ['email' => 'jane@example.com'])->assertOk();

        $this->assertNotEquals($originalTokenHash, $account->fresh()->verification_token);

        $capturedUrl = null;
        Mail::assertSent(CandidateVerifyEmailMail::class, function ($mail) use (&$capturedUrl) {
            $capturedUrl = $mail->verifyUrl;
            return true;
        });
        parse_str((string) parse_url($capturedUrl, PHP_URL_QUERY), $query);

        $this->postJson('/api/candidate/auth/verify-email', [
            'email' => 'jane@example.com',
            'token' => $query['token'],
        ])->assertOk()->assertJson(['status' => true]);
    }

    #[Test]
    public function expired_verification_token_is_rejected(): void
    {
        $account = $this->unverifiedAccount();

        // The raw token isn't retrievable once hashed, so send one via
        // resend, then age it out before attempting to verify with it.
        Mail::fake();
        $this->postJson('/api/candidate/auth/resend-verification', ['email' => 'jane@example.com'])->assertOk();

        $capturedUrl = null;
        Mail::assertSent(CandidateVerifyEmailMail::class, function ($mail) use (&$capturedUrl) {
            $capturedUrl = $mail->verifyUrl;
            return true;
        });
        parse_str((string) parse_url($capturedUrl, PHP_URL_QUERY), $query);

        $account->update(['verification_token_expires_at' => now()->subMinute()]);

        $response = $this->postJson('/api/candidate/auth/verify-email', [
            'email' => 'jane@example.com',
            'token' => $query['token'],
        ]);

        $response->assertStatus(422)->assertJson(['status' => false, 'message' => 'Verification token has expired.']);
    }

    #[Test]
    public function a_used_verification_token_cannot_be_replayed(): void
    {
        Mail::fake();
        $this->unverifiedAccount();
        $this->postJson('/api/candidate/auth/resend-verification', ['email' => 'jane@example.com'])->assertOk();

        $capturedUrl = null;
        Mail::assertSent(CandidateVerifyEmailMail::class, function ($mail) use (&$capturedUrl) {
            $capturedUrl = $mail->verifyUrl;
            return true;
        });
        parse_str((string) parse_url($capturedUrl, PHP_URL_QUERY), $query);
        $payload = ['email' => 'jane@example.com', 'token' => $query['token']];

        $this->postJson('/api/candidate/auth/verify-email', $payload)->assertOk()->assertJson(['status' => true]);

        $replay = $this->postJson('/api/candidate/auth/verify-email', $payload);
        $replay->assertStatus(422)->assertJson(['status' => false]);
    }

    #[Test]
    public function invalid_token_is_rejected(): void
    {
        $this->unverifiedAccount();

        $response = $this->postJson('/api/candidate/auth/verify-email', [
            'email' => 'jane@example.com',
            'token' => 'not-the-real-token',
        ]);

        $response->assertStatus(422)->assertJson(['status' => false]);
    }

    #[Test]
    public function candidate_can_login_immediately_after_verification_without_being_blocked(): void
    {
        Mail::fake();
        $this->unverifiedAccount();
        $this->postJson('/api/candidate/auth/resend-verification', ['email' => 'jane@example.com'])->assertOk();

        $capturedUrl = null;
        Mail::assertSent(CandidateVerifyEmailMail::class, function ($mail) use (&$capturedUrl) {
            $capturedUrl = $mail->verifyUrl;
            return true;
        });
        parse_str((string) parse_url($capturedUrl, PHP_URL_QUERY), $query);
        $this->postJson('/api/candidate/auth/verify-email', ['email' => 'jane@example.com', 'token' => $query['token']])->assertOk();

        $response = $this->postJson('/api/candidate/auth/login', ['email' => 'jane@example.com', 'password' => 'password123']);

        $response->assertOk()->assertJson(['status' => true]);
    }

    #[Test]
    public function resend_is_rate_limited_per_email(): void
    {
        Mail::fake();
        $this->unverifiedAccount();

        $this->postJson('/api/candidate/auth/resend-verification', ['email' => 'jane@example.com'])->assertOk();
        $second = $this->postJson('/api/candidate/auth/resend-verification', ['email' => 'jane@example.com']);

        $second->assertStatus(429);
    }

    #[Test]
    public function resend_fails_loudly_when_frontend_url_is_not_configured(): void
    {
        Config::set('services.frontend_url', null);
        Mail::fake();
        $this->unverifiedAccount();

        $response = $this->postJson('/api/candidate/auth/resend-verification', ['email' => 'jane@example.com']);

        $response->assertStatus(503)->assertJson(['status' => false]);
        Mail::assertNothingSent();
    }

    #[Test]
    public function verification_token_never_appears_in_the_resend_response(): void
    {
        Mail::fake();
        $this->unverifiedAccount();

        $response = $this->postJson('/api/candidate/auth/resend-verification', ['email' => 'jane@example.com']);

        $response->assertJsonMissingPath('verification_token');
    }
}
