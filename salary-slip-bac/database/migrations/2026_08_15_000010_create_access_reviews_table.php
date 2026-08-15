<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Create access_reviews table for Domain 01.20 Access Review.
 *
 * Tracks periodic access reviews for users, roles, and permissions.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('access_reviews', function (Blueprint $table) {
            $table->id();
            $table->string('name', 190);
            $table->text('description')->nullable();
            $table->string('type', 30); // 'periodic', 'manager', 'hr', 'application_owner', 'privileged'
            $table->string('scope_type', 30)->nullable(); // 'tenant', 'company', 'department', 'role', 'user', 'global'
            $table->unsignedBigInteger('scope_id')->nullable();
            $table->string('status', 30)->default('draft'); // 'draft', 'in_progress', 'completed', 'cancelled'
            $table->string('reviewer_type', 30)->nullable(); // 'manager', 'hr', 'application_owner', 'super_admin'
            $table->unsignedBigInteger('reviewer_id')->nullable();
            $table->string('frequency', 30)->nullable(); // 'monthly', 'quarterly', 'semi_annual', 'annual', 'ad_hoc'
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('reviewer_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->index(['status', 'end_date']);
            $table->index(['type', 'status']);
            $table->index(['scope_type', 'scope_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('access_reviews');
    }
};