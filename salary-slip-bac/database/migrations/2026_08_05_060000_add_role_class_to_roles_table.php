<?php

use App\Support\RoleHierarchy;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The immutable tier a role sits in, and how high it ranks.
 *
 * Authorisation previously had only two states — super administrator or not —
 * so an Admin could either manage everything or nothing. The hierarchy needs a
 * third: Admin manages Employee/Viewer/Custom but never another Admin.
 *
 * role_class is derived from the CODE at backfill, never the display name, so
 * renaming "Admin" changes nothing about what it can do. management_rank is
 * stored alongside it for ordering and for index-friendly comparisons.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('roles')) {
            return;
        }

        Schema::table('roles', function (Blueprint $table) {
            if (!Schema::hasColumn('roles', 'role_class')) {
                $table->string('role_class', 32)->default(RoleHierarchy::CUSTOM)->index();
            }
            if (!Schema::hasColumn('roles', 'management_rank')) {
                $table->unsignedSmallInteger('management_rank')->default(30);
            }
            if (!Schema::hasColumn('roles', 'is_hidden')) {
                $table->boolean('is_hidden')->default(false)->index();
            }
        });

        // Backfill from the code, which is the stable identity. Anything not
        // named here stays CUSTOM, which is the safe default: CUSTOM manages
        // nothing.
        $byCode = [
            'super_administrator' => RoleHierarchy::INTERNAL_SUPER_ADMIN,
            'super_admin' => RoleHierarchy::INTERNAL_SUPER_ADMIN,
            'tenant_administrator' => RoleHierarchy::ADMIN,
            'employee' => RoleHierarchy::EMPLOYEE,
            'viewer' => RoleHierarchy::VIEWER,
        ];

        foreach ($byCode as $code => $class) {
            DB::table('roles')->where('code', $code)->update([
                'role_class' => $class,
                'management_rank' => RoleHierarchy::RANKS[$class],
            ]);
        }

        // The internal identity is hidden; nothing else is.
        DB::table('roles')
            ->whereIn('code', ['super_administrator', 'super_admin'])
            ->update(['is_hidden' => true]);
    }

    public function down(): void
    {
        if (!Schema::hasTable('roles')) {
            return;
        }

        Schema::table('roles', function (Blueprint $table) {
            foreach (['role_class', 'management_rank', 'is_hidden'] as $column) {
                if (Schema::hasColumn('roles', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
