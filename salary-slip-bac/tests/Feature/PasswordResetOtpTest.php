<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Sms\Fast2SmsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * The mobile-OTP password reset (POST /new{data}, type 1 → 2 → 3), delivered
 * via Fast2SMS.
 *
 * Step 1 sends a 6-digit OTP to the employee's on-file mobile number and
 * stores only its hash (with an expiry, an attempt counter and a verified
 * flag) on the row. Step 2 checks the submitted code against that hash and
 * marks the reset verified. Step 3, setNewPasswordAfterVerification(),
 * refuses to change the password until the OTP has been verified — the code
 * texted to the owner is required, not just the existence of a pending
 * reset.
 *
 * The route is public and throttled at 15/min.
 */
class PasswordResetOtpTest extends TestCase
{
    use RefreshDatabase;

    private function employee(string $mobile = '9812345670'): User
    {
        return User::create([
            'name' => 'Victim', 'email' => 'victim@test.local', 'password' => 'original-password',
            'role' => 3, 'company_code' => 'nidhi-impex', 'emp_code' => 'V1',
            'mobile_number' => $mobile,
            'status' => 0, 'is_deleted' => 0,
        ]);
    }

    /** Fast2SmsService::sendOtp() is a real HTTP call — every test stubs it instead of hitting the provider. */
    private function fakeSmsDelivery(bool $delivered = true): void
    {
        $this->mock(Fast2SmsService::class, function ($mock) use ($delivered) {
            $mock->shouldReceive('sendOtp')->andReturn($delivered);
        });
    }

    private function resetPassword(array $payload)
    {
        return $this->postJson('/api/new-password', $payload);
    }

    public function test_the_full_intended_flow_works(): void
    {
        $user = $this->employee();
        $otp = $this->requestAndCaptureOtp($user, 'full-flow');

        $this->postJson('/api/new-mobile-otp', ['mobile' => $user->mobile_number, 'otp' => $otp, 'type' => 2])
            ->assertOk();

        $this->resetPassword(['mobile' => $user->mobile_number, 'password' => 'chosen-by-owner', 'type' => 3])
            ->assertOk();

        $this->assertTrue(Hash::check('chosen-by-owner', $user->fresh()->password));
    }

    /**
     * Fast2SmsService is mocked, so the OTP never leaves the process — capture
     * it via a mock that records the code it was asked to send.
     */
    private function requestAndCaptureOtp(User $user, string $label): string
    {
        $captured = null;
        $this->mock(Fast2SmsService::class, function ($mock) use (&$captured) {
            $mock->shouldReceive('sendOtp')->andReturnUsing(function ($mobile, $otp) use (&$captured) {
                $captured = $otp;

                return true;
            });
        });

        $this->postJson('/api/new-mobile', ['mobile' => $user->mobile_number, 'type' => 1])->assertOk();

        $this->assertNotNull($captured, "step 1 ($label) did not attempt an SMS send");

        return $captured;
    }

    public function test_step_three_requires_a_verified_otp(): void
    {
        $user = $this->employee();
        $otp = $this->requestAndCaptureOtp($user, 'unverified');

        // Step 2 is skipped, so no OTP has been verified for this reset.
        $response = $this->resetPassword([
            'mobile' => $user->mobile_number,
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
        $user = $this->employee();
        $this->requestAndCaptureOtp($user, 'wrong-code-at-step-three');

        // No OTP has been verified, so an unverified reset is refused.
        $this->resetPassword([
            'mobile' => $user->mobile_number,
            'otp' => '000000',
            'password' => 'attacker-chosen',
            'type' => 3,
        ])->assertStatus(422);

        $this->assertTrue(Hash::check('original-password', $user->fresh()->password));
    }

    public function test_step_two_does_check_the_code(): void
    {
        $user = $this->employee();
        $this->requestAndCaptureOtp($user, 'wrong-code-at-step-two');

        // Step 2 is implemented correctly — which is what makes step 3's
        // omission easy to miss when reading the flow.
        $this->postJson('/api/new-mobile-otp', [
            'mobile' => $user->mobile_number, 'otp' => '000000', 'type' => 2,
        ])->assertStatus(422);
    }

    public function test_a_reset_without_any_pending_otp_is_refused(): void
    {
        $user = $this->employee();

        // The single check that does exist: some OTP must be outstanding.
        $this->resetPassword(['mobile' => $user->mobile_number, 'password' => 'attacker-chosen', 'type' => 3])
            ->assertStatus(422);

        $this->assertTrue(Hash::check('original-password', $user->fresh()->password));
    }

    public function test_a_failed_sms_send_returns_an_error_and_never_leaks_the_otp(): void
    {
        $this->fakeSmsDelivery(delivered: false);
        $user = $this->employee();

        $response = $this->postJson('/api/new-mobile', ['mobile' => $user->mobile_number, 'type' => 1]);

        $response->assertStatus(500);
        $response->assertJsonMissingPath('dev_otp');
        $this->assertNull($user->fresh()->otp, 'an OTP was persisted even though delivery failed');
    }
}
