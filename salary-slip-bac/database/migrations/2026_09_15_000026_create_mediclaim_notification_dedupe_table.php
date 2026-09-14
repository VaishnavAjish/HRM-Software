<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_notification_dedupe — idempotency ledger for cron-triggered
 * notifications that have no natural anchoring event row (expiry sweeps,
 * overdue reminders). `dedupe_key` is deterministic (e.g.
 * "card_expiring:{$cardId}:{$windowDay}"); MediclaimNotifier settles the
 * race with `insertOrIgnore` + affected-rows check, the same recipe as
 * TicketNumber's counter create-race.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_notification_dedupe')) {
            Schema::create('mediclaim_notification_dedupe', function (Blueprint $table) {
                $table->id();
                $table->string('dedupe_key')->unique();
                $table->string('notification_type')->nullable();
                $table->timestamp('sent_at')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_notification_dedupe');
    }
};
