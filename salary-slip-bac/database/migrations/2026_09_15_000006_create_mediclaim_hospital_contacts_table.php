<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_hospital_contacts — per-hospital contact points (coordinator
 * desk, TPA desk, emergency line), each with an escalation priority so the
 * card verify page and admin directory can surface the right one first.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_hospital_contacts')) {
            Schema::create('mediclaim_hospital_contacts', function (Blueprint $table) {
                $table->id();
                $table->foreignId('hospital_id')->constrained('mediclaim_hospitals')->cascadeOnDelete();
                $table->string('designation');
                $table->string('phone');
                $table->string('email')->nullable();
                $table->string('availability')->nullable();
                $table->unsignedSmallInteger('escalation_priority')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();

                $table->index(['hospital_id', 'is_active'], 'mc_hospital_contacts_hospital_active_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_hospital_contacts');
    }
};
