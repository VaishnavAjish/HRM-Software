<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shifts', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('company_code');
            $table->string('unit')->nullable();
            $table->time('start_time');
            $table->time('end_time');
            $table->unsignedInteger('grace_minutes')->default(0);
            $table->text('description')->nullable();
            $table->timestamps();

            $table->index(['company_code', 'unit']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shifts');
    }
};
