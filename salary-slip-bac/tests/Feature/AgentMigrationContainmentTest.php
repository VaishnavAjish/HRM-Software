<?php

namespace Tests\Feature;

use Database\Seeders\PermissionRegistrySeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * S1 containment: the agent-permission migration is neutralised and the audit
 * command that reports its damage is strictly read-only.
 *
 * Runs on the disposable database only (see phpunit.disposable.xml).
 */
class AgentMigrationContainmentTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = '2026_08_14_000000_ensure_agent_and_recruitment_permissions.php';

    public function test_neutralised_migration_up_grants_nothing(): void
    {
        $this->seed(RbacSeeder::class);

        $before = [
            'role_permissions' => DB::table('role_permissions')->count(),
            'assignments' => Schema::hasTable('authorization_role_assignments')
                ? DB::table('authorization_role_assignments')->count() : 0,
        ];

        $migration = require database_path('migrations/' . self::MIGRATION);
        $migration->up();
        $migration->down();

        $after = [
            'role_permissions' => DB::table('role_permissions')->count(),
            'assignments' => Schema::hasTable('authorization_role_assignments')
                ? DB::table('authorization_role_assignments')->count() : 0,
        ];

        $this->assertSame($before, $after, 'The neutralised migration must not add or remove any rows.');

        if (Schema::hasTable('authorization_role_assignments')) {
            $this->assertSame(
                0,
                DB::table('authorization_role_assignments')->where('assignment_source', 'AGENT_PERMISSION_FIX')->count(),
                'The neutralised migration must not create AGENT_PERMISSION_FIX assignments.'
            );
        }
    }

    public function test_audit_command_writes_nothing(): void
    {
        $this->seed(RbacSeeder::class);
        $this->seed(PermissionRegistrySeeder::class);

        $tables = array_filter([
            'role_permissions',
            'permissions',
            Schema::hasTable('authorization_role_assignments') ? 'authorization_role_assignments' : null,
            Schema::hasTable('authorization_decision_logs') ? 'authorization_decision_logs' : null,
            Schema::hasTable('authorization_permission_audit_logs') ? 'authorization_permission_audit_logs' : null,
        ]);

        $before = [];
        foreach ($tables as $table) {
            $before[$table] = DB::table($table)->count();
        }

        $exit = Artisan::call('authz:audit-agent-migration');

        $after = [];
        foreach ($tables as $table) {
            $after[$table] = DB::table($table)->count();
        }

        $this->assertSame(0, $exit, 'The audit command should exit successfully.');
        $this->assertSame($before, $after, 'The audit command must not write to any table.');
    }
}
