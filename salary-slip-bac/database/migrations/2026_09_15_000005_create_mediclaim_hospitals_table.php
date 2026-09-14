<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_hospitals — hospital directory (network + non-network). Inactive
 * hospitals are retained (status flip, never deleted) so historical claims
 * still resolve the hospital they were treated at.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_hospitals')) {
            Schema::create('mediclaim_hospitals', function (Blueprint $table) {
                $table->id();
                $table->string('company_code');
                $table->string('name');
                $table->text('address')->nullable();
                $table->string('city')->nullable();
                $table->string('state')->nullable();
                $table->string('pincode')->nullable();
                $table->json('specialties')->nullable();
                $table->boolean('is_cashless')->default(false);
                $table->date('active_from')->nullable();
                $table->date('active_to')->nullable();
                $table->string('status')->default('active'); // active, inactive
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['company_code', 'status'], 'mc_hospitals_company_status_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_hospitals');
    }
};
