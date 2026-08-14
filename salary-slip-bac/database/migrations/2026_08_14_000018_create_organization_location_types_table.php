<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * organization_location_types — configurable location types (DOMAIN 02.04).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('organization_location_types')) {
            return;
        }

        Schema::create('organization_location_types', function (Blueprint $table) {
            $table->id();
            $table->string('code', 40)->unique();
            $table->string('name', 100);
            $table->string('description', 500)->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index('is_active');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_location_types');
    }
};