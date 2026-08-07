<?php

namespace Tests\Feature;

use App\Mail\PortalOtpMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class PasswordResetOtpSecurityTest extends TestCase
{
    use RefreshDatabase;

    private function employee(): User
    {
        return User::create([
            'name' => 'Reset Target', 'email' => 'reset-target@test.local',
            'password' => 'OldPassword123', 'role' => 3, 'company_code' => 'nidhi-impex',
            'status' => 0, 'is_deleted' => 0,
        ]);
    }

    private function challenge(User $user, string $otp, array $overrides = []): void
    {
        $user->otp = json_encode(array_merge([
            'hash' => Hash::make($otp),
            'expires_at' => now()->addMinutes(10)->toISOString(),
            'attempts' => 0,
            'verified' => false,
        ], $overrides));
        $user->save();
    }

    /** The endpoint dispatches on `type`: 1 = request, 2 = verify, 3 = set password. */
    private function send(array $payload)
    {
        return $this->postJson('/api/newreset', $payload);
    }

    private function requestOtp(string $email)
    {
        return $this->send(['type' => 1, 'email' => $email]);
    }

    private function verifyOtp(string $email, string $otp)
    {
        return $this->send(['type' => 2, 'email' => $email, 'otp' => $otp]);
    }

    private function setPassword(string $email, string $password)
    {
        return $this->send(['type' => 3, 'email' => $email, 'password' => $password]);
    }

    public function test_the_mailer_is_not_the_log_transport(): void
    {
        $this->assertNotSame(
            'log',
            config('mail.default'),
            'MAIL_MAILER=log silently swallows every email. Recipients receive nothing.'
        );
    }

    public function test_the_config_check_command_rejects_the_log_transport(): void
    {
        config(['mail.default' => 'log']);

        $this->artisan('mail:config-check')->assertExitCode(1);
    }

    public function test_the_config_check_command_accepts_a_delivering_transport(): void
    {
        config([
            'mail.default' => 'smtp',
            'mail.from.address' => 'admin@niss.pro',
            'mail.mailers.smtp.host' => 'smtp.example.com',
            'mail.mailers.smtp.port' => 587,
            'mail.mailers.smtp.username' => 'admin@niss.pro',
            'mail.mailers.smtp.password' => 'secret',
        ]);

        $this->artisan('mail:config-check')->assertExitCode(0);
    }

    public function test_an_unknown_address_is_indistinguishable_from_a_known_one(): void
    {
        Mail::fake();
        $user = $this->employee();

        $known = $this->requestOtp($user->email);
        $unknown = $this->requestOtp('definitely-not-registered@test.local');

        $this->assertSame($known->status(), $unknown->status(), 'Status codes must match.');
        $this->assertSame(
            $known->json('message'),
            $unknown->json('message'),
            'Reply bodies must match or the endpoint is an address oracle.'
        );
        $this->assertSame(
            array_keys($known->json()),
            array_keys($unknown->json()),
            'Response shape must match.'
        );
    }

    public function test_no_mail_is_sent_for_an_unknown_address(): void
    {
        Mail::fake();

        $this->requestOtp('definitely-not-registered@test.local')->assertOk();

        Mail::assertNothingSent();
    }

    public function test_an_unknown_address_creates_no_challenge(): void
    {
        Mail::fake();

        $this->requestOtp('definitely-not-registered@test.local')->assertOk();

        $this->assertDatabaseMissing('users', ['email' => 'definitely-not-registered@test.local']);
    }

    public function test_the_config_gate_allowlists_rather_than_denylists(): void
    {
        foreach (['log', 'array', 'null', 'sendmail', 'postmark', ''] as $mailer) {
            config(['mail.default' => $mailer]);
            $this->artisan('mail:config-check')
                ->assertExitCode(1);
        }
    }

    public function test_a_delivery_failure_does_not_report_success(): void
    {
        $user = $this->employee();

        Mail::shouldReceive('to')->andThrow(new \RuntimeException('535 auth failed for admin@niss.pro'));

        $response = $this->requestOtp($user->email);

        $response->assertStatus(500);
        $this->assertStringNotContainsString('535', (string) $response->json('message'));
        $this->assertStringNotContainsString('admin@niss.pro', (string) $response->json('message'));
        $this->assertNull($user->fresh()->otp, 'No challenge should exist if the mail never went out.');
    }

    public function test_requesting_a_reset_sends_the_otp_mailable(): void
    {
        Mail::fake();
        $user = $this->employee();

        $this->requestOtp($user->email)->assertOk();

        Mail::assertSent(PortalOtpMail::class, fn ($mail) => $mail->hasTo($user->email));
    }

    public function test_the_otp_is_never_written_to_the_log(): void
    {
        Mail::fake();
        $user = $this->employee();

        $lines = [];
        Log::listen(function ($message) use (&$lines) {
            $lines[] = $message->message . ' ' . json_encode($message->context);
        });

        $this->requestOtp($user->email)->assertOk();

        $stored = json_decode($user->fresh()->otp, true);
        $this->assertNotNull($stored, 'A challenge should have been stored.');

        foreach ($lines as $line) {
            $this->assertDoesNotMatchRegularExpression(
                '/\b\d{6}\b/',
                $line,
                'A six-digit code must never reach the log: ' . $line
            );
        }
    }

    public function test_the_otp_is_stored_only_as_a_hash(): void
    {
        Mail::fake();
        $user = $this->employee();

        $this->requestOtp($user->email)->assertOk();

        $stored = json_decode($user->fresh()->otp, true);

        $this->assertArrayHasKey('hash', $stored);
        $this->assertArrayNotHasKey('otp', $stored);
        $this->assertArrayNotHasKey('code', $stored);
        $this->assertDoesNotMatchRegularExpression('/^\d{6}$/', (string) $stored['hash']);
    }

    public function test_an_expired_otp_is_refused(): void
    {
        $user = $this->employee();
        $this->challenge($user, '123456', ['expires_at' => now()->subMinute()->toISOString()]);

        $this->verifyOtp($user->email, '123456')
            ->assertStatus(422)
            ->assertJsonPath('message', 'OTP expired. Please request a new one.');
    }

    public function test_a_wrong_otp_increments_the_attempt_counter(): void
    {
        $user = $this->employee();
        $this->challenge($user, '123456');

        $this->verifyOtp($user->email, '000000')->assertStatus(422);

        $this->assertSame(1, json_decode($user->fresh()->otp, true)['attempts']);
    }

    public function test_the_challenge_locks_after_five_attempts(): void
    {
        $user = $this->employee();
        $this->challenge($user, '123456', ['attempts' => 5]);

        $this->verifyOtp($user->email, '123456')
            ->assertStatus(422)
            ->assertJsonPath('message', 'Too many attempts. Please request a new OTP.');
    }

    public function test_a_correct_otp_verifies(): void
    {
        $user = $this->employee();
        $this->challenge($user, '123456');

        $this->verifyOtp($user->email, '123456')
            ->assertOk()
            ->assertJsonPath('message', 'OTP verified');

        $this->assertTrue(json_decode($user->fresh()->otp, true)['verified']);
    }

    public function test_requesting_a_new_otp_invalidates_the_previous_one(): void
    {
        Mail::fake();
        $user = $this->employee();
        $this->challenge($user, '111111');

        $this->requestOtp($user->email)->assertOk();

        $this->verifyOtp($user->email, '111111')
            ->assertStatus(422)
            ->assertJsonPath('message', 'Invalid OTP');
    }

    public function test_the_challenge_is_cleared_once_the_password_is_set(): void
    {
        $user = $this->employee();
        $this->challenge($user, '123456', ['verified' => true]);

        $this->setPassword($user->email, 'BrandNewPassword123')->assertOk();

        $fresh = $user->fresh();

        $this->assertNull($fresh->otp, 'A consumed challenge must not survive the reset.');
        $this->assertTrue(Hash::check('BrandNewPassword123', $fresh->password));
    }

    public function test_a_consumed_otp_cannot_be_replayed(): void
    {
        $user = $this->employee();
        $this->challenge($user, '123456', ['verified' => true]);

        $this->setPassword($user->email, 'BrandNewPassword123')->assertOk();

        $this->verifyOtp($user->email, '123456')->assertStatus(422);
    }

    public function test_the_new_password_is_never_stored_in_plaintext(): void
    {
        $user = $this->employee();
        $this->challenge($user, '123456', ['verified' => true]);

        $this->setPassword($user->email, 'BrandNewPassword123')->assertOk();

        $this->assertNotSame('BrandNewPassword123', $user->fresh()->password);
    }

    public function test_a_password_cannot_be_set_without_verifying_first(): void
    {
        $user = $this->employee();
        $this->challenge($user, '123456');

        $this->setPassword($user->email, 'BrandNewPassword123')
            ->assertStatus(422);

        $this->assertTrue(Hash::check('OldPassword123', $user->fresh()->password));
    }
}
