<?php

namespace App\Console\Commands;

use App\Models\Role;
use App\Services\Authorization\AuthorizationCache;
use App\Support\PermissionRegistry;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class NormalizeRoleAncestors extends Command
{
    protected $signature = 'authz:normalize-role-ancestors
        {--apply : Write the missing ancestor grants (default is a dry run)}
        {--role= : Limit to one role id or code}';

    protected $description = 'Grant the registry ancestors that existing role grants depend on. A role holding ui.portals.employee without ui.portals fails the engine\'s ancestor gate on every request, so the grant is dead. Additive and idempotent; explicit DENY ancestors are reported as conflicts and never overwritten. Dry-run by default.';

    public function handle(AuthorizationCache $cache): int
    {
        $apply = (bool) $this->option('apply');

        $roles = Role::query()
            ->where('is_active', true)
            ->where('code', '!=', 'super_administrator')
            ->when($this->option('role'), function ($q) {
                $target = $this->option('role');
                $q->where(is_numeric($target) ? 'id' : 'code', $target);
            })
            ->get();

        $permissionIds = DB::table('permissions')->pluck('id', 'code');
        $totalGrants = 0;
        $conflicts = [];

        foreach ($roles as $role) {
            $rows = DB::table('role_permissions as rp')
                ->join('permissions as p', 'p.id', '=', 'rp.permission_id')
                ->where('rp.role_id', $role->id)
                ->get(['p.code', 'rp.effect']);

            $held = [];
            foreach ($rows as $row) {
                $held[(string) $row->code] = strtoupper($row->effect ?? 'ALLOW');
            }

            $missing = [];

            foreach ($held as $code => $effect) {
                if ($effect === 'DENY' || ! PermissionRegistry::has($code)) {
                    continue;
                }

                foreach (PermissionRegistry::requiredCodesFor($code) as $ancestor) {
                    if ($ancestor === $code || isset($held[$ancestor]) || isset($missing[$ancestor])) {
                        if (($held[$ancestor] ?? null) === 'DENY') {
                            $conflicts[] = $role->code . ': ' . $code . ' requires ' . $ancestor . ' (explicit DENY)';
                        }

                        continue;
                    }

                    if ((PermissionRegistry::node($ancestor)['permission'] ?? null) === null) {
                        continue;
                    }

                    if (! isset($permissionIds[$ancestor])) {
                        $conflicts[] = $role->code . ': ancestor ' . $ancestor . ' missing from permission catalog';

                        continue;
                    }

                    $missing[$ancestor] = true;
                }
            }

            if ($missing === []) {
                continue;
            }

            $codes = array_keys($missing);
            $this->line(sprintf(
                'role "%s" (id=%d) %s: %s',
                $role->code,
                $role->id,
                $apply ? 'granting ancestors' : 'would grant ancestors',
                implode(', ', $codes)
            ));
            $totalGrants += count($codes);

            if ($apply) {
                DB::transaction(function () use ($role, $codes, $permissionIds) {
                    foreach ($codes as $code) {
                        DB::table('role_permissions')->updateOrInsert(
                            ['role_id' => $role->id, 'permission_id' => $permissionIds[$code]],
                            ['effect' => 'ALLOW', 'conditions' => null]
                        );

                        if (DB::getSchemaBuilder()->hasTable('authorization_permission_audit_logs')) {
                            DB::table('authorization_permission_audit_logs')->insert([
                                'event_id' => (string) Str::uuid(),
                                'tenant_id' => $role->tenant_id,
                                'actor_id' => null,
                                'subject_type' => 'MATRIX_CELL',
                                'subject_id' => (string) $role->id,
                                'subject_label' => $role->name,
                                'change_type' => 'ANCESTOR',
                                'permission_code' => $code,
                                'old_state' => 'NOT_ASSIGNED',
                                'new_state' => 'ALLOW',
                                'new_values' => json_encode([
                                    'permissionCode' => $code,
                                    'source' => 'authz:normalize-role-ancestors',
                                ]),
                                'business_reason' => 'Ancestor repair: dependent grants were ineffective without this node.',
                                'request_id' => null,
                                'ip_address' => null,
                                'created_at' => now(),
                                'updated_at' => now(),
                            ]);
                        }
                    }
                });
            }
        }

        foreach (array_unique($conflicts) as $conflict) {
            $this->warn('CONFLICT (not touched): ' . $conflict);
        }

        $this->info(($apply ? 'APPLIED ' : 'DRY RUN — would apply ') . $totalGrants . ' ancestor grant(s) across ' . $roles->count() . ' role(s).');

        if ($apply && $totalGrants > 0) {
            $cache->invalidate(null);
            $this->info('Authorization cache invalidated.');
        } elseif (! $apply && $totalGrants > 0) {
            $this->warn('Re-run with --apply to write these grants.');
        }

        return self::SUCCESS;
    }
}
