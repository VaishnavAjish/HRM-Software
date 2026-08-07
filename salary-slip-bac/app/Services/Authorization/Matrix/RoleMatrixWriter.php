<?php

namespace App\Services\Authorization\Matrix;

use App\Models\Role;
use App\Services\Authorization\SchemaSupport;
use App\Support\PermissionRegistry;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Applies Permission Matrix edits in one transaction.
 *
 * Only the cells the client sends are touched. The screen holds hundreds of
 * rows and posting the whole tree back would make one administrator's save
 * silently revert another's concurrent edit to a row they never looked at.
 */
class RoleMatrixWriter
{
    public function __construct(private readonly EffectiveStateResolver $resolver)
    {
    }

    /**
     * @param  list<array{permissionCode:string,state:string,conditions?:array}>  $changes
     * @return array{applied:int,projected:int,revoked:int,version:int}
     */
    public function apply(Role $role, array $changes, ?string $businessReason, ?int $expectedVersion, int $actorId): array
    {
        $unknown = array_values(array_filter(
            array_column($changes, 'permissionCode'),
            fn ($code) => ! PermissionRegistry::has($code) || PermissionRegistry::node($code)['permission'] === null
        ));

        if ($unknown !== []) {
            throw new RuntimeException('UNKNOWN_PERMISSION_CODES:' . implode(',', $unknown));
        }

        // CONDITIONAL with no conditions used to round-trip as ALLOW: writeCell
        // stored "[]" and currentState() read that back as a plain grant. The
        // administrator saw Conditional, saved, and reloaded to find Allow — a
        // silent widening of access. An unusable conditional is refused instead.
        $conditionless = array_values(array_filter(
            array_map(
                fn ($change) => $change['state'] === EffectiveStateResolver::CONDITIONAL
                    && ($change['conditions'] ?? []) === []
                        ? $change['permissionCode']
                        : null,
                $changes,
            ),
        ));

        if ($conditionless !== []) {
            throw new RuntimeException('CONDITION_REQUIRED:' . implode(',', $conditionless));
        }

        return DB::transaction(function () use ($role, $changes, $businessReason, $expectedVersion, $actorId) {
            $locked = DB::table('roles')->where('id', $role->id)->lockForUpdate()->first();

            if ($locked === null) {
                throw new RuntimeException('ROLE_NOT_FOUND');
            }

            $currentVersion = (int) ($locked->version ?? 1);

            if ($expectedVersion !== null && $expectedVersion !== $currentVersion) {
                throw new RuntimeException('VERSION_CONFLICT:' . $currentVersion);
            }

            $permissionIds = $this->resolvePermissionIds($changes);

            $applied = 0;

            foreach ($changes as $change) {
                $code = $change['permissionCode'];
                $state = $change['state'];
                $previous = $this->currentState($role->id, $permissionIds[$code]);

                if ($previous === $state) {
                    continue;
                }

                $this->writeCell($role->id, $permissionIds[$code], $state, $change['conditions'] ?? []);

                $this->audit($role, $actorId, $code, $previous, $state, $businessReason);

                $applied++;
            }

            $projection = $this->projectImpliedCodes($role, $changes, $actorId, $businessReason);

            $version = $currentVersion;

            if (SchemaSupport::hasColumn('roles', 'version')) {
                DB::table('roles')->where('id', $role->id)->update(['version' => $currentVersion + 1]);
                $version = $currentVersion + 1;
            }

            return [
                'applied' => $applied,
                'projected' => $projection['granted'],
                'revoked' => $projection['revoked'],
                'version' => $version,
            ];
        });
    }

    /**
     * Keep the business permission codes in step with the canonical edits.
     *
     * The middleware on every existing endpoint enforces business codes such as
     * `hr.employee.delete`, so a canonical grant that did not reach them would be
     * a screen that shows access it cannot deliver — and a canonical deny that did
     * not reach them would leave the API open behind a UI that claims it is shut.
     *
     * Only codes implied by the rows in this save are reconciled. A wider sweep
     * would strip business grants configured outside the matrix that the
     * administrator never touched.
     */
    private function projectImpliedCodes(Role $role, array $changes, int $actorId, ?string $businessReason): array
    {
        $touched = [];

        foreach ($changes as $change) {
            foreach (PermissionRegistry::impliedCodes($change['permissionCode']) as $code) {
                $touched[$code] = true;
            }
        }

        if ($touched === []) {
            return ['granted' => 0, 'revoked' => 0];
        }

        $allowedCanonical = $this->allowedCanonicalCodes($role);
        $required = [];

        foreach ($allowedCanonical as $canonical) {
            foreach (PermissionRegistry::impliedCodes($canonical) as $code) {
                $required[$code] = true;
            }
        }

        $ids = DB::table('permissions')->whereIn('code', array_keys($touched))->pluck('id', 'code');
        $existing = DB::table('role_permissions')
            ->where('role_id', $role->id)
            ->whereIn('permission_id', $ids->values())
            ->pluck('permission_id')
            ->flip();

        $granted = 0;
        $revoked = 0;

        foreach ($touched as $code => $_) {
            $permissionId = $ids[$code] ?? null;

            if ($permissionId === null) {
                continue;
            }

            $shouldHold = isset($required[$code]);
            $holds = $existing->has($permissionId);

            if ($shouldHold && ! $holds) {
                $this->writeCell($role->id, $permissionId, EffectiveStateResolver::ALLOW, []);
                $this->audit($role, $actorId, $code, EffectiveStateResolver::NOT_ASSIGNED, EffectiveStateResolver::ALLOW, $businessReason, 'PROJECTED');
                $granted++;
            }

            if (! $shouldHold && $holds) {
                $this->writeCell($role->id, $permissionId, EffectiveStateResolver::NOT_ASSIGNED, []);
                $this->audit($role, $actorId, $code, EffectiveStateResolver::ALLOW, EffectiveStateResolver::NOT_ASSIGNED, $businessReason, 'PROJECTED');
                $revoked++;
            }
        }

        return ['granted' => $granted, 'revoked' => $revoked];
    }

    /** Canonical codes whose effective result on this role is not DENY. */
    private function allowedCanonicalCodes(Role $role): array
    {
        $direct = [];

        $rows = DB::table('role_permissions as rp')
            ->join('permissions as p', 'p.id', '=', 'rp.permission_id')
            ->where('rp.role_id', $role->id)
            ->get(['p.code', 'rp.effect', 'rp.conditions']);

        foreach ($rows as $row) {
            $direct[(string) $row->code] = [
                'effect' => strtoupper($row->effect ?? 'ALLOW'),
                'conditions' => 0,
            ];
        }

        $states = $this->resolver->resolveAll($direct, []);

        return array_keys(array_filter(
            $states,
            fn ($state) => $state['effectiveResult'] !== EffectiveStateResolver::DENY
        ));
    }

    private function resolvePermissionIds(array $changes): array
    {
        $codes = array_values(array_unique(array_column($changes, 'permissionCode')));
        $ids = DB::table('permissions')->whereIn('code', $codes)->pluck('id', 'code')->all();

        $missing = array_values(array_diff($codes, array_keys($ids)));

        if ($missing !== []) {
            throw new RuntimeException('CATALOG_OUT_OF_SYNC:' . implode(',', $missing));
        }

        return $ids;
    }

    private function currentState(int $roleId, int $permissionId): string
    {
        $row = DB::table('role_permissions')
            ->where('role_id', $roleId)->where('permission_id', $permissionId)->first();

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

    private function writeCell(int $roleId, int $permissionId, string $state, array $conditions): void
    {
        if ($state === EffectiveStateResolver::NOT_ASSIGNED) {
            DB::table('role_permissions')
                ->where('role_id', $roleId)->where('permission_id', $permissionId)->delete();

            return;
        }

        $payload = ['role_id' => $roleId, 'permission_id' => $permissionId];

        if (SchemaSupport::hasColumn('role_permissions', 'effect')) {
            $payload['effect'] = $state === EffectiveStateResolver::DENY ? 'DENY' : 'ALLOW';
        }

        if (SchemaSupport::hasColumn('role_permissions', 'conditions')) {
            $payload['conditions'] = $state === EffectiveStateResolver::CONDITIONAL
                ? json_encode($conditions)
                : null;
        }

        $exists = DB::table('role_permissions')
            ->where('role_id', $roleId)->where('permission_id', $permissionId)->exists();

        $exists
            ? DB::table('role_permissions')
                ->where('role_id', $roleId)->where('permission_id', $permissionId)
                ->update(array_diff_key($payload, ['role_id' => 1, 'permission_id' => 1]))
            : DB::table('role_permissions')->insert($payload);
    }

    private function audit(
        Role $role,
        int $actorId,
        string $code,
        string $previous,
        string $next,
        ?string $businessReason,
        string $changeType = 'UPDATE',
    ): void {
        if (! SchemaSupport::hasTable('authorization_permission_audit_logs')) {
            return;
        }

        $node = PermissionRegistry::node($code);

        DB::table('authorization_permission_audit_logs')->insert([
            'event_id' => (string) Str::uuid(),
            'tenant_id' => auth('api')->user()?->company_code ?: null,
            'actor_id' => $actorId,
            'subject_type' => 'MATRIX_CELL',
            'subject_id' => (string) $role->id,
            'subject_label' => $role->name,
            'change_type' => $changeType,
            'permission_code' => $code,
            'old_state' => $previous,
            'new_state' => $next,
            'new_values' => json_encode([
                'permissionCode' => $code,
                'label' => $node['label'] ?? $code,
                'sensitivity' => $node['sensitivity'] ?? null,
                'oldState' => $previous,
                'newState' => $next,
                'businessReason' => $businessReason,
            ]),
            'business_reason' => $businessReason,
            'request_id' => request()?->header('X-Request-Id'),
            'ip_address' => request()?->ip(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
