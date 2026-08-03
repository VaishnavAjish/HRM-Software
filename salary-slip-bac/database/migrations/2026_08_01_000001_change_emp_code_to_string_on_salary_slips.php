<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * emp_code was an integer column, so any employee code with a letter in
     * it (e.g. "S1145") could never be stored here — it was rejected before
     * insert by the numeric-only guard in AdminController::salarySlipImport,
     * even though users.emp_code is a plain string(100) and already allows
     * exactly that format. Bringing this column in line with users.emp_code
     * is what lets that guard be relaxed to "non-empty" instead of "numeric".
     */
    public function up(): void
    {
        Schema::table('salary_slips', function (Blueprint $table) {
            $table->string('emp_code', 100)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('salary_slips', function (Blueprint $table) {
            $table->integer('emp_code')->nullable()->change();
        });
    }
};
