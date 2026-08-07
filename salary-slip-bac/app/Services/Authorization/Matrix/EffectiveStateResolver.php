<?php

namespace App\Services\Authorization\Matrix;

use App\Support\PermissionRegistry;

/**
 * Turns configured permission state into effective permission state for one role.
 *
 * Configured state is what an administrator set on this role. Effective result is
 * what access will actually happen. They differ whenever inheritance or the
 * module → page → action hierarchy overrides the local setting, and the matrix
 * shows both because an administrator who only sees one of them cannot tell a
 * working grant from a grant that is being suppressed by an ancestor.
 *
 * Precedence, highest first:
 *
 *   1. own DENY                    explicit deny on this role
 *   2. inherited DENY              deny from a parent role
 *   3. required ancestor not ALLOW hierarchy suppression
 *   4. own ALLOW / CONDITIONAL     explicit grant on this role
 *   5. inherited ALLOW             grant from a parent role
 *   6. default                     DENY
 *
 * Rule 3 is applied after the deny rules and before the allow rules, so a child
 * configured ALLOW under a denied parent reports EFFECTIVE DENY while keeping
 * its configured ALLOW — re-enabling the parent restores the child rather than
 * requiring every descendant to be reconfigured.
 */
class EffectiveStateResolver
{
    public const ALLOW = 'ALLOW';
    public const DENY = 'DENY';
    public const CONDITIONAL = 'CONDITIONAL';
    public const NOT_ASSIGNED = 'NOT_ASSIGNED';

    public const SOURCE_DIRECT = 'DIRECT';
    public const SOURCE_INHERITED = 'INHERITED';
    public const SOURCE_PARENT = 'PARENT';
    public const SOURCE_DEFAULT = 'DEFAULT';

    public const REASON_EXPLICIT_DENY = 'EXPLICIT_DENY';
    public const REASON_INHERITED_DENY = 'INHERITED_DENY';
    public const REASON_PARENT_DENIED = 'PARENT_DENIED';
    public const REASON_EXPLICIT_ALLOW = 'EXPLICIT_ALLOW';
    public const REASON_INHERITED_ALLOW = 'INHERITED_ALLOW';
    public const REASON_CONDITIONAL = 'CONDITIONAL_ALLOW';
    public const REASON_DEFAULT_DENY = 'DEFAULT_DENY';

    /** States an administrator may set. Inherited states are computed, never stored. */
    public const SETTABLE = [self::ALLOW, self::DENY, self::CONDITIONAL, self::NOT_ASSIGNED];

    /**
     * @param  array<string,array{effect:string,conditions:int}>  $direct
     * @param  array<string,array{effect:string,conditions:int,roleId:int}>  $inherited
     * @return array<string,array{
     *     configuredState:string, effectiveResult:string, source:string, reason:string,
     *     inheritedFromRoleId:?int, conditionCount:int, blockedBy:?string
     * }>
     */
    public function resolveAll(array $direct, array $inherited): array
    {
        $resolved = [];

        foreach (array_keys(PermissionRegistry::all()) as $key) {
            $this->resolve($key, $direct, $inherited, $resolved);
        }

        return $resolved;
    }

    /**
     * Resolve one node, memoizing into $resolved so an ancestor chain is walked
     * once per matrix build rather than once per descendant.
     */
    private function resolve(string $key, array $direct, array $inherited, array &$resolved): array
    {
        if (isset($resolved[$key])) {
            return $resolved[$key];
        }

        $node = PermissionRegistry::node($key);

        if ($node === null) {
            return $resolved[$key] = $this->cell(self::NOT_ASSIGNED, self::DENY, self::SOURCE_DEFAULT, self::REASON_DEFAULT_DENY);
        }

        // A grouping row carries no permission record. It is reported through its
        // descendants' aggregate rather than pretending to hold a state of its own,
        // but it still has to resolve so the parent chain below can walk past it.
        if ($node['permission'] === null) {
            $parent = $node['parent'];
            $parentCell = $parent === null ? null : $this->resolve($parent, $direct, $inherited, $resolved);

            return $resolved[$key] = $this->cell(
                self::NOT_ASSIGNED,
                $parentCell === null || $parentCell['effectiveResult'] !== self::DENY ? self::ALLOW : self::DENY,
                self::SOURCE_PARENT,
                self::REASON_PARENT_DENIED,
                blockedBy: $parentCell !== null && $parentCell['effectiveResult'] === self::DENY ? $parent : null,
            );
        }

        $own = $direct[$key] ?? null;
        $up = $inherited[$key] ?? null;

        $configured = match (true) {
            $own === null => self::NOT_ASSIGNED,
            strtoupper($own['effect']) === 'DENY' => self::DENY,
            ($own['conditions'] ?? 0) > 0 => self::CONDITIONAL,
            default => self::ALLOW,
        };

        if ($configured === self::DENY) {
            return $resolved[$key] = $this->cell(
                $configured, self::DENY, self::SOURCE_DIRECT, self::REASON_EXPLICIT_DENY,
                conditionCount: $own['conditions'] ?? 0,
            );
        }

        if ($up !== null && strtoupper($up['effect']) === 'DENY') {
            return $resolved[$key] = $this->cell(
                $configured, self::DENY, self::SOURCE_INHERITED, self::REASON_INHERITED_DENY,
                inheritedFromRoleId: $up['roleId'] ?? null,
            );
        }

        // Nothing grants this node, so the default-deny baseline settles it. Checked
        // before the hierarchy so an unassigned row under an unassigned parent reads
        // as "nobody granted it" rather than blaming an ancestor that is equally
        // unassigned — PARENT_DENIED is reserved for a grant actually being overridden.
        if ($configured === self::NOT_ASSIGNED && $up === null) {
            return $resolved[$key] = $this->cell(
                self::NOT_ASSIGNED, self::DENY, self::SOURCE_DEFAULT, self::REASON_DEFAULT_DENY,
            );
        }

        // Hierarchy suppression. Checked before the allow branches so a configured
        // ALLOW under a denied ancestor is reported as effectively denied while the
        // configuration itself is preserved.
        $blockedBy = $this->firstDeniedAncestor($key, $direct, $inherited, $resolved);

        if ($blockedBy !== null) {
            return $resolved[$key] = $this->cell(
                $configured, self::DENY, self::SOURCE_PARENT, self::REASON_PARENT_DENIED,
                inheritedFromRoleId: $up['roleId'] ?? null,
                conditionCount: $own['conditions'] ?? 0,
                blockedBy: $blockedBy,
            );
        }

        if ($configured === self::CONDITIONAL) {
            return $resolved[$key] = $this->cell(
                $configured, self::CONDITIONAL, self::SOURCE_DIRECT, self::REASON_CONDITIONAL,
                conditionCount: $own['conditions'] ?? 0,
            );
        }

        if ($configured === self::ALLOW) {
            return $resolved[$key] = $this->cell(
                $configured, self::ALLOW, self::SOURCE_DIRECT, self::REASON_EXPLICIT_ALLOW,
            );
        }

        if ($up !== null) {
            $conditions = $up['conditions'] ?? 0;

            return $resolved[$key] = $this->cell(
                $configured,
                $conditions > 0 ? self::CONDITIONAL : self::ALLOW,
                self::SOURCE_INHERITED,
                $conditions > 0 ? self::REASON_CONDITIONAL : self::REASON_INHERITED_ALLOW,
                inheritedFromRoleId: $up['roleId'] ?? null,
                conditionCount: $conditions,
            );
        }

        // Default deny. NOT_ASSIGNED never means unrestricted.
        return $resolved[$key] = $this->cell(
            self::NOT_ASSIGNED, self::DENY, self::SOURCE_DEFAULT, self::REASON_DEFAULT_DENY,
        );
    }

    /** Nearest ancestor whose effective result is DENY, or null when the chain is clear. */
    private function firstDeniedAncestor(string $key, array $direct, array $inherited, array &$resolved): ?string
    {
        foreach (PermissionRegistry::ancestorsOf($key) as $ancestor) {
            if (PermissionRegistry::node($ancestor)['permission'] === null) {
                continue;
            }

            if ($this->resolve($ancestor, $direct, $inherited, $resolved)['effectiveResult'] === self::DENY) {
                return $ancestor;
            }
        }

        return null;
    }

    private function cell(
        string $configured,
        string $effective,
        string $source,
        string $reason,
        ?int $inheritedFromRoleId = null,
        int $conditionCount = 0,
        ?string $blockedBy = null,
    ): array {
        return [
            'configuredState' => $configured,
            'effectiveResult' => $effective,
            'source' => $source,
            'reason' => $reason,
            'inheritedFromRoleId' => $inheritedFromRoleId,
            'conditionCount' => $conditionCount,
            'blockedBy' => $blockedBy,
        ];
    }
}
