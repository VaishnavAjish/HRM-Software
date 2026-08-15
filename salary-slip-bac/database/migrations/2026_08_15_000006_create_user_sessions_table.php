<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Create user_sessions table for Domain 01.10 Session Management.
 *
 * Tracks active user sessions for management, revocation, and security monitoring.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('user_sessions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->string('session_id', 100)->unique(); // JWT token identifier
            $table->string('device_id', 100)->nullable(); // Device fingerprint
            $table->string('device_name', 100)->nullable(); // User-friendly device name
            $table->string('browser', 100)->nullable();
            $table->string('os', 100)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('location', 190)->nullable(); // City, Country
            $table->text('user_agent')->nullable();
            $table->string('auth_method', 30)->default('password'); // password, otp, mfa, passkey, sso, magic_link
            $table->boolean('mfa_verified')->default(false);
            $table->boolean('is_current')->default(true);
            $table->boolean('is_trusted')->default(false);
            $table->timestamp('last_activity_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->unsignedBigInteger('revoked_by')->nullable(); // User who revoked
            $table->string('revoke_reason', 100)->nullable();
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('revoked_by')->references('id')->on('users')->nullOnDelete();
            $table->index(['user_id', 'is_current']);
            $table->index(['user_id', 'revoked_at']);
            $table->index(['user_id', 'expires_at']);
            $table->index('session_id');
            $table->index('device_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('user_sessions');
    }
};