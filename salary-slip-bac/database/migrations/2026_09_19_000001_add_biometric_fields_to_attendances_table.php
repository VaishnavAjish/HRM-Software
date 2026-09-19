<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            if (!Schema::hasColumn('attendances', 'check_in')) {
                $table->string('check_in')->nullable();
            }
            if (!Schema::hasColumn('attendances', 'check_out')) {
                $table->string('check_out')->nullable();
            }
            if (!Schema::hasColumn('attendances', 'work_hours')) {
                $table->string('work_hours')->nullable();
            }
            if (!Schema::hasColumn('attendances', 'device_serial')) {
                $table->string('device_serial')->nullable();
            }
            if (!Schema::hasColumn('attendances', 'raw_punches')) {
                $table->text('raw_punches')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropColumn(['check_in', 'check_out', 'work_hours', 'device_serial', 'raw_punches']);
        });
    }
};
