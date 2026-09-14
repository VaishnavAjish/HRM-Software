<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_rule_book_acknowledgements — one row per employee acknowledging
 * a published rule book, with IP/UA for audit. A simple insert ledger keyed
 * by the unique(rule_book_id, user_id) constraint, queried via DB::table
 * rather than a dedicated Eloquent model.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_rule_book_acknowledgements')) {
            Schema::create('mediclaim_rule_book_acknowledgements', function (Blueprint $table) {
                $table->id();
                $table->foreignId('rule_book_id')->constrained('mediclaim_rule_books')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->timestamp('acknowledged_at')->nullable();
                $table->string('ip_address')->nullable();
                $table->string('user_agent', 512)->nullable();
                $table->timestamps();

                $table->unique(['rule_book_id', 'user_id'], 'mc_rule_book_acks_unique');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_rule_book_acknowledgements');
    }
};
