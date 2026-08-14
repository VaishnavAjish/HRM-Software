<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * organization_calendar_assignments — calendar assignments to scopes (DOMAIN 02.10).
 *
 * Enterprise, company, country, location, department assignments.
 * Financial calendars and payroll calendars are resolved independently.
 * Precedence: Department → Location → Company → Enterprise → Country
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('organization_calendar_assignments')) {
            return;
        }

        Schema::create('organization_calendar_assignments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('calendar_id');
            $table->string('calendar_kind', 30); // working_day, financial, payroll
            $table->string('scope_type', 40); // enterprise, company, country, location, department
            $table->unsignedBigInteger('scope_id');
            $table->unsignedInteger('priority')->default(0); // higher wins for same scope/kind
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['calendar_id', 'scope_type', 'scope_id', 'calendar_kind']);
            $table->index('calendar_id');
            $table->index('scope_type');
            $table->index('scope_id');
            $table->index('calendar_kind');
            $table->index('priority');
            $table->index('is_active');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('calendar_id')->references('id')->on('calendars')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_calendar_assignments');
    }
};