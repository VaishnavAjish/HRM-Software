<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Create time_zones table for Domain 00.3 Global Master Data.
 *
 * Stores standard IANA time-zone identifiers. Uses standard time-zone
 * identifiers per Domain 00.03. Do not store only fixed UTC offsets as
 * authoritative time-zone identity.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('time_zones', function (Blueprint $table) {
            $table->id();
            $table->string('identifier', 100)->unique(); // IANA zone name, e.g. "America/New_York"
            $table->float('utc_offset', 5, 2)->nullable(); // UTC offset in hours
            $table->boolean('is_dst')->default(false);
            $table->float('dst_offset', 5, 2)->nullable(); // DST offset in hours
            $table->string('dst_start', 50)->nullable(); // e.g., "2024-03-10T02:00:00"
            $table->string('dst_end', 50)->nullable();   // e.g., "2024-11-03T02:00:00"
            $table->boolean('status')->default(true);
            $table->timestamps();

            $table->index('identifier');
            $table->index('is_dst');
            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('time_zones');
    }
};