<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_cards — one card per approved member. Only `hash('sha256', $token)`
 * is ever persisted in `qr_token_hash`; the plaintext token is returned once
 * at generation and never stored. Regeneration creates a new row and points
 * `superseded_by_card_id` at the old one (never deletes); revoke() nulls the
 * hash so a revoked token stops matching even under a status-check bug.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_cards')) {
            Schema::create('mediclaim_cards', function (Blueprint $table) {
                $table->id();
                $table->foreignId('member_id')->constrained('mediclaim_members')->cascadeOnDelete();
                $table->foreignId('enrollment_id')->constrained('mediclaim_enrollments')->cascadeOnDelete();
                $table->string('card_number')->nullable();
                $table->string('qr_token_hash', 64)->nullable()->unique();
                $table->string('status')->default('active'); // active, revoked, superseded, expired
                $table->date('valid_from')->nullable();
                $table->date('valid_to')->nullable();
                $table->foreignId('superseded_by_card_id')->nullable()->constrained('mediclaim_cards')->nullOnDelete();
                $table->timestamp('issued_at')->nullable();
                $table->timestamp('revoked_at')->nullable();
                $table->foreignId('revoked_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['member_id', 'status'], 'mc_cards_member_status_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_cards');
    }
};
