<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * user_locations — which users are assigned to which location (02.04).
 *
 * Mirrors user_units: the pivot is the normalised membership, while
 * users.unit/users.branch remain the load-bearing legacy strings that
 * authorization reads. This table is future scope material, not a rename of the
 * legacy column.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('user_locations')) {
            return;
        }

        Schema::create('user_locations', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('location_id');
            $table->timestamps();

            $table->unique(['user_id', 'location_id']);
            $table->index('location_id');

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('location_id')->references('id')->on('locations')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_locations');
    }
};
