<?php

namespace Tests\Unit;

use App\Services\Authorization\ConditionEvaluator;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

class ConditionEvaluatorTest extends TestCase
{
    #[Test]
    public function it_evaluates_nested_attribute_and_relationship_conditions(): void
    {
        $context = [
            'subject' => ['id' => 7, 'company_code' => 'acme', 'department' => 'HR'],
            'resource' => ['owner_id' => 7, 'company_code' => 'acme', 'amount' => 800],
            'environment' => ['risk_score' => 12], 'relationships' => ['manager_of'],
        ];
        $tree = ['all' => [
            ['operator' => 'is_owner'],
            ['operator' => 'is_same_company'],
            ['operator' => 'less_than', 'left' => 'environment.risk_score', 'right' => 20],
            ['any' => [
                ['operator' => 'greater_than', 'left' => 'resource.amount', 'right' => 1000],
                ['operator' => 'is_manager'],
            ]],
        ]];

        $this->assertTrue((new ConditionEvaluator())->evaluate($tree, $context));
    }

    #[Test]
    public function it_rejects_unknown_or_excessively_nested_conditions(): void
    {
        $evaluator = new ConditionEvaluator();
        $this->expectException(InvalidArgumentException::class);
        $evaluator->validate(['operator' => 'execute_sql']);
    }
}
