<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_intimation_number_counters — atomic per-period counter backing
 * MediclaimIntimationNumber (MCI-{COMPANY}-{YYYY}-{000001}). Same shape as
 * `mediclaim_claim_number_counters` / `ticket_number_counters`.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_intimation_number_counters')) {
            Schema::create('mediclaim_intimation_number_counters', function (Blueprint $table) {
                $table->id();
                $table->string('period_key');
                $table->unsignedInteger('current_value')->default(0);
                $table->timestamps();

                $table->unique('period_key');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_intimation_number_counters');
    }
};
