<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_claim_events — append-only workflow timeline. `notified_at` is
 * the idempotency anchor for event-anchored notifications: MediclaimNotifier
 * proceeds only after `UPDATE ... SET notified_at = now() WHERE id = ? AND
 * notified_at IS NULL` affects exactly one row.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_claim_events')) {
            Schema::create('mediclaim_claim_events', function (Blueprint $table) {
                $table->id();
                $table->foreignId('claim_id')->constrained('mediclaim_claims')->cascadeOnDelete();
                $table->string('event_type');
                $table->string('from_status')->nullable();
                $table->string('to_status')->nullable();
                $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('actor_role')->nullable();
                $table->json('before_values')->nullable();
                $table->json('after_values')->nullable();
                $table->text('description')->nullable();
                $table->string('ip_address', 45)->nullable();
                $table->text('user_agent')->nullable();
                $table->timestamp('notified_at')->nullable();
                $table->timestamps();

                $table->index(['claim_id', 'created_at'], 'mc_claim_events_claim_created_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_claim_events');
    }
};
