<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Create security_policies table for Domain 01.12 Security Policies.
 *
 * Centralized security policy configuration for the application.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('security_policies', function (Blueprint $table) {
            $table->id();
            $table->string('name', 190);
            $table->string('code', 100)->unique();
            $table->text('description')->nullable();
            $table->string('type', 50); // 'password', 'ip', 'geo', 'network', 'device', 'country', 'risk', 'brute_force', 'credential_stuffing'
            $table->json('configuration')->nullable(); // JSON configuration
            $table->string('scope', 30)->default('global'); // 'global', 'tenant', 'company', 'role', 'user'
            $table->unsignedBigInteger('scope_id')->nullable(); // ID for scoped policies
            $table->boolean('is_active')->default(true);
            $table->integer('priority')->default(0); // Higher priority wins
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->index(['type', 'is_active']);
            $table->index(['scope', 'scope_id']);
            $table->index(['effective_from', 'effective_to']);
            $table->index('priority');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('security_policies');
    }
};