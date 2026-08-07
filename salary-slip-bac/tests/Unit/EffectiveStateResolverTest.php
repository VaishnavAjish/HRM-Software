<?php

namespace Tests\Unit;

use App\Services\Authorization\Matrix\EffectiveStateResolver;
use PHPUnit\Framework\TestCase;

/**
 * The precedence model is the security contract of the whole matrix, so it is
 * pinned here rather than left to be inferred from the screen. The resolver is
 * pure — it takes grant maps and returns states — so these run without a
 * database.
 */
class EffectiveStateResolverTest extends TestCase
{
    private EffectiveStateResolver $resolver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resolver = new EffectiveStateResolver();
    }

    private function grant(string $effect = 'ALLOW', int $conditions = 0, ?int $roleId = null): array
    {
        return ['effect' => $effect, 'conditions' => $conditions, 'roleId' => $roleId];
    }

    public function test_not_assigned_defaults_to_deny(): void
    {
        $states = $this->resolver->resolveAll([], []);

        $this->assertSame('NOT_ASSIGNED', $states['ui.employees.master.delete']['configuredState']);
        $this->assertSame('DENY', $states['ui.employees.master.delete']['effectiveResult']);
        $this->assertSame('DEFAULT_DENY', $states['ui.employees.master.delete']['reason']);
    }

    public function test_explicit_allow_on_a_clear_chain_is_effective(): void
    {
        $states = $this->resolver->resolveAll([
            'ui.employees' => $this->grant(),
            'ui.employees.master' => $this->grant(),
            'ui.employees.master.create' => $this->grant(),
        ], []);

        $this->assertSame('ALLOW', $states['ui.employees.master.create']['effectiveResult']);
        $this->assertSame('DIRECT', $states['ui.employees.master.create']['source']);
    }

    public function test_explicit_deny_beats_an_allow_anywhere(): void
    {
        $states = $this->resolver->resolveAll([
            'ui.employees' => $this->grant(),
            'ui.employees.master' => $this->grant(),
            'ui.employees.master.delete' => $this->grant('DENY'),
        ], []);

        $this->assertSame('DENY', $states['ui.employees.master.delete']['effectiveResult']);
        $this->assertSame('EXPLICIT_DENY', $states['ui.employees.master.delete']['reason']);
    }

    public function test_inherited_deny_beats_a_direct_allow(): void
    {
        $states = $this->resolver->resolveAll(
            ['ui.employees' => $this->grant(), 'ui.employees.master' => $this->grant()],
            ['ui.employees.master' => $this->grant('DENY', 0, 7)],
        );

        $this->assertSame('ALLOW', $states['ui.employees.master']['configuredState']);
        $this->assertSame('DENY', $states['ui.employees.master']['effectiveResult']);
        $this->assertSame('INHERITED_DENY', $states['ui.employees.master']['reason']);
        $this->assertSame(7, $states['ui.employees.master']['inheritedFromRoleId']);
    }

    public function test_not_assigned_with_an_inherited_allow_is_allowed(): void
    {
        $states = $this->resolver->resolveAll([], [
            'ui.employees' => $this->grant('ALLOW', 0, 7),
            'ui.employees.master' => $this->grant('ALLOW', 0, 7),
        ]);

        $this->assertSame('NOT_ASSIGNED', $states['ui.employees.master']['configuredState']);
        $this->assertSame('ALLOW', $states['ui.employees.master']['effectiveResult']);
        $this->assertSame('INHERITED', $states['ui.employees.master']['source']);
    }

    public function test_a_denied_ancestor_suppresses_a_configured_child_allow(): void
    {
        $states = $this->resolver->resolveAll([
            'ui.employees' => $this->grant('DENY'),
            'ui.employees.master' => $this->grant(),
            'ui.employees.master.create' => $this->grant(),
        ], []);

        // The configuration survives; only the effective result changes.
        $this->assertSame('ALLOW', $states['ui.employees.master']['configuredState']);
        $this->assertSame('DENY', $states['ui.employees.master']['effectiveResult']);
        $this->assertSame('ui.employees', $states['ui.employees.master']['blockedBy']);

        $this->assertSame('ALLOW', $states['ui.employees.master.create']['configuredState']);
        $this->assertSame('DENY', $states['ui.employees.master.create']['effectiveResult']);
    }

    public function test_re_enabling_the_ancestor_restores_the_descendants(): void
    {
        $configured = [
            'ui.employees' => $this->grant(),
            'ui.employees.master' => $this->grant(),
            'ui.employees.master.create' => $this->grant(),
        ];

        $states = $this->resolver->resolveAll($configured, []);

        $this->assertSame('ALLOW', $states['ui.employees.master']['effectiveResult']);
        $this->assertSame('ALLOW', $states['ui.employees.master.create']['effectiveResult']);
    }

    public function test_conditions_produce_a_conditional_state(): void
    {
        $states = $this->resolver->resolveAll([
            'ui.employees' => $this->grant(),
            'ui.employees.master' => $this->grant(),
            'ui.employees.master.import' => $this->grant('ALLOW', 2),
        ], []);

        $this->assertSame('CONDITIONAL', $states['ui.employees.master.import']['configuredState']);
        $this->assertSame('CONDITIONAL', $states['ui.employees.master.import']['effectiveResult']);
        $this->assertSame(2, $states['ui.employees.master.import']['conditionCount']);
    }

    public function test_an_unassigned_row_under_an_unassigned_parent_reports_default_deny(): void
    {
        $states = $this->resolver->resolveAll([], []);

        // PARENT_DENIED is reserved for a grant actually being overridden, so an
        // untouched tree must not blame an ancestor that is equally untouched.
        $this->assertSame('DEFAULT_DENY', $states['ui.employees.master']['reason']);
    }

    public function test_grouping_rows_carry_no_configured_state(): void
    {
        $states = $this->resolver->resolveAll([
            'ui.employees' => $this->grant(),
            'ui.employees.master' => $this->grant(),
        ], []);

        $this->assertSame('NOT_ASSIGNED', $states['ui.employees.master.columns']['configuredState']);
    }

    public function test_a_sensitive_column_is_denied_independently_of_its_page(): void
    {
        $states = $this->resolver->resolveAll([
            'ui.employees' => $this->grant(),
            'ui.employees.master' => $this->grant(),
            'ui.employees.master.column.salary' => $this->grant('DENY'),
            'ui.employees.master.column.name' => $this->grant(),
        ], []);

        $this->assertSame('DENY', $states['ui.employees.master.column.salary']['effectiveResult']);
        $this->assertSame('ALLOW', $states['ui.employees.master.column.name']['effectiveResult']);
    }
}
