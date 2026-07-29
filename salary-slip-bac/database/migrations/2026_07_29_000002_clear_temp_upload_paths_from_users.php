<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Clears PHP temp-upload paths that were written into the users table.
 *
 * UserController mass-assigned the UploadedFile objects for photo/adhar_image/
 * pan_image/check_image, which stringify to PHP's temp path — rows ended up
 * holding values like "C:\Users\...\AppData\Local\Temp\php80D0.tmp". The
 * browser rewrites a leading drive letter to file:///C:/... and blocks it
 * ("Not allowed to load local resource").
 *
 * The referenced temp files were deleted when their request ended, so there is
 * nothing to recover — the columns are nulled so the UI shows an empty slot
 * and the document can simply be re-uploaded.
 */
return new class extends Migration
{
    private const FILE_COLUMNS = ['photo', 'adhar_image', 'pan_image', 'check_image'];

    public function up(): void
    {
        foreach (self::FILE_COLUMNS as $column) {
            DB::table('users')
                ->where(function ($q) use ($column) {
                    // Windows temp path, POSIX temp path, or any leftover
                    // php-generated temp filename.
                    $q->where($column, 'like', '%AppData\Local\Temp%')
                        ->orWhere($column, 'like', '/tmp/%')
                        ->orWhere($column, 'like', '%php%.tmp');
                })
                ->update([$column => null]);
        }
    }

    public function down(): void
    {
        // Intentionally irreversible — the original values pointed at temp
        // files that no longer exist, so restoring them would only recreate
        // broken references.
    }
};
