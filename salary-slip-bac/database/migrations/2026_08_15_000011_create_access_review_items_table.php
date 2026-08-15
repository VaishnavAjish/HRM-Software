<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Create access_review_items table for Domain 01.20 Access Review.
 *
 * Individual items within an access review.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('access_review_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('review_id');
            $table->unsignedBigInteger('user_id')->nullable(); // User being reviewed
            $table->unsignedBigInteger('role_id')->nullable(); // Role being reviewed
            $table->unsignedBigInteger('permission_id')->nullable(); // Permission being reviewed
            $table->string('scope_type', 30)->nullable(); // 'tenant', 'company', 'department', 'global'
            $table->unsignedBigInteger('scope_id')->nullable();
            $table->text('assignment_reason')->nullable(); // Why this access was granted
            $table->timestamp('last_used_at')->nullable(); // When this access was last used
            $table->string('decision', 30)->nullable(); // 'approve', 'revoke', 'modify', 'extend'
            $table->text('decision_reason')->nullable(); // Reason for decision
            $table->unsignedBigInteger('decided_by')->nullable(); // Who made the decision
            $table->timestamp('decided_at')->nullable(); // When decision was made
            $table->unsignedBigInteger('new_role_id')->nullable(); // New role if modified
            $table->json('new_permissions')->nullable(); // New permissions if modified
            $table->string('new_scope_type', 30)->nullable(); // New scope if modified
            $table->unsignedBigInteger('new_scope_id')->nullable(); // New scope ID if modified
            $table->date('expiry_date')->nullable(); // New expiry if extended
            $table->timestamps();

            $table->foreign('review_id')->references('id')->on('access_reviews')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('role_id')->references('id')->on('roles')->nullOnDelete();
            $table->foreign('permission_id')->references('id')->on('permissions')->nullOnDelete();
            $table->foreign('decided_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('new_role_id')->references('id')->on('roles')->nullOnDelete();
            $table->index(['review_id', 'decision']);
            $table->index(['user_id', 'decision']);
            $table->index('decided_by');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('access_review_items');
    }
};