<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Wave 4 — Candidate CRM: outbound communication log. Every message is
 * recorded; for type=email the controller attempts a real send and stores the
 * resulting status (queued/sent/failed) plus any failure reason.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidate_communications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('candidate_id')->constrained('candidates')->cascadeOnDelete();
            // email | sms | phone | other
            $table->string('type', 20)->default('email');
            // outbound | inbound (inbound reserved for future reply handling)
            $table->string('direction', 20)->default('outbound');
            $table->string('subject', 255)->nullable();
            $table->text('body');
            // queued | sent | failed
            $table->string('status', 20)->default('queued');
            $table->foreignId('sent_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('sent_at')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->index(['candidate_id', 'created_at']);
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_communications');
    }
};