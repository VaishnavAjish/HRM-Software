<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Authorization\AuthorizationEngine;
use App\Services\Authorization\PermissionEnforcementPolicy;
use App\Support\PermissionRegistry;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class AuthzTraceUser extends Command
{
    protected $signature = 'authz:trace-user {user : User id or emp_code} {permission : Permission code}';

    protected $description = 'Read-only trace of one user + one permission through the canonical authorization chain: roles, canonical assignments, role grants, user overrides, ancestor gate, engine decision and enforcement mode. Writes nothing (engine runs with audit=false) and prints no PII or secrets.';

    public function handle(AuthorizationEngine $engine, PermissionEnforcementPolicy $policy): int
    {
        $target = (string) $this->argument('user');
        $code = (string) $this->argument('permission');

        $user = is_numeric($target)
            ? User::find((int) $target)
            : User::where('emp_code', $target)->first();

        if (! $user) {
            $this->error('User not found.');

            return self::FAILURE;
        }

        $this->line('user id:        ' . $user->id);
        $this->line('tier (users.role): ' . $user->role . ($user->type ? ' / type=' . $user->type : ''));
        $this->line('company:        ' . ($user->company_code ?: '-'));
        $this->line('active:         ' . (((string) $user->is_deleted === '0' || ! $user->is_deleted) ? 'yes' : 'NO (deleted)'));
        $this->line('super admin:    ' . ($user->isSuperAdmin() ? 'YES (bypasses everything)' : 'no'));
        $this->newLine();

        $legacyRoles = DB::table('user_roles')
            ->join('roles', 'roles.id', '=', 'user_roles.role_id')
            ->where('user_roles.user_id', $user->id)
            ->get(['roles.id', 'roles.code', 'roles.is_active', 'roles.status']);

        $this->line('user_roles pivot:');
        if ($legacyRoles->isEmpty()) {
            $this->warn('  NONE — user is role-less; only direct user_permissions or policies can grant anything.');
        }
        foreach ($legacyRoles as $role) {
            $this->line(sprintf('  role %d (%s) active=%s status=%s', $role->id, $role->code, $role->is_active ? '1' : '0', $role->status));
        }

        if (DB::getSchemaBuilder()->hasTable('authorization_role_assignments')) {
            $assignments = DB::table('authorization_role_assignments as a')
                ->join('roles', 'roles.id', '=', 'a.role_id')
                ->where('a.user_id', $user->id)
                ->get(['roles.code', 'a.status', 'a.scope_type', 'a.scope_id', 'a.valid_until']);

            $this->line('authorization_role_assignments:');
            if ($assignments->isEmpty()) {
                $this->line('  none (engine falls back to the user_roles pivot with TENANT scope)');
            }
            foreach ($assignments as $assignment) {
                $this->line(sprintf('  %s status=%s scope=%s/%s valid_until=%s',
                    $assignment->code, $assignment->status, $assignment->scope_type,
                    $assignment->scope_id ?? '-', $assignment->valid_until ?? '-'));
            }
        }
        $this->newLine();

        $roleIds = $legacyRoles->pluck('id')->all();
        $grants = DB::table('role_permissions as rp')
            ->join('permissions as p', 'p.id', '=', 'rp.permission_id')
            ->join('roles as r', 'r.id', '=', 'rp.role_id')
            ->whereIn('rp.role_id', $roleIds ?: [-1])
            ->where('p.code', $code)
            ->get(['r.code as role_code', 'rp.effect', 'p.is_active']);

        $this->line('role grants for ' . $code . ':');
        if ($grants->isEmpty()) {
            $this->line('  none');
        }
        foreach ($grants as $grant) {
            $this->line(sprintf('  via %s: effect=%s perm_active=%s', $grant->role_code, strtoupper($grant->effect ?? 'ALLOW'), $grant->is_active ? '1' : '0'));
        }

        $override = DB::table('user_permissions as up')
            ->join('permissions as p', 'p.id', '=', 'up.permission_id')
            ->where('up.user_id', $user->id)
            ->where('p.code', $code)
            ->first(['up.is_denied', 'up.valid_until']);

        $this->line('user override:  ' . ($override
            ? (($override->is_denied ? 'DENY' : 'ALLOW') . ' valid_until=' . ($override->valid_until ?? '-'))
            : 'none'));
        $this->newLine();

        if (PermissionRegistry::has($code)) {
            $this->line('registry ancestor chain (all must be held):');
            foreach (PermissionRegistry::requiredCodesFor($code) as $ancestor) {
                if ($ancestor === $code) {
                    continue;
                }
                $held = $engine->decide($user, $ancestor, [], ['audit' => false])->allowed;
                $this->line('  ' . $ancestor . ' => ' . ($held ? 'HELD' : 'MISSING'));
            }
        } else {
            $this->line('not a registry code — no ancestor gate; enforced directly by route middleware.');
        }
        $this->newLine();

        $decision = $engine->decide($user, $code, [], ['audit' => false]);
        $mode = $policy->modeFor($code, null, $user->company_code);

        $this->line('engine decision:   ' . ($decision->allowed ? 'ALLOW' : 'DENY'));
        $this->line('reason:            ' . $decision->reasonCode);
        $this->line('effective state:   ' . $decision->effectiveState);
        $this->line('legacy would say:  ' . (($decision->legacyDecision['allowed'] ?? false) ? 'ALLOW' : 'DENY'));
        $this->line('enforcement mode:  ' . $mode);
        $this->line('request outcome:   ' . ($decision->allowed
            ? 'allowed'
            : ($mode === PermissionEnforcementPolicy::ENFORCED
                ? '403 (enforced deny)'
                : ((($decision->legacyDecision['allowed'] ?? false)) ? 'allowed via shadow legacy rescue' : '403 (legacy also denies)'))));

        return self::SUCCESS;
    }
}
