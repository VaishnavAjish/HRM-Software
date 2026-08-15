<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('leave_policies', function (Blueprint $table) {
            $table->id();
            $table->string('code', 64)->unique();
            $table->string('name', 255);
            $table->text('description')->nullable();
            $table->string('scope_type', 32)->default('company'); // company, legal_entity, country, location, department, grade, worker_type
            $table->unsignedBigInteger('scope_id')->nullable(); // ID of the scope entity
            $table->unsignedBigInteger('company_id')->nullable();
            $table->unsignedBigInteger('legal_entity_id')->nullable();
            $table->unsignedBigInteger('country_id')->nullable();
            $table->unsignedBigInteger('location_id')->nullable();
            $table->unsignedBigInteger('department_id')->nullable();
            $table->unsignedBigInteger('grade_id')->nullable();
            $table->unsignedBigInteger('worker_type_id')->nullable();
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->string('accrual_frequency', 32)->default('monthly'); // daily, weekly, monthly, quarterly, yearly, on_joining
            $table->integer('accrual_day_of_month')->default(1); // 1-28, or last day
            $table->boolean('pro_rata_first_year')->default(true);
            $table->boolean('pro_rata_last_year')->default(true);
            $table->string('leave_year_start', 16)->default('01-01'); // MM-DD format
            $table->boolean('allow_carry_forward')->default(true);
            $table->integer('max_carry_forward_days')->nullable();
            $table->date('carry_forward_expiry')->nullable();
            $table->boolean('allow_negative_balance')->default(false);
            $table->integer('max_negative_balance_days')->nullable();
            $table->boolean('require_approval_for_all')->default(true);
            $table->json('approval_workflow')->nullable(); // workflow configuration
            $table->boolean('is_active')->default(true);
            $table->boolean('is_default')->default(false);
            $table->integer('priority')->default(100); // for overlapping policies
            $table->timestamps();
            $table->softDeletes();

            $table->index(['scope_type', 'scope_id', 'is_active']);
            $table->index(['company_id', 'is_active']);
            $table->index(['effective_from', 'effective_to', 'is_active']);
            $table->index(['is_default', 'is_active']);
        });

        Schema::create('leave_policy_types', function (Blueprint $table) {
            $table->id();
            $table->foreignId('leave_policy_id')->constrained()->cascadeOnDelete();
            $table->foreignId('leave_type_id')->constrained()->cascadeOnDelete();
            $table->decimal('annual_entitlement', 8, 2)->default(0);
            $table->decimal('max_per_request', 8, 2)->nullable();
            $table->decimal('min_per_request', 8, 2)->default(0.5);
            $table->integer('max_requests_per_year')->nullable();
            $table->integer('min_notice_days')->default(0);
            $table->boolean('allow_half_day')->default(true);
            $table->boolean('requires_document')->default(false);
            $table->json('document_types')->nullable(); // allowed document types
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['leave_policy_id', 'leave_type_id']);
            $table->index(['leave_policy_id', 'is_active']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('leave_policy_types');
        Schema::dropIfExists('leave_policies');
    }
};