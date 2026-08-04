<?php

namespace Tests\Feature;

use App\Mail\PortalOtpMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * The email-OTP password reset (POST /new{data}, type 1 → 2 → 3).
 *
 * Step 1 emails a 6-digit OTP and stores only its hash (with an expiry, an
 * attempt counter and a verified flag) on the row. Step 2 checks the submitted
 * code against that hash and marks the reset verified. Step 3,
 * setNewPasswordAfterVerification(), refuses to change the password until the
 * OTP has been verified — the code mailed to the owner is required, not just
 * the existence of a pending reset.
 *
 * The route is public and throttled at 15/min.
 */
class PasswordResetOtpTest extends TestCase
{
    use RefreshDatabase;

    private function employee(string $email = 'victim@test.local'): User
    {
        return User::create([
            'name' => 'Victim', 'email' => $email, 'password' => 'original-password',
            'role' => 3, 'company_code' => 'nidhi-impex', 'emp_code' => 'V1',
            'status' => 0, 'is_deleted' => 0,
        ]);
    }

    private function resetPassword(array $payload)
    {
        return $this->postJson('/api/new-password', $payload);
    }

    public function test_the_full_intended_flow_works(): void
    {
        Mail::fake();
        $user = $this->employee();

        $this->postJson('/api/new-email', ['email' => $user->email, 'type' => 1])
            ->assertOk();

        $otp = null;
        Mail::assertSent(PortalOtpMail::class, function (PortalOtpMail $mail) use (&$otp) {
            $otp = $mail->otp;

            return true;
        });
        $this->assertNotNull($otp, 'step 1 did not email an OTP');

        $this->postJson('/api/new-email-otp', ['email' => $user->email, 'otp' => $otp, 'type' => 2])
            ->assertOk();

        $this->resetPassword(['email' => $user->email, 'password' => 'chosen-by-owner', 'type' => 3])
            ->assertOk();

        $this->assertTrue(Hash::check('chosen-by-owner', $user->fresh()->password));
    }

    public function test_step_three_requires_a_verified_otp(): void
    {
        Mail::fake();
        $user = $this->employee();

        // Anyone may trigger this: the endpoint is public and takes only an
        // email address. The code goes to the account owner's inbox.
        $this->postJson('/api/new-email', ['email' => $user->email, 'type' => 1])->assertOk();

        // Step 2 is skipped, so no OTP has been verified for this reset.
        $response = $this->resetPassword([
            'email' => $user->email,
            'password' => 'attacker-chosen',
            'type' => 3,
        ]);

        $response->assertStatus(422);

        $this->assertTrue(
            Hash::check('original-password', $user->fresh()->password),
            'the password was changed without a verified OTP'
        );
    }

    public function test_an_incorrect_code_is_refused_at_step_three(): void
    {
        Mail::fake();
        $user = $this->employee();
        $this->postJson('/api/new-email', ['email' => $user->email, 'type' => 1])->assertOk();

        // No OTP has been verified, so an unverified reset is refused.
        $this->resetPassword([
            'email' => $user->email,
            'otp' => '000000',
            'password' => 'attacker-chosen',
            'type' => 3,
        ])->assertStatus(422);

        $this->assertTrue(Hash::check('original-password', $user->fresh()->password));
    }

    public function test_step_two_does_check_the_code(): void
    {
        Mail::fake();
        $user = $this->employee();
        $this->postJson('/api/new-email', ['email' => $user->email, 'type' => 1])->assertOk();

        // Step 2 is implemented correctly — which is what makes step 3's
        // omission easy to miss when reading the flow.
        $this->postJson('/api/new-email-otp', [
            'email' => $user->email, 'otp' => '000000', 'type' => 2,
        ])->assertStatus(422);
    }

    public function test_a_reset_without_any_pending_otp_is_refused(): void
    {
        $user = $this->employee();

        // The single check that does exist: some OTP must be outstanding.
        $this->resetPassword(['email' => $user->email, 'password' => 'attacker-chosen', 'type' => 3])
            ->assertStatus(422);

        $this->assertTrue(Hash::check('original-password', $user->fresh()->password));
    }
}
