<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * calendar_holidays — the dated entries of a calendar (02.10).
 *
 * One row per date. `kind` is holiday / optional / workday — a workday entry is
 * how a company declares a working day inside an otherwise non-working weekly
 * pattern. `recurring = annual` makes a holiday repeat year over year without
 * being copied; the alternative is explicit dated rows. The unique key is
 * (calendar_id, date), and the service upserts on it.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('calendar_holidays')) {
            return;
        }

        Schema::create('calendar_holidays', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('calendar_id');
            $table->date('date');
            $table->string('title', 190);
            $table->string('kind', 20)->default('holiday');
            $table->boolean('is_half_day')->default(false);
            $table->string('recurring', 10)->nullable();
            $table->timestamps();

            $table->unique(['calendar_id', 'date']);
            $table->index('calendar_id');
            $table->index(['calendar_id', 'date']);

            $table->foreign('calendar_id')->references('id')->on('calendars')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('calendar_holidays');
    }
};