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
        Schema::table('users', function (Blueprint $table) {
            $table->string('form_no')->nullable();
            $table->date('trial_date')->nullable();

            $table->string('mobile_no_2')->nullable();

            $table->string('last_company_name')->nullable();
            $table->text('last_company_address')->nullable();

            $table->string('experience')->nullable();
            $table->text('reason_for_leaving')->nullable();

            $table->string('hastak_name')->nullable();
            $table->string('hastak_code')->nullable();
            $table->string('hastak_mobile')->nullable();

            $table->string('contractor')->nullable();

            $table->string('manager_signature')->nullable();
            $table->string('hastak_signature')->nullable();
            $table->string('hr_signature')->nullable();
            $table->string('akar')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            //
        });
    }
};
