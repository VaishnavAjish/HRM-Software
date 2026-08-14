<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * S7: the public /storage route serves only non-sensitive files on the public
 * disk. Sensitive prefixes are blocked case-insensitively (NTFS is case-
 * insensitive) and traversal/encoding tricks are rejected.
 */
class StorageRouteTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    public function test_serves_a_public_profile_image(): void
    {
        Storage::disk('public')->put('users/42/photo.png', 'PNGDATA');

        $this->get('/storage/users/42/photo.png')->assertOk();
    }

    public function test_blocks_sensitive_prefix_lowercase(): void
    {
        Storage::disk('public')->put('candidate-documents/secret.pdf', 'PII');

        $this->get('/storage/candidate-documents/secret.pdf')->assertNotFound();
    }

    public function test_blocks_sensitive_prefix_windows_case(): void
    {
        // On NTFS this resolves to the same file the lowercase prefix guards.
        Storage::disk('public')->put('candidate-documents/secret.pdf', 'PII');

        $this->get('/storage/CANDIDATE-DOCUMENTS/secret.pdf')->assertNotFound();
        $this->get('/storage/Candidate-Documents/secret.pdf')->assertNotFound();
    }

    public function test_blocks_other_sensitive_prefixes_case_insensitively(): void
    {
        foreach (['Documents/x.pdf', 'PRIVATE/x', 'Backups/db.sql', 'RBAC-Readiness/dump.json'] as $path) {
            $this->get('/storage/' . $path)->assertNotFound();
        }
    }

    public function test_rejects_encoded_traversal(): void
    {
        $this->get('/storage/..%2f..%2fetc%2fpasswd')->assertNotFound();
        // Double-encoded traversal must also be caught after full decoding.
        $this->get('/storage/%252e%252e%2f%252e%252e%2fsecret')->assertNotFound();
    }

    public function test_rejects_absolute_and_unc_paths(): void
    {
        $this->get('/storage/%2Fetc%2Fpasswd')->assertNotFound();
        $this->get('/storage/C:%5CWindows%5Cwin.ini')->assertNotFound();
    }

    public function test_missing_file_is_not_found(): void
    {
        $this->get('/storage/users/999/none.png')->assertNotFound();
    }
}
