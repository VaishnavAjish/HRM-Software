<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Aadhaar identity columns backing the secure document folder reference.
 *
 * The full number lives only in encrypted_aadhaar_number (Laravel `encrypted`
 * cast, AES-256 via APP_KEY). Everything the application actually works with —
 * folder prefix, display value — is derived: aadhaar_secure_reference is an
 * HMAC and aadhaar_last_four is all the UI ever shows.
 *
 * The existing plaintext aadhar_card_no column is deliberately left alone here;
 * removing it is a separate, destructive step once the encrypted values have
 * been backfilled and verified.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'encrypted_aadhaar_number')) {
                // Ciphertext is far longer than the 12 plaintext digits.
                $table->text('encrypted_aadhaar_number')->nullable();
            }
            if (!Schema::hasColumn('users', 'aadhaar_last_four')) {
                $table->string('aadhaar_last_four', 4)->nullable();
            }
            if (!Schema::hasColumn('users', 'aadhaar_secure_reference')) {
                $table->string('aadhaar_secure_reference', 64)->nullable();
            }
            if (!Schema::hasColumn('users', 'aadhaar_verification_status')) {
                // UNVERIFIED | PENDING_REVIEW | VERIFIED | REJECTED
                $table->string('aadhaar_verification_status', 32)->default('UNVERIFIED');
            }
            if (!Schema::hasColumn('users', 'aadhaar_extraction_source')) {
                // OCR | MANUAL | IMPORT
                $table->string('aadhaar_extraction_source', 32)->nullable();
            }
            if (!Schema::hasColumn('users', 'aadhaar_extracted_at')) {
                $table->timestamp('aadhaar_extracted_at')->nullable();
            }
            if (!Schema::hasColumn('users', 'aadhaar_verified_by')) {
                $table->foreignId('aadhaar_verified_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('users', 'aadhaar_verified_at')) {
                $table->timestamp('aadhaar_verified_at')->nullable();
            }
        });

        // Added separately: SQLite rebuilds the table for an inline unique on an
        // added column, which does not survive being re-run.
        Schema::table('users', function (Blueprint $table) {
            $table->unique('aadhaar_secure_reference', 'users_aadhaar_secure_reference_unique');
            $table->index('aadhaar_verification_status', 'users_aadhaar_verification_status_index');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique('users_aadhaar_secure_reference_unique');
            $table->dropIndex('users_aadhaar_verification_status_index');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('aadhaar_verified_by');
            $table->dropColumn([
                'encrypted_aadhaar_number',
                'aadhaar_last_four',
                'aadhaar_secure_reference',
                'aadhaar_verification_status',
                'aadhaar_extraction_source',
                'aadhaar_extracted_at',
                'aadhaar_verified_at',
            ]);
        });
    }
};
