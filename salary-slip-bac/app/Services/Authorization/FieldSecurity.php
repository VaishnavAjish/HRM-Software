<?php

namespace App\Services\Authorization;

use Illuminate\Support\Arr;

class FieldSecurity
{
    public function filterResponse(array $record, array $obligations): array
    {
        foreach (Arr::wrap($obligations['hiddenFields'] ?? []) as $field) {
            Arr::forget($record, $field);
        }
        foreach (Arr::wrap($obligations['maskedFields'] ?? []) as $field) {
            if (Arr::has($record, $field)) {
                Arr::set($record, $field, $this->mask(Arr::get($record, $field)));
            }
        }
        return $record;
    }

    public function forbiddenUpdates(array $input, array $obligations): array
    {
        $protected = array_unique(array_merge(
            Arr::wrap($obligations['hiddenFields'] ?? []),
            Arr::wrap($obligations['readOnlyFields'] ?? []),
            Arr::wrap($obligations['maskedFields'] ?? [])
        ));
        return array_values(array_filter($protected, fn ($field) => Arr::has($input, $field)));
    }

    private function mask(mixed $value): mixed
    {
        if (!is_scalar($value) || $value === '') {
            return $value;
        }
        $text = (string) $value;
        $visible = min(4, strlen($text));
        return str_repeat('X', max(4, strlen($text) - $visible)) . substr($text, -$visible);
    }
}
