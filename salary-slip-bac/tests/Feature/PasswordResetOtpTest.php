<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * The email-OTP password reset (POST /new{data}, type 1 → 2 → 3).
 *
 * Step 3, setNewPasswordAfterVerification(), checks only that an OTP exists on
 * the row:
 *
 *     if (!$emp || !$emp->otp) { ...422... }
 *     $emp->password = $request->password;
 *
 * It never compares the submitted OTP against the stored one — and the React
 * client does not send one at that step either (setNewPassword posts just
 * { password, email, type: 3 }). The code is mailed to the account owner and
 * then never required, so possession of it is not actually part of the reset.
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

        $otp = $user->fresh()->otp;
        $this->assertNotNull($otp, 'step 1 did not store an OTP');

        $this->postJson('/api/new-email-otp', ['email' => $user->email, 'otp' => $otp, 'type' => 2])
            ->assertOk();

        $this->resetPassword(['email' => $user->email, 'password' => 'chosen-by-owner', 'type' => 3])
            ->assertOk();

        $this->assertTrue(Hash::check('chosen-by-owner', $user->fresh()->password));
    }

    public function test_step_three_does_not_require_the_code_that_was_emailed(): void
    {
        Mail::fake();
        $user = $this->employee();

        // Anyone may trigger this: the endpoint is public and takes only an
        // email address. The code goes to the account owner's inbox.
        $this->postJson('/api/new-email', ['email' => $user->email, 'type' => 1])->assertOk();

        // Step 2 is simply skipped, and no OTP is supplied here.
        $response = $this->resetPassword([
            'email' => $user->email,
            'password' => 'attacker-chosen',
            'type' => 3,
        ]);

        $response->assertOk();

        $this->assertTrue(
            Hash::check('attacker-chosen', $user->fresh()->password),
            'the password was NOT changed — step 3 verified the OTP after all'
        );
    }

    public function test_an_incorrect_code_is_accepted_at_step_three(): void
    {
        Mail::fake();
        $user = $this->employee();
        $this->postJson('/api/new-email', ['email' => $user->email, 'type' => 1])->assertOk();

        // Supplying a deliberately wrong OTP changes nothing, because the
        // value is not read at this step.
        $this->resetPassword([
            'email' => $user->email,
            'otp' => '0000',
            'password' => 'attacker-chosen',
            'type' => 3,
        ])->assertOk();

        $this->assertTrue(Hash::check('attacker-chosen', $user->fresh()->password));
    }

    public function test_step_two_does_check_the_code(): void
    {
        Mail::fake();
        $user = $this->employee();
        $this->postJson('/api/new-email', ['email' => $user->email, 'type' => 1])->assertOk();

        // Step 2 is implemented correctly — which is what makes step 3's
        // omission easy to miss when reading the flow.
        $this->postJson('/api/new-email-otp', [
            'email' => $user->email, 'otp' => '0000', 'type' => 2,
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
