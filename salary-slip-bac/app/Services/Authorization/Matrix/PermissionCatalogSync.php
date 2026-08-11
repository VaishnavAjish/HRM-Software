<?php

namespace App\Services\Authorization\Matrix;

use App\Support\PermissionOwnership;
use App\Support\PermissionRegistry;
use Illuminate\Support\Facades\DB;

/**
 * Projects the canonical registry into the `permissions` catalogue.
 *
 * The registry lives in code so it is reviewable and cannot drift per
 * environment; the catalogue exists because role_permissions references
 * permissions by id. This class keeps the second in step with the first.
 *
 * It is additive by design: rows are inserted or updated, never deleted. A code
 * that disappears from the registry is marked inactive instead, because deleting
 * it would cascade away the role_permissions rows that record who was granted it
 * and destroy the audit trail along with them.
 */
class PermissionCatalogSync
{
    public function __construct(private readonly EffectiveStateResolver $resolver)
    {
    }

    /**
     * @return array{created:int,updated:int,deactivated:int,codes:list<string>}
     */
    public function sync(bool $dryRun = false): array
    {
        $registry = PermissionRegistry::all();
        $existingByCode = DB::table('permissions')->pluck('id', 'code')->all();
        $existingByName = DB::table('permissions')->pluck('id', 'name')->all();

        $created = [];
        $updated = [];
        $now = now();

        $refused = [];

        foreach ($registry as $key => $node) {
            if ($node['permission'] === null) {
                continue;
            }

            // The write boundary. A registry code is normally HRMS_CORE by
            // definition, so this can only trip if a canonical code collides with
            // a namespace another surface owns — in which case the safe outcome
            // is to refuse and report, not to overwrite someone else's permission.
            if (! PermissionOwnership::canCoreSync($key)) {
                $refused[] = $key;

                continue;
            }

            $payload = [
                'name' => $key,
                'code' => $key,
                'description' => $node['description'] ?? $node['label'],
                'resource' => $node['parent'] ?? $key,
                'action' => $this->actionSegment($key),
                'level' => strtoupper($node['type']),
                'is_sensitive' => $node['sensitivity'] !== PermissionRegistry::SENSITIVITY_NORMAL,
                'is_active' => ! $node['deprecated'],
                'updated_at' => $now,
            ];

            $targetId = $existingByCode[$key] ?? $existingByName[$key] ?? null;

            if ($targetId !== null) {
                $updated[] = $key;

                if (! $dryRun) {
                    DB::table('permissions')->where('id', $targetId)->update($payload);
                }

                continue;
            }

            $created[] = $key;

            if (! $dryRun) {
                DB::table('permissions')->insert($payload + ['created_at' => $now]);
            }
        }

        return [
            'created' => count($created),
            'updated' => count($updated),
            'refused' => $refused,
            'preserved' => $this->preservedByOwner(),
            'codes' => $created,
        ];
    }

    /**
     * Carry existing role grants onto the canonical codes.
     *
     * A role that already holds `hr.employee.delete` keeps working through the
     * business code, but the matrix edits canonical codes — so without this the
     * new screen would open showing every role as having nothing configured, and
     * an administrator saving that view would strip access the role really has.
     *
     * A canonical node is granted when the role holds every business code the
     * node implies. Partial holdings are reported rather than guessed at.
     *
     * @return array{granted:int,skipped:int,partial:list<array{role:string,code:string,missing:list<string>}>}
     */
    public function backfillFromBusinessCodes(bool $dryRun = false): array
    {
        $permissionIds = DB::table('permissions')->pluck('id', 'code')->all();

        // The protected identity is excluded on purpose. Its access is a system
        // rule, not thousands of ALLOW rows, and materialising them here would
        // turn the bypass into ordinary data that an ordinary API could edit.
        $roles = \App\Support\SystemRoles::exclude(DB::table('roles'))->pluck('name', 'id')->all();

        $held = [];

        $rows = DB::table('role_permissions as rp')
            ->join('permissions as p', 'p.id', '=', 'rp.permission_id')
            ->whereIn('rp.role_id', array_keys($roles))
            ->where(function ($query) {
                $query->where('rp.effect', 'ALLOW')->orWhereNull('rp.effect');
            })
            ->get(['rp.role_id', 'p.code']);

        foreach ($rows as $row) {
            $held[(int) $row->role_id][(string) $row->code] = true;
        }

        $granted = 0;
        $skipped = 0;
        $partial = [];
        $now = now();

        foreach ($held as $roleId => $codes) {
            foreach (PermissionRegistry::all() as $key => $node) {
                if ($node['permission'] === null || $node['implies'] === []) {
                    continue;
                }

                // Grants are only ever derived onto codes core owns.
                if (! PermissionOwnership::canCoreSync($key)) {
                    continue;
                }

                if (isset($codes[$key])) {
                    $skipped++;
                    continue;
                }

                $missing = array_values(array_filter(
                    $node['implies'],
                    fn ($code) => ! isset($codes[$code])
                ));

                if (count($missing) === count($node['implies'])) {
                    continue;
                }

                if ($missing !== []) {
                    $partial[] = [
                        'role' => $roles[$roleId] ?? (string) $roleId,
                        'code' => $key,
                        'missing' => $missing,
                    ];

                    continue;
                }

                $granted++;

                if (! $dryRun && isset($permissionIds[$key])) {
                    DB::table('role_permissions')->insert([
                        'role_id' => $roleId,
                        'permission_id' => $permissionIds[$key],
                        'effect' => 'ALLOW',
                        'inherit_to_children' => true,
                        'valid_from' => $now,
                    ]);
                }
            }
        }

        return ['granted' => $granted, 'skipped' => $skipped, 'partial' => $partial];
    }

    /**
     * `ui.` codes in the catalogue that this registry does not own.
     *
     * Reported, never written. Deactivating a permission silently denies whoever
     * held it, and a `ui.` code outside the admin registry may still belong to
     * another portal — the agent and employee dashboards each own one. Retiring a
     * code is therefore a deliberate act, not a side effect of a sync.
     *
     * @return list<string>
     */
    /**
     * Catalogue codes core does not own, grouped by who does.
     *
     * Reported, never written. "Missing from the current core registry" does not
     * mean "safe to remove" — that inference is what deactivated the portal
     * dashboards — so these counts exist to be read, not acted on.
     *
     * @return array<string,int>
     */
    private function preservedByOwner(): array
    {
        $codes = DB::table('permissions')
            ->pluck('code')
            ->reject(fn ($code) => PermissionOwnership::isCoreOwned((string) $code));

        $counts = PermissionOwnership::counts($codes);

        unset($counts[PermissionOwnership::HRMS_CORE]);

        return array_filter($counts);
    }

    private function unmanagedCanonicalCodes(array $registry): array
    {
        return DB::table('permissions')
            ->where('code', 'like', 'ui.%')
            ->where('is_active', true)
            ->pluck('code')
            ->reject(fn ($code) => isset($registry[$code]))
            ->reject(fn ($code) => in_array($code, PermissionRegistry::impliedPermissionCodes(), true))
            ->values()
            ->all();
    }

    private function actionSegment(string $code): string
    {
        $parts = explode('.', $code);

        return end($parts) ?: $code;
    }
}
