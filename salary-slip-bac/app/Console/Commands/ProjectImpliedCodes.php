<?php

namespace App\Console\Commands;

use App\Models\Role;
use App\Services\Authorization\AuthorizationCache;
use App\Support\PermissionRegistry;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ProjectImpliedCodes extends Command
{
    protected $signature = 'authz:project-implied-codes
        {--apply : Write the missing implied grants (default is a dry run)}
        {--role= : Limit to one role id or code}';

    protected $description = 'Grant the business codes implied by each role\'s canonical ui.* grants that are missing from the role. Strictly additive: it never revokes, so business grants configured outside the matrix are untouched. Use after a registry node gains a new implied code, so existing roles pick it up without re-saving their matrix. Dry-run by default.';

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

        $permissionIds = DB::table('permissions')->where('is_active', true)->pluck('id', 'code');
        $totalGrants = 0;
        $missingFromCatalog = [];

        foreach ($roles as $role) {
            $rows = DB::table('role_permissions as rp')
                ->join('permissions as p', 'p.id', '=', 'rp.permission_id')
                ->where('rp.role_id', $role->id)
                ->get(['p.code', 'rp.effect']);

            $held = [];
            foreach ($rows as $row) {
                $held[(string) $row->code] = strtoupper($row->effect ?? 'ALLOW');
            }

            $required = [];
            foreach ($held as $code => $effect) {
                if ($effect !== 'ALLOW' || ! PermissionRegistry::has($code)) {
                    continue;
                }
                foreach (PermissionRegistry::impliedCodes($code) as $implied) {
                    $required[$implied] = $code;
                }
            }

            $missing = [];
            foreach ($required as $implied => $source) {
                if (isset($held[$implied])) {
                    continue;
                }
                if (! isset($permissionIds[$implied])) {
                    $missingFromCatalog[] = $implied;

                    continue;
                }
                $missing[$implied] = $source;
            }

            if ($missing === []) {
                continue;
            }

            foreach ($missing as $implied => $source) {
                $this->line(sprintf(
                    'role "%s" (id=%d) %s %s (implied by %s)',
                    $role->code,
                    $role->id,
                    $apply ? 'granting' : 'would grant',
                    $implied,
                    $source
                ));
            }
            $totalGrants += count($missing);

            if ($apply) {
                DB::transaction(function () use ($role, $missing, $permissionIds) {
                    foreach (array_keys($missing) as $implied) {
                        DB::table('role_permissions')->updateOrInsert(
                            ['role_id' => $role->id, 'permission_id' => $permissionIds[$implied]],
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
                                'change_type' => 'PROJECTED',
                                'permission_code' => $implied,
                                'old_state' => 'NOT_ASSIGNED',
                                'new_state' => 'ALLOW',
                                'new_values' => json_encode([
                                    'permissionCode' => $implied,
                                    'source' => 'authz:project-implied-codes',
                                ]),
                                'business_reason' => 'Registry implication reconciliation.',
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

        foreach (array_unique($missingFromCatalog) as $code) {
            $this->warn('implied code missing from permission catalog (run authz:sync-catalog): ' . $code);
        }

        $this->info(($apply ? 'APPLIED ' : 'DRY RUN — would apply ') . $totalGrants . ' implied grant(s) across ' . $roles->count() . ' role(s).');

        if ($apply && $totalGrants > 0) {
            $cache->invalidate(null);
            $this->info('Authorization cache invalidated.');
        } elseif (! $apply && $totalGrants > 0) {
            $this->warn('Re-run with --apply to write these grants.');
        }

        return self::SUCCESS;
    }
}
