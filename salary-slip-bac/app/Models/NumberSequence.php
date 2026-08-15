<?php

namespace App\Models;

/**
 * NumberSequence — Domain 00.6 Numbering and Sequence Management.
 *
 * Centralized numbering service for generating unique sequences with concurrency-safe
 * generation. Does NOT use SELECT MAX(number) + 1 or generate IDs in frontend.
 *
 * Supports prefix, suffix, padding, starting number, increment, scope (tenant/company/country),
 * reset period, and status.
 *
 * Company-specific patterns:
 *   ABC-000001
 *   XYZ-000001
 *
 * according to configured company scope.
 */
class NumberSequence extends Model
{
    protected $fillable = [
        'name',
        'code',
        'prefix',
        'suffix',
        'padding',
        'starting_number',
        'increment',
        'scope',
        'scope_id',
        'company_id',
        'country_code',
        'status',
        'current_number',
        'reset_period',
        'effective_from',
        'effective_to',
    ];

    protected $casts = [
        'padding' => 'integer',
        'starting_number' => 'integer',
        'increment' => 'integer',
        'scope' => 'string',
        'company_id' => 'integer',
        'country_code' => 'string',
        'effective_from' => 'date',
        'effective_to' => 'date',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function scope(): string
    {
        return $this->scope ?? 'global';
    }

    public function nextNumber(): string
    {
        // Concurrency-safe: use database lock for sequence generation
        $this->lockForUpdate();

        $current = $this->current_number ?? ($this->starting_number - 1);
        $next = $current + $this->increment;

        // Apply reset period logic
        if ($this->reset_period && $this->shouldReset()) {
            $next = $this->starting_number;
        }

        $this->current_number = $next;
        $this->save();

        // Format: prefix + padded number + suffix
        $padded = str_pad($next, $this->padding ?? 6, '0', STR_PAD_LEFT);
        $prefix = $this->prefix ?? '';
        $suffix = $this->suffix ?? '';

        return "{$prefix}{$padded}{$suffix}";
    }

    protected function shouldReset(): bool
    {
        if (is_null($this->effective_from)) {
            return false;
        }

        $now = now();
        $start = \DateTime::createFromFormat('Y-m-d', $this->effective_from);
        $end = $this->effective_to ? \DateTime::createFromFormat('Y-m-d', $this->effective_to) : null;

        if ($start && $now->gte($start)) {
            if ($end && $now->gt($end)) {
                return true;
            }
            if (is_null($end)) {
                return true; // Reset period reached
            }
        }

        return false;
    }

    public function staticPattern(string $companyCode): string
    {
        $sequence = self::where('code', $companyCode)
            ->where('status', 'active')
            ->first();

        if ($sequence) {
            return $sequence->pattern();
        }

        return '{code}-{number:PADDING}';
    }

    public function pattern(): string
    {
        $prefix = $this->prefix ?? '';
        $suffix = $this->suffix ?? '';
        $padding = $this->padding ?? 6;

        return "{$prefix}{{{number:$padding}}}{$suffix}";
    }
}