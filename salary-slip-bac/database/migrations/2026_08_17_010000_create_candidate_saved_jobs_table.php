<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidate_saved_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('candidate_account_id')->constrained('candidate_accounts')->cascadeOnDelete();
            $table->foreignId('job_requisition_id')->constrained('job_requisitions')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['candidate_account_id', 'job_requisition_id']);
            $table->index('job_requisition_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_saved_jobs');
    }
};
