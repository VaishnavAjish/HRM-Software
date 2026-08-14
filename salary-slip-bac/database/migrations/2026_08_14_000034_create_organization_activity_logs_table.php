<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * organization_activity_logs — immutable organization activity records (DOMAIN 02.01, 02.09).
 *
 * Enterprise history, change request audit trail, and all organization mutations.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('organization_activity_logs')) {
            return;
        }

        Schema::create('organization_activity_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('enterprise_id')->nullable();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->string('activity_type', 60); // enterprise_created, enterprise_updated, legal_entity_created, change_request_submitted, change_request_approved, change_request_applied, etc.
            $table->string('subject_type', 60); // enterprise, legal_entity, organization_unit, organization_location, financial_organization, change_request, etc.
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->unsignedBigInteger('actor_id')->nullable();
            $table->json('before_values')->nullable();
            $table->json('after_values')->nullable();
            $table->text('description')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 500)->nullable();
            $table->timestamps();

            $table->index('enterprise_id');
            $table->index('company_id');
            $table->index('activity_type');
            $table->index('subject_type');
            $table->index('subject_id');
            $table->index('actor_id');
            $table->index('created_at');

            $table->foreign('enterprise_id')->references('id')->on('enterprises')->nullOnDelete();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreign('actor_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_activity_logs');
    }
};