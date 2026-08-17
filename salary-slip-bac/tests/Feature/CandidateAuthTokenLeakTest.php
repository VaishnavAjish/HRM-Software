<?php

namespace Tests\Feature;

use App\Mail\CandidateResetPasswordMail;
use App\Mail\CandidateVerifyEmailMail;
use App\Models\CandidateAccount;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * `register()` used to return the raw `verification_token` and
 * `forgotPassword()` the raw `reset_token` directly in the JSON body — a
 * caller could self-verify or hijack any account's password reset without
 * ever receiving the email. Both are now delivered by email only.
 */
class CandidateAuthTokenLeakTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('services.frontend_url', 'https://careers.test');
    }

    #[Test]
    public function register_does_not_return_the_verification_token(): void
    {
        Mail::fake();

        $response = $this->postJson('/api/candidate/auth/register', [
            'name' => 'Jane Candidate',
            'email' => 'jane@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertCreated();
        $response->assertJsonMissingPath('verification_token');
        $response->assertJsonStructure(['status', 'message', 'token', 'candidate']);

        Mail::assertSent(CandidateVerifyEmailMail::class, fn ($mail) => $mail->hasTo('jane@example.com')
            && str_contains($mail->verifyUrl, 'https://careers.test/careers/verify-email')
            && str_contains($mail->verifyUrl, 'token='));
    }

    #[Test]
    public function forgot_password_does_not_return_the_reset_token(): void
    {
        Mail::fake();

        $account = CandidateAccount::create([
            'name' => 'Jane Candidate', 'email' => 'jane2@example.com',
            'password' => Hash::make('password123'),
        ]);

        $response = $this->postJson('/api/candidate/auth/forgot-password', ['email' => 'jane2@example.com']);

        $response->assertOk();
        $response->assertJsonMissingPath('reset_token');
        $response->assertExactJson([
            'status' => true,
            'message' => 'If your email is registered, password reset instructions have been sent.',
        ]);

        Mail::assertSent(CandidateResetPasswordMail::class, fn ($mail) => $mail->hasTo($account->email)
            && str_contains($mail->resetUrl, 'https://careers.test/careers/reset-password')
            && str_contains($mail->resetUrl, 'token='));
    }

    #[Test]
    public function forgot_password_response_is_identical_for_an_unknown_email(): void
    {
        Mail::fake();

        $response = $this->postJson('/api/candidate/auth/forgot-password', ['email' => 'nobody@example.com']);

        $response->assertOk();
        $response->assertExactJson([
            'status' => true,
            'message' => 'If your email is registered, password reset instructions have been sent.',
        ]);

        Mail::assertNothingSent();
    }

    #[Test]
    public function a_candidate_can_complete_the_full_reset_flow_via_the_emailed_link(): void
    {
        Mail::fake();

        $account = CandidateAccount::create([
            'name' => 'Jane Candidate', 'email' => 'jane3@example.com',
            'password' => Hash::make('OldPassword123'),
        ]);

        $this->postJson('/api/candidate/auth/forgot-password', ['email' => 'jane3@example.com'])->assertOk();

        $capturedUrl = null;
        Mail::assertSent(CandidateResetPasswordMail::class, function ($mail) use (&$capturedUrl) {
            $capturedUrl = $mail->resetUrl;
            return true;
        });

        parse_str((string) parse_url($capturedUrl, PHP_URL_QUERY), $query);

        $this->postJson('/api/candidate/auth/reset-password', [
            'email' => $query['email'],
            'token' => $query['token'],
            'password' => 'NewPassword456',
            'password_confirmation' => 'NewPassword456',
        ])->assertOk()->assertJson(['status' => true]);

        $this->assertTrue(Hash::check('NewPassword456', $account->fresh()->password));
    }
}
