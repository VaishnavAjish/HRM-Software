<?php

namespace App\Console\Commands;

use App\Models\Role;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\Matrix\EffectiveStateResolver;
use App\Services\Authorization\SchemaSupport;
use App\Support\PermissionRegistry;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RepairCustomBusinessShells extends Command
{
    protected $signature = 'authz:repair-custom-business-shells {--apply} {--role=}';

    protected $description = 'Repair existing custom BUSINESS roles that are missing the management-shell container permissions (ui.portals, ui.portals.business), so their users can enter the admin shell. Additive, idempotent, dry-run by default. Grants only the two shell containers — never self-service, pages, actions, or access-control. Roles with an explicit DENY on a shell permission are reported as conflicts and left untouched.';

    private const SHELL = ['ui.portals', 'ui.portals.business'];

    public function __construct(private readonly AuthorizationCache $cache)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $roleFilter = $this->option('role');

        $shellPermissions = DB::table('permissions')
            ->whereIn('code', self::SHELL)
            ->get()
            ->keyBy('code');

        $missingFromCatalog = array_diff(self::SHELL, $shellPermissions->keys()->all());
        if ($missingFromCatalog) {
            $this->error('Shell permissions missing from the catalog: ' . implode(', ', $missingFromCatalog));

            return self::FAILURE;
        }

        $query = Role::query()
            ->where('type', 'Custom')
            ->where('is_active', true);

        if (SchemaSupport::hasColumn('roles', 'role_type')) {
            $query->whereRaw('UPPER(role_type) = ?', ['BUSINESS']);
        }
        if (SchemaSupport::hasColumn('roles', 'is_system')) {
            $query->where(function ($q) {
                $q->where('is_system', false)->orWhereNull('is_system');
            });
        }
        if ($roleFilter !== null && $roleFilter !== '') {
            $query->where(function ($q) use ($roleFilter) {
                $q->where('code', $roleFilter);
                if (is_numeric($roleFilter)) {
                    $q->orWhere('id', (int) $roleFilter);
                }
            });
        }

        $roles = $query->get();

        $scanned = 0;
        $compliant = 0;
        $repairable = 0;
        $repaired = 0;
        $conflicts = 0;
        $grants = 0;
        $affectedUsers = [];
        $invalidateTenants = [];

        foreach ($roles as $role) {
            $scanned++;

            $missing = [];
            $hasDeny = false;
            foreach (self::SHELL as $code) {
                $state = $this->currentState((int) $role->id, (int) $shellPermissions[$code]->id);
                if ($state === EffectiveStateResolver::DENY) {
                    $hasDeny = true;
                } elseif ($state === EffectiveStateResolver::NOT_ASSIGNED) {
                    $missing[] = $code;
                }
            }

            if ($hasDeny) {
                $conflicts++;
                $this->line(sprintf('  CONFLICT role "%s" (id=%d): explicit DENY on a shell permission — skipped', $role->code, $role->id));

                continue;
            }

            if ($missing === []) {
                $compliant++;

                continue;
            }

            $repairable++;
            $grants += count($missing);
            foreach ($this->usersOf((int) $role->id) as $userId) {
                $affectedUsers[$userId] = true;
            }

            $this->line(sprintf('  role "%s" (id=%d) %s: %s',
                $role->code, $role->id, $apply ? 'granting' : 'would grant', implode(', ', $missing)));

            if ($apply) {
                DB::transaction(function () use ($role, $missing, $shellPermissions) {
                    foreach ($missing as $code) {
                        $permission = $shellPermissions[$code];
                        $this->grantCell((int) $role->id, (int) $permission->id, (bool) $permission->is_sensitive);
                        $this->audit($role, $code);
                    }
                });
                $repaired++;
                $invalidateTenants[(string) ($role->tenant_id ?? '')] = $role->tenant_id ?? null;
            }
        }

        if ($apply && $repaired > 0) {
            foreach ($invalidateTenants as $tenant) {
                $this->cache->invalidate($tenant);
            }
        }

        $this->newLine();
        $this->info(($apply ? 'APPLIED' : 'DRY RUN') . ' — custom BUSINESS shell repair');
        $this->table(['metric', 'count'], [
            ['roles scanned', $scanned],
            ['compliant', $compliant],
            [$apply ? 'repaired' : 'repairable', $apply ? $repaired : $repairable],
            ['conflicts (explicit DENY, skipped)', $conflicts],
            ['permission grants ' . ($apply ? 'written' : 'to write'), $grants],
            ['affected users', count($affectedUsers)],
        ]);

        if (! $apply && $repairable > 0) {
            $this->warn('Dry run only. Re-run with --apply to grant the missing shell permissions.');
        }

        return self::SUCCESS;
    }

    private function currentState(int $roleId, int $permissionId): string
    {
        $row = DB::table('role_permissions')
            ->where('role_id', $roleId)
            ->where('permission_id', $permissionId)
            ->first();

        if ($row === null) {
            return EffectiveStateResolver::NOT_ASSIGNED;
        }

        if (strtoupper($row->effect ?? 'ALLOW') === 'DENY') {
            return EffectiveStateResolver::DENY;
        }

        $conditions = $row->conditions ?? null;
        if (is_string($conditions)) {
            $conditions = json_decode($conditions, true);
        }

        return is_array($conditions) && $conditions !== []
            ? EffectiveStateResolver::CONDITIONAL
            : EffectiveStateResolver::ALLOW;
    }

    private function grantCell(int $roleId, int $permissionId, bool $isSensitive): void
    {
        $values = ['effect' => 'ALLOW'];
        if (SchemaSupport::hasColumn('role_permissions', 'conditions')) {
            $values['conditions'] = null;
        }
        if (SchemaSupport::hasColumn('role_permissions', 'obligations')) {
            $values['obligations'] = null;
        }
        if (SchemaSupport::hasColumn('role_permissions', 'inherit_to_children')) {
            $values['inherit_to_children'] = ! $isSensitive;
        }

        DB::table('role_permissions')->updateOrInsert(
            ['role_id' => $roleId, 'permission_id' => $permissionId],
            $values
        );
    }

    private function audit(Role $role, string $code): void
    {
        if (! SchemaSupport::hasTable('authorization_permission_audit_logs')) {
            return;
        }

        $node = PermissionRegistry::node($code);
        $reason = 'Custom BUSINESS role missing management-shell container; granted by authz:repair-custom-business-shells.';

        DB::table('authorization_permission_audit_logs')->insert([
            'event_id' => (string) Str::uuid(),
            'tenant_id' => $role->tenant_id ?? null,
            'actor_id' => auth('api')->id(),
            'subject_type' => 'MATRIX_CELL',
            'subject_id' => (string) $role->id,
            'subject_label' => $role->name,
            'change_type' => 'BUSINESS_SHELL_REPAIR',
            'permission_code' => $code,
            'old_state' => EffectiveStateResolver::NOT_ASSIGNED,
            'new_state' => EffectiveStateResolver::ALLOW,
            'new_values' => json_encode([
                'permissionCode' => $code,
                'label' => $node['label'] ?? $code,
                'sensitivity' => $node['sensitivity'] ?? null,
                'oldState' => EffectiveStateResolver::NOT_ASSIGNED,
                'newState' => EffectiveStateResolver::ALLOW,
                'businessReason' => $reason,
            ]),
            'business_reason' => $reason,
            'request_id' => request()?->header('X-Request-Id'),
            'ip_address' => request()?->ip(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function usersOf(int $roleId): array
    {
        return DB::table('user_roles')
            ->join('users', 'users.id', '=', 'user_roles.user_id')
            ->where('user_roles.role_id', $roleId)
            ->where('users.is_deleted', 0)
            ->pluck('users.id')
            ->all();
    }
}
