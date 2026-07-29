<?php

namespace Tests\Unit;

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

    public function test_entity_name_strips_unsafe_characters(): void
    {
        $this->assertSame('RohitSaket', DocumentFileName::entityName('Rohit  Saket!'));
        $this->assertSame('RohitSaket', DocumentFileName::entityName('  rohit   saket  '));
        $this->assertSame('User', DocumentFileName::entityName('✅✅'));
        $this->assertSame('User', DocumentFileName::entityName(null));
    }

    public function test_entity_id_falls_back_to_padded_surrogate(): void
    {
        $this->assertSame('EMP1025', DocumentFileName::entityId('EMP-1025'));
        $this->assertSame('USR000123', DocumentFileName::entityId(null, 123));
        $this->assertSame('USR000000', DocumentFileName::entityId(null, null));
    }

    public function test_generated_filename_matches_specification(): void
    {
        $at = new \DateTimeImmutable('2026-07-29 15:45:30', new \DateTimeZone('UTC'));

        $this->assertSame(
            'EMP1025_RohitSaket_PAN_CARD_V1_20260729154530.pdf',
            DocumentFileName::build('EMP1025', 'Rohit Saket', 'PAN_CARD', 1, 'pdf', $at)
        );
    }

    public function test_timestamp_is_utc_regardless_of_input_zone(): void
    {
        $ist = new \DateTimeImmutable('2026-07-29 21:15:30', new \DateTimeZone('Asia/Kolkata'));

        // 21:15:30 IST is 15:45:30 UTC.
        $this->assertSame('20260729154530', DocumentFileName::timestamp($ist));
    }

    public function test_reserved_device_name_is_prefixed(): void
    {
        $name = DocumentFileName::build('CON', '', 'CON', 1, 'pdf');

        $this->assertStringNotContainsString('/', $name);
        $this->assertStringEndsWith('.pdf', $name);
    }

    public function test_extension_comes_from_mime_not_the_hint(): void
    {
        // A ".php" hint must not survive when the content is a JPEG.
        $this->assertSame('jpg', DocumentFileName::extensionFor('image/jpeg', 'php'));
        $this->assertSame('pdf', DocumentFileName::extensionFor('application/pdf', 'exe'));
    }

    public function test_object_key_layout(): void
    {
        $key = ObjectKeyBuilder::build('employee', 'EMP1025', 'PAN_CARD', 'EMP1025_Rohit_PAN_CARD_V1_20260729154530.pdf');

        $this->assertSame(
            'employees/EMP1025/PAN_CARD/EMP1025_Rohit_PAN_CARD_V1_20260729154530.pdf',
            $key
        );
    }

    /** @dataProvider traversalProvider */
    public function test_object_key_rejects_traversal(string $ownerRef): void
    {
        $this->expectException(InvalidArgumentException::class);

        ObjectKeyBuilder::build('employee', $ownerRef, 'PAN_CARD', 'file.pdf');
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
        $key = ObjectKeyBuilder::build('employee', 'a/b\\c', 'PAN_CARD', 'file.pdf');

        $this->assertSame('employees/a_b_c/PAN_CARD/file.pdf', $key);
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
            'archive/employees/EMP1025/PAN_CARD/f.pdf',
            ObjectKeyBuilder::archiveKey('employees/EMP1025/PAN_CARD/f.pdf')
        );
    }
}
