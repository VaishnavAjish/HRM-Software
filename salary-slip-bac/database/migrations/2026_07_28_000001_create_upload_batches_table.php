<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('upload_batches', function (Blueprint $table) {
            $table->id();
            $table->string('type'); // 'salary' | 'employee'
            $table->string('company_code')->nullable();
            $table->string('unit')->nullable();
            $table->string('month')->nullable();
            $table->string('year')->nullable();
            $table->string('file_name')->nullable();
            $table->unsignedInteger('total_rows')->default(0);
            $table->unsignedInteger('success_count')->default(0);
            $table->unsignedInteger('failed_count')->default(0);
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['type', 'company_code']);
        });

        Schema::create('upload_batch_rows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('batch_id')->constrained('upload_batches')->cascadeOnDelete();
            $table->unsignedInteger('row_number');
            $table->string('status'); // 'passed' | 'failed'
            $table->string('reason')->nullable();
            $table->json('row_data')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('upload_batch_rows');
        Schema::dropIfExists('upload_batches');
    }
};
