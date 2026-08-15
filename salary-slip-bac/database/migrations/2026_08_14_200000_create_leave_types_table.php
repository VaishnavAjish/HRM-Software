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
        Schema::create('leave_types', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique(); // e.g., CL, EL, SL, ML, PL, CO, WFH
            $table->string('name', 128); // Casual Leave, Earned Leave, Sick Leave, etc.
            $table->text('description')->nullable();
            $table->string('category', 32)->default('standard'); // standard, medical, special, compensatory
            $table->boolean('is_paid')->default(true);
            $table->boolean('requires_approval')->default(true);
            $table->boolean('requires_document')->default(false);
            $table->boolean('is_active')->default(true);
            $table->boolean('is_system')->default(false); // system-defined types that cannot be deleted
            $table->integer('max_days_per_request')->nullable();
            $table->integer('max_days_per_year')->nullable();
            $table->integer('min_notice_days')->default(0);
            $table->boolean('allow_half_day')->default(true);
            $table->boolean('allow_negative_balance')->default(false);
            $table->boolean('carry_forward_allowed')->default(true);
            $table->integer('max_carry_forward_days')->nullable();
            $table->date('carry_forward_expiry')->nullable();
            $table->json('applicable_genders')->nullable(); // ['male', 'female', 'other'] or null for all
            $table->json('applicable_employment_types')->nullable(); // ['full_time', 'part_time', 'contract'] or null for all
            $table->json('applicable_grades')->nullable(); // grade IDs or null for all
            $table->json('applicable_departments')->nullable(); // department IDs or null for all
            $table->json('applicable_locations')->nullable(); // location IDs or null for all
            $table->json('color')->nullable(); // hex color for UI
            $table->string('icon')->nullable(); // icon name for UI
            $table->integer('sort_order')->default(0);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['is_active', 'category']);
            $table->index(['code', 'is_active']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('leave_types');
    }
};