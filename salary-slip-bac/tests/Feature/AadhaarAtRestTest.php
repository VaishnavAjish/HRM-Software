<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Authorization\SchemaSupport;
use App\Support\AadhaarReference;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * That an ordinary write actually encrypts.
 *
 * The encryption columns, the cast, the masked accessor and setAadhaarNumber()
 * were all shipped, and production still holds 334 plaintext numbers with zero
 * encrypted, zero last_four and zero secure_reference. The reason is that
 * aadhar_card_no is fillable: every real write mass-assigned it and no code
 * path was obliged to call setAadhaarNumber(). Nothing failed, so nothing said
 * anything.
 *
 * These assert the derivation happens on the write everyone actually performs.
 */
class AadhaarAtRestTest extends TestCase
{
    use RefreshDatabase;

    private const AADHAAR = '123456789012';

    #[Test]
    public function mass_assignment_encrypts_and_derives(): void
    {
        $user = $this->makeUser(['aadhar_card_no' => self::AADHAAR]);

        $this->assertSame(self::AADHAAR, $user->fresh()->encrypted_aadhaar_number);
        $this->assertSame('9012', $user->fresh()->aadhaar_last_four);
        $this->assertNotNull($user->fresh()->aadhaar_secure_reference);
    }

    #[Test]
    public function the_stored_ciphertext_is_not_the_number(): void
    {
        $user = $this->makeUser(['aadhar_card_no' => self::AADHAAR]);

        $raw = \DB::table('users')->where('id', $user->id)->value('encrypted_aadhaar_number');

        $this->assertNotSame(self::AADHAAR, $raw, 'Column holds plaintext — the cast is not applied.');
        $this->assertStringNotContainsString(self::AADHAAR, (string) $raw);
    }

    #[Test]
    public function updating_an_existing_record_derives_too(): void
    {
        $user = $this->makeUser([]);
        $this->assertNull($user->aadhaar_last_four);

        $user->update(['aadhar_card_no' => self::AADHAAR]);

        $this->assertSame('9012', $user->fresh()->aadhaar_last_four);
        $this->assertSame(self::AADHAAR, $user->fresh()->encrypted_aadhaar_number);
    }

    #[Test]
    public function the_secure_reference_is_deterministic_and_does_not_contain_the_number(): void
    {
        $one = $this->makeUser(['aadhar_card_no' => self::AADHAAR])->fresh();
        $two = $this->makeUser(['aadhar_card_no' => self::AADHAAR])->fresh();

        $this->assertSame($one->aadhaar_secure_reference, $two->aadhaar_secure_reference);

        // Hash only. Not even the last four appear: the reference becomes a
        // storage prefix that reaches bucket listings, access logs and
        // presigned URLs.
        $this->assertStringNotContainsString('12345678', $one->aadhaar_secure_reference);
        $this->assertStringNotContainsString('9012', $one->aadhaar_secure_reference);
        $this->assertMatchesRegularExpression('/^AADHAAR_[0-9a-f]{16}$/', $one->aadhaar_secure_reference);
    }

    #[Test]
    public function a_partial_legacy_value_is_stored_but_derives_nothing(): void
    {
        // Junk in the column the document folders are keyed on is worse than an
        // absent reference, so short values must not produce one.
        $user = $this->makeUser(['aadhar_card_no' => '1234'])->fresh();

        $this->assertNull($user->aadhaar_secure_reference);
        $this->assertNull($user->aadhaar_last_four);
        $this->assertSame('1234', $user->getRawOriginal('aadhar_card_no'));
    }

    #[Test]
    public function the_number_never_appears_in_a_serialised_model(): void
    {
        $user = $this->makeUser(['aadhar_card_no' => self::AADHAAR])->fresh();

        $json = json_encode($user->toArray());

        $this->assertStringNotContainsString(self::AADHAAR, $json);
        $this->assertSame('XXXX XXXX 9012', $user->aadhaar_masked);
        $this->assertTrue($user->has_aadhaar);
    }

    #[Test]
    public function spaced_and_hyphenated_input_normalises(): void
    {
        $user = $this->makeUser(['aadhar_card_no' => '1234 5678-9012'])->fresh();

        $this->assertSame(self::AADHAAR, $user->encrypted_aadhaar_number);
        $this->assertSame('9012', $user->aadhaar_last_four);
    }

    #[Test]
    public function a_missing_reference_secret_does_not_take_the_write_down(): void
    {
        config(['app.aadhaar_reference_secret' => null]);
        putenv('AADHAAR_REFERENCE_SECRET=');
        $_ENV['AADHAAR_REFERENCE_SECRET'] = '';

        $user = $this->makeUser(['aadhar_card_no' => self::AADHAAR])->fresh();

        // The number is still encrypted and masked; only the storage key is
        // unavailable. An employee record must not fail to save over config.
        $this->assertSame(self::AADHAAR, $user->encrypted_aadhaar_number);
        $this->assertSame('9012', $user->aadhaar_last_four);
    }

    #[Test]
    public function a_write_still_succeeds_where_the_columns_do_not_exist(): void
    {
        // Production's actual shape. The migration that adds the three columns
        // is stranded behind the unrecorded authorization migration, so a
        // derivation that assumed them would fail the INSERT and take employee
        // and appointment saving down on exactly the deployment that needs
        // fixing. Dropping them here reproduces that.
        \Schema::table('users', function ($table) {
            $table->dropIndex('users_aadhaar_secure_reference_index');
        });
        \Schema::table('users', function ($table) {
            $table->dropColumn(['encrypted_aadhaar_number', 'aadhaar_last_four', 'aadhaar_secure_reference']);
        });
        SchemaSupport::flush();

        $user = $this->makeUser(['aadhar_card_no' => self::AADHAAR]);

        $this->assertDatabaseHas('users', ['id' => $user->id]);
        $this->assertSame(self::AADHAAR, $user->fresh()->getRawOriginal('aadhar_card_no'));
        $this->assertSame('XXXX XXXX 9012', $user->fresh()->aadhaar_masked);
    }

    private function makeUser(array $attributes): User
    {
        return User::create(array_merge([
            'name' => 'Aadhaar At Rest', 'email' => uniqid('aar-', true) . '@example.test',
            'password' => 'password', 'emp_code' => strtoupper(substr(uniqid(), -8)),
            'role' => 3, 'company_code' => 'acme', 'status' => 0, 'is_deleted' => 0,
        ], $attributes));
    }
}
