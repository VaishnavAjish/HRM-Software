<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Create MFA methods table for Domain 01.3 Multi-Factor Authentication.
 *
 * Stores enrolled MFA methods per user with support for multiple methods
 * of different types (TOTP, SMS, Email, Push, Security Key, Backup Codes).
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('mfa_methods', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->string('type', 30); // 'totp', 'sms', 'email', 'push', 'security_key', 'backup_codes'
            $table->string('name', 100)->nullable(); // User-friendly name
            $table->text('secret')->nullable(); // Encrypted secret for TOTP
            $table->string('phone_number', 20)->nullable(); // For SMS
            $table->string('email', 190)->nullable(); // For email OTP
            $table->json('device_info')->nullable(); // Device fingerprint, browser, OS
            $table->boolean('is_primary')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('enrolled_at')->nullable();
            $table->json('backup_codes')->nullable(); // Encrypted array of backup codes
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->index(['user_id', 'type']);
            $table->index(['user_id', 'is_primary']);
            $table->index(['user_id', 'is_active']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('mfa_methods');
    }
};