<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('job_requisitions', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            $table->string('designation')->nullable();
            $table->string('employment_type')->default('full_time'); // full_time | part_time | contract | intern
            $table->unsignedInteger('openings')->default(1);
            $table->string('priority')->default('medium'); // low | medium | high | urgent
            $table->string('status')->default('draft'); // draft | pending_approval | approved | posted | on_hold | closed | cancelled
            $table->decimal('min_experience', 4, 1)->nullable();
            $table->decimal('max_experience', 4, 1)->nullable();
            $table->decimal('salary_min', 12, 2)->nullable();
            $table->decimal('salary_max', 12, 2)->nullable();
            $table->text('description')->nullable();
            $table->text('requirements')->nullable();
            $table->string('company_code')->nullable();
            $table->string('unit')->nullable();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->date('target_closing_date')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('posted_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['company_code', 'unit', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('job_requisitions');
    }
};
