<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Authorization\AuthorizationEngine;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class AuditRoleMigration extends Command
{
    protected $signature = 'authz:audit-role-migration {--permissions=self.profile.read,self.payslip.read,ui.portals.employee,ui.portals.agent,hr.employee.read,payroll.payslip.read,recruitment.candidate.read,document.file.read,hr.appointment.read}';

    protected $description = 'Read-only. Groups active non-super-admin users by their legacy role signature and evaluates, through the canonical AuthorizationEngine (as enforced mode would), whether a representative user is ALLOWED each key permission. Surfaces every cohort that would be locked out before AUTHZ_MODE is flipped to enforced. Decision-log writes are rolled back.';

    public function handle(): int
    {
        $codes = array_values(array_filter(array_map('trim', explode(',', (string) $this->option('permissions')))));
        $engine = app(AuthorizationEngine::class);

        // Portal users only: exclude pre-hire records (appointment / pending /
        // trial) — they never log in (no emp_code, no sessions), so an enforced
        // denial for them is expected, not a legitimate lockout. NULL type is a
        // real employee and must be kept (SQL NOT IN drops NULLs, hence the OR).
        $users = User::where('is_deleted', 0)
            ->whereNotIn('role', [0])
            ->where(function ($q) {
                $q->whereNull('type')->orWhereNotIn('type', ['appointment', 'pending_employee', 'trial']);
            })
            ->with('roles:id,code,name')
            ->get();

        $groups = [];
        foreach ($users as $u) {
            $sig = $u->roles->pluck('code')->filter()->sort()->implode('+');
            $sig = $sig === '' ? '(no-canonical-role)' : $sig;
            if (! isset($groups[$sig])) {
                $groups[$sig] = ['count' => 0, 'sample' => $u, 'tier' => $u->role];
            }
            $groups[$sig]['count']++;
        }

        $this->info('effective mode: ' . config('authorization.enforcement.default_mode')
            . '  |  enforced prefixes: ' . implode(' ', config('authorization.enforcement.enforced_prefixes')));
        $this->newLine();

        $anyLockout = false;

        DB::beginTransaction();
        try {
            foreach ($groups as $sig => $g) {
                $denied = [];
                foreach ($codes as $c) {
                    if (! $engine->decide($g['sample'], $c)->allowed) {
                        $denied[] = $c;
                    }
                }

                $portalCode = 'ui.portals.' . ($this->portalFor((int) $g['tier']));
                $lockedOut = in_array('self.profile.read', $denied, true) || in_array($portalCode, $denied, true);
                if ($lockedOut) {
                    $anyLockout = true;
                }

                $this->line(sprintf(
                    '%s roles=[%s] users=%d tier=%d',
                    $lockedOut ? '<fg=red>LOCKED OUT</>' : '<fg=green>ok</>',
                    $sig,
                    $g['count'],
                    $g['tier']
                ));
                if ($denied) {
                    $this->line('    denied: ' . implode(', ', $denied));
                }
            }
        } finally {
            DB::rollBack();
        }

        $this->newLine();
        $this->line($anyLockout
            ? '<fg=red>At least one cohort would lose self-service/portal access. Fix canonical grants before enforcing.</>'
            : '<fg=green>No cohort loses self-service/portal access for the evaluated permissions.</>');

        return self::SUCCESS;
    }

    private function portalFor(int $tier): string
    {
        return match ($tier) {
            1, 2 => 'admin',
            4 => 'agent',
            default => 'employee',
        };
    }
}
