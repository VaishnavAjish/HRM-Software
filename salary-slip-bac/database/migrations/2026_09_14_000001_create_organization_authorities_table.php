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
        if (! Schema::hasTable('organization_authorities')) {
            Schema::create('organization_authorities', function (Blueprint $table) {
                $table->id();
                $table->string('name', 190);
                $table->string('role', 190)->default('Authority Parent');
                $table->json('child_ids')->nullable();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('organization_authorities');
    }
};
