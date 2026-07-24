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
        Schema::table('salary_slips', function (Blueprint $table) {
            $table->date('resignation_date')->nullable();
            $table->string('working_days')->nullable();
            $table->string('present_days')->nullable();
            $table->string('salary')->nullable();
            $table->string('comm')->nullable();
            $table->string('other')->nullable();
            $table->string('total_deduction')->nullable();
            $table->string('net_salary')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('salary_slips', function (Blueprint $table) {
            //
        });
    }
};
