<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_members — covered members (self/spouse/child/parent),
 * effective-dated. Removed members are retained (status flip) so past
 * claims and cards still resolve who they covered.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_members')) {
            Schema::create('mediclaim_members', function (Blueprint $table) {
                $table->id();
                $table->foreignId('enrollment_id')->constrained('mediclaim_enrollments')->cascadeOnDelete();
                $table->foreignId('employee_user_id')->constrained('users')->cascadeOnDelete();
                $table->string('full_name');
                $table->string('relationship_type'); // self, spouse, child, parent
                $table->date('date_of_birth')->nullable();
                $table->string('gender')->nullable();
                $table->string('status')->default('active'); // active, inactive, removed
                $table->date('effective_from')->nullable();
                $table->date('effective_to')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['employee_user_id', 'relationship_type', 'status'], 'mc_members_employee_rel_status_idx');
                $table->index(['enrollment_id', 'status'], 'mc_members_enrollment_status_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_members');
    }
};
