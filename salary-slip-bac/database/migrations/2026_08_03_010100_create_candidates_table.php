<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('requisition_id')->nullable()->constrained('job_requisitions')->nullOnDelete();
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->decimal('experience_years', 4, 1)->nullable();
            $table->string('current_company')->nullable();
            $table->string('current_designation')->nullable();
            $table->json('skills')->nullable();
            $table->string('resume_path')->nullable();
            $table->string('resume_original_name')->nullable();
            $table->string('source')->default('other'); // referral | job_portal | linkedin | walk_in | other
            $table->foreignId('recruiter_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('priority')->default('medium'); // low | medium | high
            // applied | screening | shortlisted | hr_interview | technical_interview |
            // final_interview | selected | offer_sent | offer_accepted | rejected | on_hold
            $table->string('stage')->default('applied');
            $table->decimal('rating', 2, 1)->nullable();
            $table->text('notes')->nullable();
            $table->string('company_code')->nullable();
            $table->string('unit')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['company_code', 'unit', 'stage']);
            $table->index('requisition_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidates');
    }
};
