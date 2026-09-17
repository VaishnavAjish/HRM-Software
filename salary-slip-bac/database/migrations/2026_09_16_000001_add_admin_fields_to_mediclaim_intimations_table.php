<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two additive gaps found while building the admin-facing "Notify Office"
 * screen (`Mediclaim\Admin\IntimationController`):
 *
 * - `IntimationController@store` (self-service) never captured the
 *   non-network hospital fields the frontend's `NotifyOfficeForm.jsx`
 *   already sends (`isNonNetworkHospital`/`nonNetworkHospitalName`/
 *   `nonNetworkReason`) — there was no column to put them in, so an
 *   employee notifying about treatment at a non-network hospital had that
 *   detail silently dropped. Mirrors the same three fields already added to
 *   `mediclaim_claims` for the same reason.
 * - There was no way for the office/HR to record a response against an
 *   intimation once they'd seen it (`office_remarks`) or who reviewed it
 *   and when (`reviewed_by`/`reviewed_at`) — needed by the new
 *   `Admin\IntimationController@close` action.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('mediclaim_intimations') && ! Schema::hasColumn('mediclaim_intimations', 'is_non_network_hospital')) {
            Schema::table('mediclaim_intimations', function (Blueprint $table) {
                $table->boolean('is_non_network_hospital')->default(false)->after('hospital_id');
                $table->string('non_network_hospital_name')->nullable()->after('is_non_network_hospital');
                $table->text('non_network_reason')->nullable()->after('non_network_hospital_name');
            });
        }

        if (Schema::hasTable('mediclaim_intimations') && ! Schema::hasColumn('mediclaim_intimations', 'office_remarks')) {
            Schema::table('mediclaim_intimations', function (Blueprint $table) {
                $table->text('office_remarks')->nullable()->after('employee_remarks');
                $table->foreignId('reviewed_by')->nullable()->after('notified_by')->constrained('users')->nullOnDelete();
                $table->dateTime('reviewed_at')->nullable()->after('reviewed_by');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('mediclaim_intimations') && Schema::hasColumn('mediclaim_intimations', 'is_non_network_hospital')) {
            Schema::table('mediclaim_intimations', function (Blueprint $table) {
                $table->dropColumn(['is_non_network_hospital', 'non_network_hospital_name', 'non_network_reason']);
            });
        }

        if (Schema::hasTable('mediclaim_intimations') && Schema::hasColumn('mediclaim_intimations', 'office_remarks')) {
            Schema::table('mediclaim_intimations', function (Blueprint $table) {
                $table->dropForeign(['reviewed_by']);
                $table->dropColumn(['office_remarks', 'reviewed_by', 'reviewed_at']);
            });
        }
    }
};
