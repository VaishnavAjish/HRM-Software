<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('job_requisitions', function (Blueprint $table) {
            $table->foreignId('department_manager_id')->nullable()->after('department_id')
                ->constrained('users')->nullOnDelete();
            $table->index('department_manager_id');
        });
    }

    public function down(): void
    {
        Schema::table('job_requisitions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('department_manager_id');
        });
    }
};
