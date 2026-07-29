<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the missing account_book (Bank Passbook) column.
 *
 * The appointment form has always posted this field alongside adhar_image,
 * pan_image and check_image, but there was no column and it was absent from the
 * controller's allowlists — so every Bank Passbook upload was silently
 * discarded with no error shown to the user.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('users', 'account_book')) {
            return;
        }

        Schema::table('users', function (Blueprint $table) {
            $table->string('account_book', 1024)->nullable()->after('check_image');
        });
    }

    public function down(): void
    {
        if (!Schema::hasColumn('users', 'account_book')) {
            return;
        }

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('account_book');
        });
    }
};
