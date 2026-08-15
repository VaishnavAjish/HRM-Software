<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Wave 4 — Candidate CRM: named talent pools (e.g. "Engineering 2026",
 * "Client A - shortlist") and the candidate↔pool pivot. A candidate can live
 * in many pools; the pivot is unique per (candidate, pool).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talent_pools', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->text('description')->nullable();
            $table->string('color', 20)->default('#0ea5e9');
            $table->string('company_code')->nullable()->index();
            $table->string('unit')->nullable()->index();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['company_code', 'unit']);
        });

        Schema::create('candidate_talent_pool', function (Blueprint $table) {
            $table->id();
            $table->foreignId('candidate_id')->constrained('candidates')->cascadeOnDelete();
            $table->foreignId('talent_pool_id')->constrained('talent_pools')->cascadeOnDelete();
            $table->foreignId('added_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['candidate_id', 'talent_pool_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_talent_pool');
        Schema::dropIfExists('talent_pools');
    }
};