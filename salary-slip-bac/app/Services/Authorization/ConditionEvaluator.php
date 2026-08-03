<?php

namespace App\Services\Authorization;

use Illuminate\Support\Arr;
use InvalidArgumentException;

/** Evaluates a validated JSON condition tree. It never executes code or SQL. */
class ConditionEvaluator
{
    public const OPERATORS = [
        'equals', 'not_equals', 'contains', 'not_contains', 'in', 'not_in',
        'greater_than', 'greater_than_or_equal', 'less_than', 'less_than_or_equal',
        'between', 'starts_with', 'ends_with', 'exists', 'not_exists', 'matches',
        'is_owner', 'is_creator', 'is_assignee', 'is_manager', 'is_direct_report',
        'is_indirect_report', 'is_same_company', 'is_same_branch',
        'is_same_department', 'is_same_team',
    ];

    public function evaluate(?array $tree, array $context): bool
    {
        if (!$tree) {
            return true;
        }

        if (array_key_exists('all', $tree)) {
            return collect($tree['all'])->every(fn ($child) => $this->evaluate($child, $context));
        }
        if (array_key_exists('any', $tree)) {
            return collect($tree['any'])->contains(fn ($child) => $this->evaluate($child, $context));
        }
        if (array_key_exists('not', $tree)) {
            return !$this->evaluate($tree['not'], $context);
        }

        $operator = (string) ($tree['operator'] ?? '');
        if (!in_array($operator, self::OPERATORS, true)) {
            throw new InvalidArgumentException('INVALID_POLICY_CONDITION');
        }

        $left = $this->operand($tree['left'] ?? $tree['attribute'] ?? null, $context);
        $right = $this->operand($tree['right'] ?? $tree['value'] ?? null, $context, false);

        return match ($operator) {
            'equals' => $left === $right,
            'not_equals' => $left !== $right,
            'contains' => $this->contains($left, $right),
            'not_contains' => !$this->contains($left, $right),
            'in' => is_array($right) && in_array($left, $right, true),
            'not_in' => !is_array($right) || !in_array($left, $right, true),
            'greater_than' => $left > $right,
            'greater_than_or_equal' => $left >= $right,
            'less_than' => $left < $right,
            'less_than_or_equal' => $left <= $right,
            'between' => is_array($right) && count($right) === 2 && $left >= $right[0] && $left <= $right[1],
            'starts_with' => is_string($left) && is_string($right) && str_starts_with($left, $right),
            'ends_with' => is_string($left) && is_string($right) && str_ends_with($left, $right),
            'exists' => $left !== null,
            'not_exists' => $left === null,
            'matches' => $this->safeGlobMatch($left, $right),
            'is_owner' => $this->same($context, 'subject.id', 'resource.owner_id'),
            'is_creator' => $this->same($context, 'subject.id', 'resource.created_by'),
            'is_assignee' => $this->same($context, 'subject.id', 'resource.assigned_to'),
            'is_manager' => $this->hasRelationship($context, 'manager_of'),
            'is_direct_report' => $this->hasRelationship($context, 'direct_manager_of'),
            'is_indirect_report' => $this->hasRelationship($context, 'indirect_manager_of'),
            'is_same_company' => $this->same($context, 'subject.company_code', 'resource.company_code'),
            'is_same_branch' => $this->same($context, 'subject.branch_id', 'resource.branch_id'),
            'is_same_department' => $this->same($context, 'subject.department', 'resource.department'),
            'is_same_team' => $this->same($context, 'subject.team_id', 'resource.team_id'),
        };
    }

    public function validate(?array $tree, int $depth = 0): void
    {
        if (!$tree) {
            return;
        }
        if ($depth > 12) {
            throw new InvalidArgumentException('INVALID_POLICY_CONDITION_DEPTH');
        }
        foreach (['all', 'any'] as $group) {
            if (array_key_exists($group, $tree)) {
                if (!is_array($tree[$group]) || count($tree[$group]) > 50) {
                    throw new InvalidArgumentException('INVALID_POLICY_CONDITION_GROUP');
                }
                foreach ($tree[$group] as $child) {
                    $this->validate($child, $depth + 1);
                }
                return;
            }
        }
        if (array_key_exists('not', $tree)) {
            $this->validate($tree['not'], $depth + 1);
            return;
        }
        if (!in_array($tree['operator'] ?? null, self::OPERATORS, true)) {
            throw new InvalidArgumentException('INVALID_POLICY_CONDITION');
        }
    }

    private function operand(mixed $operand, array $context, bool $pathsByDefault = true): mixed
    {
        if (is_array($operand) && array_key_exists('path', $operand)) {
            return Arr::get($context, (string) $operand['path']);
        }
        if ($pathsByDefault && is_string($operand) && preg_match('/^(subject|resource|environment|action)\./', $operand)) {
            return Arr::get($context, $operand);
        }
        if (!$pathsByDefault && is_string($operand) && str_starts_with($operand, '$')) {
            return Arr::get($context, substr($operand, 1));
        }
        return $operand;
    }

    private function contains(mixed $haystack, mixed $needle): bool
    {
        if (is_array($haystack)) {
            return in_array($needle, $haystack, true);
        }
        return is_string($haystack) && is_string($needle) && str_contains($haystack, $needle);
    }

    private function safeGlobMatch(mixed $value, mixed $pattern): bool
    {
        if (!is_string($value) || !is_string($pattern) || strlen($pattern) > 256) {
            return false;
        }
        $regex = '/^' . str_replace(['\\*', '\\?'], ['.*', '.'], preg_quote($pattern, '/')) . '$/uD';
        return preg_match($regex, $value) === 1;
    }

    private function same(array $context, string $left, string $right): bool
    {
        $a = Arr::get($context, $left);
        $b = Arr::get($context, $right);
        return $a !== null && $b !== null && (string) $a === (string) $b;
    }

    private function hasRelationship(array $context, string $relationship): bool
    {
        return in_array($relationship, Arr::wrap(Arr::get($context, 'relationships', [])), true);
    }
}
