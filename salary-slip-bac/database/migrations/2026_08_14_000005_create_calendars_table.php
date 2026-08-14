<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Calendars — the working/weekly schedule master (DOMAIN 02.10).
 *
 * Nothing calendar-shaped exists in the codebase today; this is greenfield.
 * A calendar belongs to a company and may bind to a unit (NULL unit_id = the
 * company default calendar; per-unit calendars override it for that unit).
 * `work_week` is a JSON array of 3-letter day keys (["mon","tue",...]); NULL
 * means the conventional Monday–Friday week. Holidays live in
 * calendar_holidays so a calendar can be reused across years.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('calendars')) {
            return;
        }

        Schema::create('calendars', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id');
            $table->unsignedBigInteger('unit_id')->nullable();
            $table->string('name', 140);
            $table->text('description')->nullable();
            $table->jsonb('work_week')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['company_id', 'unit_id', 'name']);
            $table->index('company_id');
            $table->index('unit_id');

            $table->foreign('company_id')->references('id')->on('companies')->cascadeOnDelete();
            $table->foreign('unit_id')->references('id')->on('units')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('calendars');
    }
};