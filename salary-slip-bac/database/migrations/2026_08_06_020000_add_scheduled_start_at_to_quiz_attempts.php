<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets HR set a "don't let the candidate start before X" gate on an
 * assessment invite, separate from `link_expires_at` (which already governs
 * "the link stops working after Y"). Both are optional and independent: a
 * quiz with no scheduled_start_at behaves exactly as before (startable the
 * moment the link is opened).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('quiz_attempts', function (Blueprint $table) {
            $table->timestamp('scheduled_start_at')->nullable()->after('link_expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('quiz_attempts', function (Blueprint $table) {
            $table->dropColumn('scheduled_start_at');
        });
    }
};
