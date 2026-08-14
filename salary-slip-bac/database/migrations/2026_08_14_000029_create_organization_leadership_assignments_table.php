<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * organization_leadership_assignments — effective-dated leadership roles (DOMAIN 02.07).
 *
 * Department Head, Business Unit Head, HR Business Partner.
 * Skip-Level Manager is derived from the active primary reporting chain.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('organization_leadership_assignments')) {
            return;
        }

        Schema::create('organization_leadership_assignments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('enterprise_id')->nullable();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->unsignedBigInteger('user_id'); // the leader
            $table->string('leadership_type', 40); // department_head, business_unit_head, hr_business_partner
            $table->unsignedBigInteger('scope_id'); // department_id, organization_unit_id, etc.
            $table->string('scope_type', 40); // department, organization_unit, organization_location, etc.
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'leadership_type', 'scope_type', 'scope_id', 'effective_from']);
            $table->index('enterprise_id');
            $table->index('company_id');
            $table->index('user_id');
            $table->index('leadership_type');
            $table->index('scope_type');
            $table->index('scope_id');
            $table->index('is_active');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('enterprise_id')->references('id')->on('enterprises')->nullOnDelete();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_leadership_assignments');
    }
};