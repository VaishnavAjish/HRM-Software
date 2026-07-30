<?php

namespace Tests\Unit;

use App\Support\AadhaarReference;
use App\Support\DocumentFileName;
use App\Support\DocumentType;
use App\Support\ObjectKeyBuilder;
use InvalidArgumentException;
use Tests\TestCase;

class DocumentNamingTest extends TestCase
{
    public function test_document_type_normalisation(): void
    {
        $this->assertSame('DRIVING_LICENSE', DocumentType::normalise('Driving License'));
        $this->assertSame('PAN_CARD', DocumentType::normalise('PAN  Card!'));
        $this->assertSame('BANK_PASSBOOK', DocumentType::normalise('Bank Passbook'));
        $this->assertSame('OTHER', DocumentType::normalise('not a real type'));
        $this->assertSame('OTHER', DocumentType::normalise(null));
    }

    public function test_entity_id_falls_back_to_padded_surrogate(): void
    {
        $this->assertSame('EMP1025', DocumentFileName::entityId('EMP-1025'));
        $this->assertSame('USR000123', DocumentFileName::entityId(null, 123));
        $this->assertSame('USR000000', DocumentFileName::entityId(null, null));
    }

    public function test_generated_filename_matches_specification(): void
    {
        $at = new \DateTimeImmutable('2026-07-29 19:00:00', new \DateTimeZone('UTC'));

        $this->assertSame(
            'PAN_CARD_V1_20260729190000.pdf',
            DocumentFileName::build('PAN_CARD', 1, 'pdf', $at)
        );
    }

    public function test_generated_filename_carries_no_owner_identifier(): void
    {
        $name = DocumentFileName::build('PROFILE_PHOTO', 2, 'jpg');

        $this->assertStringStartsWith('PROFILE_PHOTO_V2_', $name);
        $this->assertStringNotContainsString('EMP', $name);
        $this->assertStringNotContainsString('9012', $name);
    }

    public function test_timestamp_is_utc_regardless_of_input_zone(): void
    {
        $ist = new \DateTimeImmutable('2026-07-29 21:15:30', new \DateTimeZone('Asia/Kolkata'));

        // 21:15:30 IST is 15:45:30 UTC.
        $this->assertSame('20260729154530', DocumentFileName::timestamp($ist));
    }

    public function test_reserved_device_name_is_prefixed(): void
    {
        $name = DocumentFileName::build('CON', 1, 'pdf');

        $this->assertStringNotContainsString('/', $name);
        $this->assertStringEndsWith('.pdf', $name);
    }

    public function test_extension_comes_from_mime_not_the_hint(): void
    {
        // A ".php" hint must not survive when the content is a JPEG.
        $this->assertSame('jpg', DocumentFileName::extensionFor('image/jpeg', 'php'));
        $this->assertSame('pdf', DocumentFileName::extensionFor('application/pdf', 'exe'));
    }

    public function test_aadhaar_normalisation_accepts_printed_formats(): void
    {
        foreach (['1234 5678 9012', '1234-5678-9012', '123456789012'] as $printed) {
            $this->assertSame('123456789012', AadhaarReference::normalise($printed));
        }

        $this->assertTrue(AadhaarReference::isValid('1234 5678 9012'));
        $this->assertFalse(AadhaarReference::isValid('12345678901'));   // 11 digits
        $this->assertFalse(AadhaarReference::isValid('1234567890123')); // 13 digits
        $this->assertFalse(AadhaarReference::isValid(null));
    }

    public function test_reference_is_deterministic_and_hides_the_number(): void
    {
        config(['documents.aadhaar_reference_secret' => 'test-secret']);

        $ref = AadhaarReference::secureReference('1234 5678 9012');

        $this->assertMatchesRegularExpression('/^AADHAAR_[0-9a-f]{16}$/', $ref);
        $this->assertStringNotContainsString('123456789012', $ref);
        $this->assertStringNotContainsString('9012', $ref);
        $this->assertSame($ref, AadhaarReference::secureReference('1234-5678-9012'));
    }

    public function test_different_numbers_give_different_references(): void
    {
        config(['documents.aadhaar_reference_secret' => 'test-secret']);

        $this->assertNotSame(
            AadhaarReference::secureReference('123456789012'),
            AadhaarReference::secureReference('999988887777')
        );
    }

    public function test_reference_requires_a_secret(): void
    {
        config(['documents.aadhaar_reference_secret' => null]);

        $this->expectException(\RuntimeException::class);

        AadhaarReference::secureReference('123456789012');
    }

    public function test_masking_and_log_redaction(): void
    {
        $this->assertSame('XXXX XXXX 9012', AadhaarReference::mask('1234 5678 9012'));
        $this->assertSame(
            'upload for XXXX XXXX 9012 failed',
            AadhaarReference::redact('upload for 1234 5678 9012 failed')
        );
    }

    public function test_object_key_uses_reference_then_type_then_file(): void
    {
        $key = ObjectKeyBuilder::build('appointment', 'AADHAAR_6c48b723a018f921', 'PAN_CARD', 'PAN_CARD_V1_20260730110000.pdf');

        $this->assertSame('appointments/AADHAAR_6c48b723a018f921/PAN_CARD/PAN_CARD_V1_20260730110000.pdf', $key);
    }

    public function test_each_employee_gets_a_separate_prefix(): void
    {
        $a = ObjectKeyBuilder::build('appointment', 'AADHAAR_aaaa1111bbbb2222', 'PAN_CARD', 'PAN_CARD_V1_20260730110000.pdf');
        $b = ObjectKeyBuilder::build('appointment', 'AADHAAR_cccc3333dddd4444', 'PAN_CARD', 'PAN_CARD_V1_20260730110000.pdf');

        $this->assertStringStartsWith('appointments/AADHAAR_aaaa1111bbbb2222/', $a);
        $this->assertStringStartsWith('appointments/AADHAAR_cccc3333dddd4444/', $b);
    }

    public function test_object_key_detection_covers_both_layouts(): void
    {
        // Current flat layout and keys written before it.
        $this->assertTrue(ObjectKeyBuilder::looksLikeObjectKey('appointments/AADHAAR_6c48b723a018f921/PAN_CARD/PAN_CARD_V1_20260730110000.pdf'));
        $this->assertTrue(ObjectKeyBuilder::looksLikeObjectKey('employees/EMP001/PAN_CARD/x.pdf'));

        // Legacy local paths and absolute URLs must not be mistaken for keys.
        $this->assertFalse(ObjectKeyBuilder::looksLikeObjectKey('uploads/photos/x.jpg'));
        $this->assertFalse(ObjectKeyBuilder::looksLikeObjectKey('https://example.com/x.jpg'));
        $this->assertFalse(ObjectKeyBuilder::looksLikeObjectKey(null));
    }

    /** @dataProvider traversalProvider */
    public function test_object_key_rejects_traversal(string $ownerRef): void
    {
        $this->expectException(InvalidArgumentException::class);

        ObjectKeyBuilder::build('appointment', $ownerRef, 'PAN_CARD', 'file.pdf');
    }

    public static function traversalProvider(): array
    {
        return [
            'dot dot'       => ['..'],
            'single dot'    => ['.'],
            'empty'         => [''],
            'only symbols'  => ['///'],
        ];
    }

    public function test_separators_inside_a_segment_are_neutralised(): void
    {
        $key = ObjectKeyBuilder::build('appointment', 'a/b\\c', 'PAN_CARD', 'file.pdf');

        $this->assertSame('appointments/a_b_c/PAN_CARD/file.pdf', $key);
    }

    public function test_assert_safe_rejects_illegal_keys(): void
    {
        foreach (['../etc/passwd', '/leading', 'a//b', 'back\\slash', "nul\x00byte"] as $bad) {
            try {
                ObjectKeyBuilder::assertSafe($bad);
                $this->fail("Expected rejection for: {$bad}");
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_unknown_owner_type_is_rejected(): void
    {
        $this->expectException(InvalidArgumentException::class);

        ObjectKeyBuilder::ownerPrefix('../admin');
    }

    public function test_archive_key_is_prefixed_and_safe(): void
    {
        $this->assertSame(
            'archive/AADHAAR_6c48b723a018f921/PAN_CARD/PAN_CARD_V1.pdf',
            ObjectKeyBuilder::archiveKey('AADHAAR_6c48b723a018f921/PAN_CARD/PAN_CARD_V1.pdf')
        );
    }
}
