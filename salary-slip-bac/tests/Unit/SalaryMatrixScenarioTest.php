<?php

namespace Tests\Unit;

use App\Services\Authorization\Matrix\EffectiveStateResolver;
use PHPUnit\Framework\TestCase;

/**
 * The Salary configuration shown on the Permission Matrix screen, pinned.
 *
 * EffectiveStateResolverTest covers the precedence rules one at a time. This
 * pins the whole worked example the matrix is specified by, so a change that
 * satisfies each rule in isolation but breaks the combination is caught here.
 *
 * The three scenarios are the module tree as configured, the same tree with the
 * page denied, and with the module denied. Configured state must survive both
 * suppressions — re-enabling the parent has to restore the children rather than
 * requiring every descendant to be set again.
 */
class SalaryMatrixScenarioTest extends TestCase
{
    private const ACTIONS = [
        'ui.salary.batch.create',
        'ui.salary.batch.update',
        'ui.salary.batch.delete',
        'ui.salary.batch.execute',
        'ui.salary.batch.approve',
        'ui.salary.batch.export',
    ];

    private EffectiveStateResolver $resolver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resolver = new EffectiveStateResolver();
    }

    private function allow(): array
    {
        return ['effect' => 'ALLOW', 'conditions' => 0];
    }

    private function deny(): array
    {
        return ['effect' => 'DENY', 'conditions' => 0];
    }

    private function configured(): array
    {
        return [
            'ui.salary' => $this->allow(),
            'ui.salary.batch' => $this->allow(),
            'ui.salary.batch.print' => $this->allow(),
            'ui.salary.upload' => $this->deny(),
        ];
    }

    public function test_matrix_screen_configuration_resolves_as_displayed(): void
    {
        $states = $this->resolver->resolveAll($this->configured(), []);

        $this->assertSame('ALLOW', $states['ui.salary']['effectiveResult']);
        $this->assertSame('ALLOW', $states['ui.salary.batch']['effectiveResult']);
        $this->assertSame('ALLOW', $states['ui.salary.batch.print']['effectiveResult']);
        $this->assertSame('DENY', $states['ui.salary.upload']['effectiveResult']);

        // An unassigned action under an allowed page stays denied: reaching a
        // page never carries the right to act inside it.
        foreach (self::ACTIONS as $action) {
            $this->assertSame('NOT_ASSIGNED', $states[$action]['configuredState'], $action);
            $this->assertSame('DENY', $states[$action]['effectiveResult'], $action);
        }
    }

    public function test_denying_the_page_suppresses_actions_without_erasing_them(): void
    {
        $direct = $this->configured();
        $direct['ui.salary.batch'] = $this->deny();

        $states = $this->resolver->resolveAll($direct, []);

        $this->assertSame('ALLOW', $states['ui.salary.batch.print']['configuredState']);
        $this->assertSame('DENY', $states['ui.salary.batch.print']['effectiveResult']);
        $this->assertSame('ui.salary.batch', $states['ui.salary.batch.print']['blockedBy']);
    }

    public function test_denying_the_module_suppresses_every_descendant(): void
    {
        $direct = $this->configured();
        $direct['ui.salary'] = $this->deny();

        $states = $this->resolver->resolveAll($direct, []);

        foreach (['ui.salary.batch', 'ui.salary.batch.print', 'ui.salary.upload'] as $key) {
            $this->assertSame('DENY', $states[$key]['effectiveResult'], $key);
        }

        $this->assertSame('ALLOW', $states['ui.salary.batch']['configuredState']);
        $this->assertSame('ALLOW', $states['ui.salary.batch.print']['configuredState']);
    }

    public function test_restoring_the_module_restores_children_from_saved_configuration(): void
    {
        $denied = $this->configured();
        $denied['ui.salary'] = $this->deny();
        $this->resolver->resolveAll($denied, []);

        $states = $this->resolver->resolveAll($this->configured(), []);

        $this->assertSame('ALLOW', $states['ui.salary.batch']['effectiveResult']);
        $this->assertSame('ALLOW', $states['ui.salary.batch.print']['effectiveResult']);
        $this->assertSame('DENY', $states['ui.salary.upload']['effectiveResult']);
    }
}
