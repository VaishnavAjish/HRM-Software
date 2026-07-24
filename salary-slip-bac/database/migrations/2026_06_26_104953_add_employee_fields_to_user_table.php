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
            $table->date('resignation_date')->nullable()->after('remember_token');
            $table->string('city')->nullable()->after('resignation_date');
            $table->string('pin')->nullable()->after('city');
            $table->string('state')->nullable()->after('pin');
            $table->string('pf_no')->nullable()->after('state');
            $table->string('esi_no')->nullable()->after('pf_no');
            $table->string('branch')->nullable()->after('esi_no');
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
