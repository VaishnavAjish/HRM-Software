<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\DocumentVersion;
use App\Models\User;
use App\Services\Documents\StorageProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

/**
 * The folder reconciliation command.
 *
 * Documents uploaded while an owner's Aadhaar was blank landed under a fallback
 * prefix. Restoring the Aadhaar changes where new uploads go but leaves the old
 * objects behind, so an owner can hold documents under two prefixes at once.
 * This command finds those and moves them under supervision.
 */
class ReconcileDocumentFoldersTest extends TestCase
{
    use RefreshDatabase;

    private FakeStorage $storage;

    protected function setUp(): void
    {
        parent::setUp();

        config(['documents.mask_aadhaar_in_key' => false]);
        $this->storage = new FakeStorage;
        $this->app->instance(StorageProvider::class, $this->storage);
    }

    private function makeDocumentUnderFallbackFolder(string $aadhaar = '123456789012'): DocumentVersion
    {
        $owner = User::create([
            'name' => 'Rohit', 'email' => 'reconcile@test.local', 'password' => 'x',
            'role' => 3, 'type' => 'appointment', 'emp_code' => 'EMP1025',
            'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
        $owner->forceFill(['aadhar_card_no' => $aadhaar])->save();

        $document = Document::create([
            'organization_code' => 'nidhi-impex',
            'owner_type' => 'appointment',
            'owner_id' => $owner->id,
            'owner_ref' => 'EMP1025',
            'user_id' => $owner->id,
            'document_type' => 'PAN_CARD',
            'status' => 'ACTIVE',
            'current_version' => 1,
        ]);

        // The shape produced while the Aadhaar was missing.
        $legacyKey = 'EMP1025/PAN_CARD/PAN_CARD_V1_20260730121000.pdf';
        $this->storage->objects[$legacyKey] = 'pdf-bytes';

        return DocumentVersion::create([
            'document_id' => $document->id,
            'version' => 1,
            'original_file_name' => 'my-pan.pdf',
            'generated_file_name' => 'PAN_CARD_V1_20260730121000.pdf',
            'bucket_name' => 'test-bucket',
            's3_object_key' => $legacyKey,
            'folder_path' => 'EMP1025/PAN_CARD',
            'file_extension' => 'pdf',
            'file_size' => 2048,
            'mime_type' => 'application/pdf',
            'upload_status' => 'COMPLETED',
            'uploaded_at' => now(),
        ]);
    }

    public function test_dry_run_reports_a_fallback_folder_document(): void
    {
        $version = $this->makeDocumentUnderFallbackFolder();

        $this->artisan('documents:reconcile-folders', ['--mode' => 'DRY_RUN'])
            ->assertSuccessful();

        // Nothing moved and nothing was rewritten.
        $this->assertSame(
            'EMP1025/PAN_CARD/PAN_CARD_V1_20260730121000.pdf',
            $version->fresh()->s3_object_key,
        );
        $this->assertSame([], $this->storage->copied);
        $this->assertSame([], $this->storage->deleted);
    }

    public function test_dry_run_counts_the_document_as_needing_migration(): void
    {
        $this->makeDocumentUnderFallbackFolder();

        $this->artisan('documents:reconcile-folders', ['--mode' => 'DRY_RUN', '--json' => true])
            ->expectsOutputToContain('"needs_migration": 1')
            ->assertSuccessful();
    }

    /** Chained expectsOutputToContain() only reliably matches the first, so read the counts. */
    private function dryRunCounts(): array
    {
        Artisan::call(
            'documents:reconcile-folders',
            ['--mode' => 'DRY_RUN', '--json' => true],
        );

        return json_decode(Artisan::output(), true)['counts'];
    }

    public function test_a_document_already_in_the_right_place_needs_nothing(): void
    {
        $version = $this->makeDocumentUnderFallbackFolder();
        $expected = '123456789012/'.$version->document->user_id.'/PAN_CARD/PAN_CARD_V1_20260730121000.pdf';

        $this->storage->objects = [$expected => 'pdf-bytes'];
        $version->forceFill(['s3_object_key' => $expected])->save();

        $counts = $this->dryRunCounts();

        $this->assertSame(1, $counts['scanned']);
        $this->assertSame(1, $counts['already_correct']);
        $this->assertSame(0, $counts['needs_migration']);
    }

    public function test_copy_and_verify_moves_the_object_but_keeps_the_source(): void
    {
        $version = $this->makeDocumentUnderFallbackFolder();
        $expected = '123456789012/'.$version->document->user_id.'/PAN_CARD/PAN_CARD_V1_20260730121000.pdf';

        $this->artisan('documents:reconcile-folders', ['--mode' => 'COPY_AND_VERIFY'])
            ->assertSuccessful();

        $this->assertSame($expected, $version->fresh()->s3_object_key);
        $this->assertArrayHasKey($expected, $this->storage->objects);
        // The source survives, so the run can be abandoned.
        $this->assertArrayHasKey('EMP1025/PAN_CARD/PAN_CARD_V1_20260730121000.pdf', $this->storage->objects);
        $this->assertSame([], $this->storage->deleted);
    }

    public function test_finalize_deletes_the_source_after_verifying(): void
    {
        $version = $this->makeDocumentUnderFallbackFolder();
        $legacy = 'EMP1025/PAN_CARD/PAN_CARD_V1_20260730121000.pdf';

        $this->artisan('documents:reconcile-folders', ['--mode' => 'FINALIZE'])
            ->assertSuccessful();

        $this->assertSame([$legacy], $this->storage->deleted);
        $this->assertArrayNotHasKey($legacy, $this->storage->objects);
        $this->assertNotSame($legacy, $version->fresh()->s3_object_key);
    }

    public function test_running_it_twice_changes_nothing_the_second_time(): void
    {
        $this->makeDocumentUnderFallbackFolder();

        $this->artisan('documents:reconcile-folders', ['--mode' => 'COPY_AND_VERIFY'])->assertSuccessful();
        $copiesAfterFirst = count($this->storage->copied);

        $this->artisan('documents:reconcile-folders', ['--mode' => 'COPY_AND_VERIFY'])->assertSuccessful();

        // The key already matches, so the second pass has nothing to do.
        $this->assertSame($copiesAfterFirst, count($this->storage->copied));
    }

    public function test_a_missing_source_object_never_rewrites_metadata(): void
    {
        $version = $this->makeDocumentUnderFallbackFolder();
        // Metadata points somewhere the object is not.
        $this->storage->objects = [];

        $this->artisan('documents:reconcile-folders', ['--mode' => 'FINALIZE', '--json' => true])
            ->expectsOutputToContain('"source_missing": 1')
            ->assertSuccessful();

        $this->assertSame(
            'EMP1025/PAN_CARD/PAN_CARD_V1_20260730121000.pdf',
            $version->fresh()->s3_object_key,
        );
        $this->assertSame([], $this->storage->deleted);
    }

    public function test_an_owner_without_an_aadhaar_keeps_a_fallback_prefix(): void
    {
        $version = $this->makeDocumentUnderFallbackFolder('');

        $this->artisan('documents:reconcile-folders', ['--mode' => 'COPY_AND_VERIFY'])
            ->assertSuccessful();

        // Still under the employee code — a blank Aadhaar must never be invented
        // into an Aadhaar-shaped prefix. What does change is that the owner id
        // is inserted, which is what keeps two people's documents apart.
        $this->assertSame(
            'EMP1025/'.$version->document->user_id.'/PAN_CARD/PAN_CARD_V1_20260730121000.pdf',
            $version->fresh()->s3_object_key,
        );
    }

    public function test_the_report_never_prints_a_complete_aadhaar(): void
    {
        $this->makeDocumentUnderFallbackFolder();

        $this->artisan('documents:reconcile-folders', ['--mode' => 'DRY_RUN'])
            ->doesntExpectOutputToContain('123456789012')
            ->assertSuccessful();
    }

    public function test_rollback_report_flags_sources_that_still_exist(): void
    {
        $this->makeDocumentUnderFallbackFolder();

        $this->artisan('documents:reconcile-folders', ['--mode' => 'ROLLBACK_REPORT', '--json' => true])
            ->expectsOutputToContain('source_still_present')
            ->assertSuccessful();

        $this->assertSame([], $this->storage->copied);
        $this->assertSame([], $this->storage->deleted);
    }
}

/** In-memory stand-in so no test touches S3. */
class FakeStorage implements StorageProvider
{
    public array $objects = [];

    public array $copied = [];

    public array $deleted = [];

    public function put(string $sourcePath, string $objectKey, string $mimeType): array
    {
        $this->objects[$objectKey] = 'bytes';

        return ['object_key' => $objectKey];
    }

    public function exists(string $objectKey): bool
    {
        return array_key_exists($objectKey, $this->objects);
    }

    public function delete(string $objectKey): void
    {
        $this->deleted[] = $objectKey;
        unset($this->objects[$objectKey]);
    }

    public function copy(string $fromKey, string $toKey): void
    {
        if (! array_key_exists($fromKey, $this->objects)) {
            throw new \RuntimeException("missing source {$fromKey}");
        }

        $this->copied[] = [$fromKey, $toKey];
        $this->objects[$toKey] = $this->objects[$fromKey];
    }

    public function viewUrl(string $objectKey, int $ttlSeconds, string $mimeType): string
    {
        return "https://fake/{$objectKey}";
    }

    public function downloadUrl(string $objectKey, int $ttlSeconds, string $downloadName): string
    {
        return "https://fake/{$objectKey}";
    }

    public function healthy(): bool
    {
        return true;
    }
}
