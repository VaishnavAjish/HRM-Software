<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidate_experiences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('candidate_account_id')->constrained('candidate_accounts')->cascadeOnDelete();
            $table->string('company');
            $table->string('designation');
            $table->string('location')->nullable();
            $table->date('start_date');
            $table->date('end_date')->nullable();
            $table->boolean('is_current')->default(false);
            $table->text('description')->nullable();
            $table->timestamps();

            $table->index(['candidate_account_id', 'start_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_experiences');
    }
};
