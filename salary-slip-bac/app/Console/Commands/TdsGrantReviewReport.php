<?php

namespace App\Console\Commands;

use App\Support\RoleHierarchy;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class TdsGrantReviewReport extends Command
{
    protected $signature = 'authz:tds-grant-review {--json}';

    protected $description = 'Report roles that received TDS/Form 16 access from the legacy payslip gate migration.';

    private const MIGRATED = [
        'ui.admin.tds.view',
        'ui.admin.form16.view',
        'payroll.form16.read',
    ];

    private const SOURCE = 'payroll.payslip.read';

    public function handle(): int
    {
        $ids = DB::table('permissions')->whereIn('code', array_merge(self::MIGRATED, [self::SOURCE]))
            ->pluck('id', 'code');

        if (! isset($ids[self::SOURCE])) {
            $this->error('payroll.payslip.read not found. Run migrations and seeders first.');

            return self::FAILURE;
        }

        $rows = [];

        foreach (DB::table('roles')->get() as $role) {
            if (RoleHierarchy::classOf(new \App\Models\Role((array) $role)) === RoleHierarchy::INTERNAL_SUPER_ADMIN) {
                continue;
            }

            $hasSource = DB::table('role_permissions')
                ->where('role_id', $role->id)
                ->where('permission_id', $ids[self::SOURCE])
                ->where('effect', 'ALLOW')
                ->exists();

            $held = [];
            foreach (self::MIGRATED as $code) {
                if (! isset($ids[$code])) {
                    continue;
                }
                if (DB::table('role_permissions')->where('role_id', $role->id)
                    ->where('permission_id', $ids[$code])->where('effect', 'ALLOW')->exists()) {
                    $held[] = $code;
                }
            }

            if ($held === [] && ! $hasSource) {
                continue;
            }

            $userCount = DB::table('authorization_role_assignments')->where('role_id', $role->id)->count();

            $rows[] = [
                'role_id' => $role->id,
                'role_name' => $role->name,
                'role_code' => $role->code,
                'users' => $userCount,
                'had_payslip_read' => $hasSource ? 'yes' : 'no',
                'tds_view' => in_array('ui.admin.tds.view', $held, true) ? 'yes' : 'no',
                'form16_view' => in_array('ui.admin.form16.view', $held, true) ? 'yes' : 'no',
                'form16_read' => in_array('payroll.form16.read', $held, true) ? 'yes' : 'no',
                'provenance' => $held !== [] && $hasSource ? 'legacy_payslip_gate' : 'direct',
                'review_status' => 'pending',
                'recommended_action' => $this->recommend($hasSource, $held, $userCount),
            ];
        }

        if ($this->option('json')) {
            $this->line(json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

            return self::SUCCESS;
        }

        if ($rows === []) {
            $this->info('No roles hold migrated TDS/Form 16 grants.');

            return self::SUCCESS;
        }

        $this->table(array_keys($rows[0]), $rows);
        $this->newLine();
        $this->warn('Business review required: payroll.payslip.read was never proof of TDS authority.');
        $this->line('Only the hidden Super Admin may action these decisions.');

        return self::SUCCESS;
    }

    private function recommend(bool $hasSource, array $held, int $userCount): string
    {
        if ($held === []) {
            return 'Remove both';
        }

        if (! $hasSource) {
            return 'Manual review required';
        }

        if ($userCount === 0) {
            return 'Remove both';
        }

        return 'Manual review required';
    }
}
