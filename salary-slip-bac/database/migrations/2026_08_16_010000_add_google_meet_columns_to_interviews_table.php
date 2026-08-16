<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('interviews', function (Blueprint $table) {
            if (!Schema::hasColumn('interviews', 'google_event_id')) {
                $table->string('google_event_id')->nullable()->after('meeting_link');
            }

            if (!Schema::hasColumn('interviews', 'meeting_status')) {
                // not_configured | created | update_failed | delete_failed | failed | manual
                $table->string('meeting_status', 30)->nullable()->after('google_event_id');
            }

            if (!Schema::hasColumn('interviews', 'meeting_error')) {
                $table->string('meeting_error', 500)->nullable()->after('meeting_status');
            }

            if (!Schema::hasColumn('interviews', 'meeting_created_at')) {
                $table->timestamp('meeting_created_at')->nullable()->after('meeting_error');
            }
        });
    }

    public function down(): void
    {
        Schema::table('interviews', function (Blueprint $table) {
            $table->dropColumn(array_filter(
                ['google_event_id', 'meeting_status', 'meeting_error', 'meeting_created_at'],
                fn ($col) => Schema::hasColumn('interviews', $col)
            ));
        });
    }
};
