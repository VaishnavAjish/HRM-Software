<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Create user_devices table for Domain 01.11 Device Management.
 *
 * Tracks registered/trusted/blocked devices for a user.
 * Separate from sessions - devices persist across sessions.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('user_devices', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->string('device_id', 100); // Device fingerprint
            $table->string('device_name', 100)->nullable(); // User-friendly name
            $table->string('browser', 100)->nullable();
            $table->string('os', 100)->nullable();
            $table->string('device_type', 20)->nullable(); // 'desktop', 'mobile', 'tablet'
            $table->boolean('is_trusted')->default(false);
            $table->boolean('is_blocked')->default(false);
            $table->timestamp('first_seen_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('trusted_at')->nullable();
            $table->unsignedBigInteger('trusted_by')->nullable();
            $table->timestamp('blocked_at')->nullable();
            $table->unsignedBigInteger('blocked_by')->nullable();
            $table->string('block_reason', 100)->nullable();
            $table->integer('login_count')->default(0);
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('trusted_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('blocked_by')->references('id')->on('users')->nullOnDelete();
            $table->unique(['user_id', 'device_id']);
            $table->index(['user_id', 'is_trusted']);
            $table->index(['user_id', 'is_blocked']);
            $table->index('device_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('user_devices');
    }
};