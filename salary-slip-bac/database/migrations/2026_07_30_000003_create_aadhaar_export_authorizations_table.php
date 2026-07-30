<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side record of one approved full-Aadhaar export.
 *
 * A signed stateless token could carry the same claims, but it could not be
 * *spent*: single use for a PDF download has to be recorded somewhere, and this
 * table is also what makes an issued authorization auditable and revocable after
 * the fact. It never stores the Aadhaar number or the raw token.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('aadhaar_export_authorizations', function (Blueprint $table) {
            $table->id();

            // Safe to hand to the client and to quote in an audit entry.
            $table->uuid('uuid')->unique();

            // Only ever a hash. A leaked database row must not yield a usable
            // token, and the raw value exists solely in the issuing response.
            $table->string('token_hash', 64)->unique();

            $table->foreignId('actor_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('target_user_id')->constrained('users')->cascadeOnDelete();

            $table->string('surface', 32);      // APPOINTMENT | EMPLOYEE
            $table->string('export_type', 16);  // PRINT | PDF
            $table->string('permission');       // the key that was checked

            $table->string('organization_code')->nullable();
            $table->string('unit')->nullable();

            $table->timestamp('expires_at');
            $table->timestamp('used_at')->nullable();

            $table->string('request_id')->nullable();
            $table->unsignedBigInteger('audit_log_id')->nullable();

            $table->timestamps();

            $table->index(['actor_user_id', 'target_user_id']);
            $table->index(['expires_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('aadhaar_export_authorizations');
    }
};
