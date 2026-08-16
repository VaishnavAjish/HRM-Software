<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('authorization_delegations')) {
            return;
        }

        Schema::table('authorization_delegations', function (Blueprint $table) {
            if (!Schema::hasColumn('authorization_delegations', 'accepted_at')) {
                $table->timestamp('accepted_at')->nullable()->after('status');
            }

            if (!Schema::hasColumn('authorization_delegations', 'declined_at')) {
                $table->timestamp('declined_at')->nullable()->after('accepted_at');
            }

            if (!Schema::hasColumn('authorization_delegations', 'revoked_reason')) {
                $table->string('revoked_reason', 500)->nullable()->after('declined_at');
            }
        });

        // Existing rows were created directly as ACTIVE before acceptance existed;
        // backfill accepted_at so they are not retroactively treated as unaccepted.
        DB::table('authorization_delegations')
            ->where('status', 'ACTIVE')
            ->whereNull('accepted_at')
            ->update(['accepted_at' => DB::raw('created_at')]);
    }

    public function down(): void
    {
        if (!Schema::hasTable('authorization_delegations')) {
            return;
        }

        Schema::table('authorization_delegations', function (Blueprint $table) {
            $table->dropColumn(array_filter(
                ['accepted_at', 'declined_at', 'revoked_reason'],
                fn ($col) => Schema::hasColumn('authorization_delegations', $col)
            ));
        });
    }
};
