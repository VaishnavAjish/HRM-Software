<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Give SLA rules the department dimension the screen has always claimed.
 *
 * The tab is called "Department SLA Rules" but the table was keyed on priority
 * alone, so Payroll and IT were held to the same four targets no matter what an
 * administrator set. A department column with a per-(department, priority)
 * unique key is what makes the name true.
 *
 * Empty string, not NULL, marks the company-wide default. Postgres treats NULLs
 * as distinct in a unique index, so a nullable column would happily accept two
 * competing "global urgent" rows and then pick between them arbitrarily.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ticket_sla_rules', function (Blueprint $table) {
            $table->string('department')->default('')->after('id');
        });

        // The old key was priority alone; it has to go before the pair can exist.
        Schema::table('ticket_sla_rules', function (Blueprint $table) {
            $table->dropUnique('ticket_sla_rules_priority_unique');
        });

        Schema::table('ticket_sla_rules', function (Blueprint $table) {
            $table->unique(['department', 'priority'], 'ticket_sla_rules_department_priority_unique');
            $table->index('department');
        });
    }

    public function down(): void
    {
        Schema::table('ticket_sla_rules', function (Blueprint $table) {
            $table->dropUnique('ticket_sla_rules_department_priority_unique');
            $table->dropIndex(['department']);
        });

        // Rolling back cannot keep department overrides: the old unique key
        // allows one row per priority, so anything beyond the global set would
        // make the index fail to build.
        \Illuminate\Support\Facades\DB::table('ticket_sla_rules')->where('department', '!=', '')->delete();

        Schema::table('ticket_sla_rules', function (Blueprint $table) {
            $table->dropColumn('department');
        });

        Schema::table('ticket_sla_rules', function (Blueprint $table) {
            $table->unique('priority', 'ticket_sla_rules_priority_unique');
        });
    }
};
