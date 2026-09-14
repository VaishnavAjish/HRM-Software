<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_admin_activity_logs — non-claim admin audit trail (hospital,
 * policy, rule-book, reviewer-assignment edits), written by
 * MediclaimActivityLogSupport, same shape as OrganizationActivityLogSupport.
 * Claim-specific history lives in `mediclaim_claim_events` instead.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_admin_activity_logs')) {
            Schema::create('mediclaim_admin_activity_logs', function (Blueprint $table) {
                $table->id();
                $table->string('company_code')->nullable();
                $table->string('subject_type');
                $table->unsignedBigInteger('subject_id')->nullable();
                $table->string('activity_type');
                $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
                $table->json('before_values')->nullable();
                $table->json('after_values')->nullable();
                $table->text('description')->nullable();
                $table->string('ip_address')->nullable();
                $table->string('user_agent', 512)->nullable();
                $table->timestamps();

                $table->index(['subject_type', 'subject_id'], 'mc_admin_activity_logs_subject_idx');
                $table->index(['activity_type', 'created_at'], 'mc_admin_activity_logs_activity_created_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_admin_activity_logs');
    }
};
