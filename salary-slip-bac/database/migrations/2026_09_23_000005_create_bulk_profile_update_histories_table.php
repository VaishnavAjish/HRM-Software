<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('bulk_profile_update_histories')) {
            Schema::create('bulk_profile_update_histories', function (Blueprint $table) {
                $table->id();
                $table->string('batch_id')->unique();
                $table->string('company_code')->nullable();
                $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('actor_name')->nullable();
                $table->unsignedInteger('updated_employees')->default(0);
                $table->unsignedInteger('total_fields_updated')->default(0);
                $table->unsignedInteger('skipped_errors')->default(0);
                $table->json('changes')->nullable();
                $table->timestamps();

                $table->index(['company_code', 'created_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('bulk_profile_update_histories');
    }
};
