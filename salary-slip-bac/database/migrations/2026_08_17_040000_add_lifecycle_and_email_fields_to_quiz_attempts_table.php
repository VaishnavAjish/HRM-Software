<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Revoke previously hard-deleted the row (see QuizAttemptController::destroy,
 * pre-Phase-B) — that lost assignment/email history the moment HR clicked
 * revoke, and a stale queued invitation job had no way to notice the
 * assignment was gone. This adds a real lifecycle instead: `status` already
 * carries 'revoked' fine as a plain string (no enum constraint to widen),
 * these columns hold who/when/why.
 *
 * Assignment success and email delivery success are also separate events —
 * `email_status` etc. track the invitation independently of the assessment
 * itself, so a mail-provider failure never has to imply "the assignment
 * failed too."
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('quiz_attempts', function (Blueprint $table) {
            $table->timestamp('revoked_at')->nullable()->after('status');
            $table->foreignId('revoked_by')->nullable()->after('revoked_at')->constrained('users')->nullOnDelete();
            $table->string('revoke_reason', 500)->nullable()->after('revoked_by');

            // not_requested | pending | queued | sending | sent | failed
            $table->string('email_status')->default('not_requested')->after('link_expires_at');
            $table->timestamp('email_queued_at')->nullable()->after('email_status');
            $table->timestamp('email_sent_at')->nullable()->after('email_queued_at');
            $table->timestamp('email_failed_at')->nullable()->after('email_sent_at');
            $table->string('email_failure_reason', 500)->nullable()->after('email_failed_at');
            $table->unsignedInteger('email_attempt_count')->default(0)->after('email_failure_reason');
            $table->string('email_provider_message_id')->nullable()->after('email_attempt_count');

            $table->index('email_status');
            $table->index('revoked_at');
        });
    }

    public function down(): void
    {
        Schema::table('quiz_attempts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('revoked_by');
            $table->dropColumn([
                'revoked_at', 'revoke_reason',
                'email_status', 'email_queued_at', 'email_sent_at', 'email_failed_at',
                'email_failure_reason', 'email_attempt_count', 'email_provider_message_id',
            ]);
        });
    }
};
