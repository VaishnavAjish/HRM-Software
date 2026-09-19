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
                $table->string('check_in')->nullable()->after('status');
            }
            if (!Schema::hasColumn('attendances', 'check_out')) {
                $table->string('check_out')->nullable()->after('check_in');
            }
            if (!Schema::hasColumn('attendances', 'work_hours')) {
                $table->string('work_hours')->nullable()->after('check_out');
            }
            if (!Schema::hasColumn('attendances', 'device_serial')) {
                $table->string('device_serial')->nullable()->after('work_hours');
            }
            if (!Schema::hasColumn('attendances', 'raw_punches')) {
                $table->text('raw_punches')->nullable()->after('device_serial');
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
