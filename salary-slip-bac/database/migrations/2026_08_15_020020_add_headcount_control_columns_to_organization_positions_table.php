<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organization_positions', function (Blueprint $table) {
            if (!Schema::hasColumn('organization_positions', 'budgeted_headcount')) {
                $table->unsignedInteger('budgeted_headcount')->nullable()->after('approved_headcount');
            }

            if (!Schema::hasColumn('organization_positions', 'frozen_at')) {
                $table->timestamp('frozen_at')->nullable()->after('approval_status');
            }

            if (!Schema::hasColumn('organization_positions', 'frozen_by')) {
                $table->unsignedBigInteger('frozen_by')->nullable()->after('frozen_at');
                $table->foreign('frozen_by')->references('id')->on('users')->nullOnDelete();
            }

            if (!Schema::hasColumn('organization_positions', 'freeze_reason')) {
                $table->string('freeze_reason', 500)->nullable()->after('frozen_by');
            }
        });

        // Backfill budgeted_headcount to match approved_headcount for existing rows
        // so variance reporting starts at zero instead of showing every position as
        // "over budget" the moment this column exists.
        \Illuminate\Support\Facades\DB::table('organization_positions')
            ->whereNull('budgeted_headcount')
            ->update(['budgeted_headcount' => \Illuminate\Support\Facades\DB::raw('approved_headcount')]);
    }

    public function down(): void
    {
        Schema::table('organization_positions', function (Blueprint $table) {
            if (Schema::hasColumn('organization_positions', 'frozen_by')) {
                $table->dropForeign(['organization_positions_frozen_by_foreign']);
            }

            $table->dropColumn(array_filter(
                ['budgeted_headcount', 'frozen_at', 'frozen_by', 'freeze_reason'],
                fn ($col) => Schema::hasColumn('organization_positions', $col)
            ));
        });
    }
};
