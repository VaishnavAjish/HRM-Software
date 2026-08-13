<?php

namespace App\Console\Commands;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SyncLegacyRoles extends Command
{
    protected $signature = 'authz:sync-legacy-roles {--apply : Write the baseline grants (default is a dry run)}';

    protected $description = 'Ensure every active role held by a real user has the self-service baseline (self.*) permissions, so enforced mode cannot lock a user out of their own portal. Additive and idempotent: never removes grants, never assigns roles to users, never touches super admin. Role-less users are reported, never auto-assigned. Dry-run by default.';

    private const BASELINE = [
        'self.profile.read',
        'self.profile.update',
        'self.payslip.read',
        'self.ticket.read',
        'self.ticket.create',
    ];

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');

        $baseline = Permission::whereIn('code', self::BASELINE)->where('is_active', true)->get()->keyBy('code');
        $missingFromRegistry = array_diff(self::BASELINE, $baseline->keys()->all());
        if ($missingFromRegistry) {
            $this->warn('Baseline permissions absent from the registry (skipped): ' . implode(', ', $missingFromRegistry));
        }
        $baselineCodes = $baseline->keys()->all();

        $heldRoleIds = DB::table('user_roles')
            ->join('users', 'users.id', '=', 'user_roles.user_id')
            ->where('users.is_deleted', 0)
            ->where(function ($q) {
                $q->whereNull('users.type')->orWhereNotIn('users.type', ['appointment', 'pending_employee', 'trial']);
            })
            ->distinct()
            ->pluck('user_roles.role_id');

        $roles = Role::whereIn('id', $heldRoleIds)
            ->where('is_active', true)
            ->where('code', '!=', 'super_administrator')
            ->get();

        $plans = [];
        foreach ($roles as $role) {
            $has = DB::table('role_permissions')
                ->join('permissions', 'permissions.id', '=', 'role_permissions.permission_id')
                ->where('role_permissions.role_id', $role->id)
                ->whereIn('permissions.code', $baselineCodes)
                ->pluck('permissions.code')
                ->all();
            $missing = array_values(array_diff($baselineCodes, $has));
            if ($missing) {
                $plans[] = ['role' => $role, 'codes' => $missing];
            }
        }

        $roleLess = DB::table('users')
            ->where('is_deleted', 0)
            ->whereNotIn('role', [0])
            ->where(function ($q) {
                $q->whereNull('type')->orWhereNotIn('type', ['appointment', 'pending_employee', 'trial']);
            })
            ->whereNotExists(function ($q) {
                $q->select(DB::raw(1))->from('user_roles')->whereColumn('user_roles.user_id', 'users.id');
            })
            ->pluck('id');

        $grantCount = array_sum(array_map(fn ($p) => count($p['codes']), $plans));

        $this->info(($apply ? 'APPLY' : 'DRY RUN') . ' — self-service baseline reconciliation');
        $this->line('roles held by active users (excl. super admin): ' . $roles->count());
        $this->line('roles already complete: ' . ($roles->count() - count($plans)));
        foreach ($plans as $p) {
            $this->line(sprintf('  role "%s" (id=%d) %s: %s',
                $p['role']->code, $p['role']->id, $apply ? 'granting' : 'would grant', implode(', ', $p['codes'])));
        }
        $this->line('permission grants to add: ' . $grantCount);
        $this->line('role-less active users (UNRESOLVED — not touched): ' . $roleLess->count()
            . ($roleLess->count() ? ' [ids: ' . $roleLess->implode(', ') . ']' : ''));

        if ($apply && $plans) {
            DB::transaction(function () use ($plans, $baseline) {
                foreach ($plans as $p) {
                    foreach ($p['codes'] as $code) {
                        $perm = $baseline[$code];
                        DB::table('role_permissions')->updateOrInsert(
                            ['role_id' => $p['role']->id, 'permission_id' => $perm->id],
                            ['effect' => 'ALLOW', 'obligations' => null, 'inherit_to_children' => ! $perm->is_sensitive]
                        );
                    }
                }
            });
            $this->info('Applied. Re-run authz:audit-role-migration to confirm no LOCKED OUT cohort remains.');
        } elseif (! $apply) {
            $this->warn('Dry run only. Re-run with --apply to write these grants.');
        }

        return self::SUCCESS;
    }
}
