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
            $table->text('members')->nullable();
            $table->string('joining_date')->nullable();
            $table->string('department')->nullable();
            $table->string('manager_name')->nullable();
            $table->string('salary')->nullable();

            $table->string('emp_whatsapp_no')->nullable();

            $table->string('punching_no')->nullable();

            $table->string('village')->nullable();
            $table->string('taluka')->nullable();
            $table->string('district')->nullable();

            $table->string('birth_place')->nullable();

            $table->string('gender')->nullable();
            $table->string('cast')->nullable();

            $table->string('marital_status')->nullable();
            $table->string('blood_group')->nullable();

            $table->string('reference_name')->nullable();
            $table->string('reference_mobile_no')->nullable();

            $table->string('aadhar_card_no')->nullable();
            $table->string('pan_card_no')->nullable();

            $table->string('bank_name')->nullable();
            $table->string('bank_ifsc_code')->nullable();
            $table->string('bank_account_no')->nullable();

            $table->string('education')->nullable();

            $table->string('emp_signature')->nullable();
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
