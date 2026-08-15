<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Create languages table for Domain 00.3 Global Master Data.
 *
 * Stores supported languages for user interface localization.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('languages', function (Blueprint $table) {
            $table->id();
            $table->string('code', 10)->unique();
            $table->string('name', 100);
            $table->string('native_name', 100);
            $table->string('directionality', 10)->default('ltr'); // 'ltr' or 'rtl'
            $table->boolean('status')->default(true);
            $table->timestamps();

            $table->index('code');
            $table->index('directionality');
            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('languages');
    }
};