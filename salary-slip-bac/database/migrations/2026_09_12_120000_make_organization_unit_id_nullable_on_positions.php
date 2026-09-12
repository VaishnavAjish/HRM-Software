<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Allows a Designation (organization_positions row) to exist without a
 * parent department/org unit — a standalone designation, created the same
 * simple way a Department itself is (just a name, nothing mandatory nested
 * under it). Previously organization_unit_id was NOT NULL with a unique
 * (organization_unit_id, code) index; this drops that constraint in favour
 * of two partial unique indexes so codes still can't collide within a
 * department, or among standalone designations, but a department-scoped
 * code and a global one may coincidentally match without conflict.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE organization_positions ALTER COLUMN organization_unit_id DROP NOT NULL');
        DB::statement('ALTER TABLE organization_positions DROP CONSTRAINT IF EXISTS organization_positions_organization_unit_id_code_unique');
        DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS organization_positions_unit_code_unique ON organization_positions (organization_unit_id, code) WHERE organization_unit_id IS NOT NULL');
        DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS organization_positions_global_code_unique ON organization_positions (code) WHERE organization_unit_id IS NULL');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS organization_positions_global_code_unique');
        DB::statement('DROP INDEX IF EXISTS organization_positions_unit_code_unique');
        DB::statement('DELETE FROM organization_positions WHERE organization_unit_id IS NULL');
        DB::statement('ALTER TABLE organization_positions ALTER COLUMN organization_unit_id SET NOT NULL');
        DB::statement('ALTER TABLE organization_positions ADD CONSTRAINT organization_positions_organization_unit_id_code_unique UNIQUE (organization_unit_id, code)');
    }
};
