<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Create privileged_access_requests table for Domain 01.13 Privileged Access.
 *
 * Tracks break-glass, JIT access, and impersonation requests.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('privileged_access_requests', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('requester_id');
            $table->unsignedBigInteger('target_user_id')->nullable(); // For impersonation
            $table->string('type', 30); // 'break_glass', 'jit', 'impersonation'
            $table->text('reason');
            $table->string('requested_role', 100)->nullable(); // Role being requested
            $table->json('requested_permissions')->nullable(); // Specific permissions
            $table->string('scope_type', 30)->nullable(); // 'tenant', 'company', 'legal_entity', 'department', 'global'
            $table->unsignedBigInteger('scope_id')->nullable(); // Scope ID
            $table->string('status', 30)->default('pending'); // 'pending', 'approved', 'rejected', 'active', 'expired', 'revoked'
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('activated_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->unsignedBigInteger('revoked_by')->nullable();
            $table->string('revoke_reason', 100)->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('requester_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('target_user_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('approved_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('revoked_by')->references('id')->on('users')->nullOnDelete();
            $table->index(['requester_id', 'status']);
            $table->index(['target_user_id', 'status']);
            $table->index(['status', 'expires_at']);
            $table->index('type');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('privileged_access_requests');
    }
};