<?php

namespace App\Models;

/**
 * EffectiveRecord — Domain 00.5 Effective Dating and Record History.
 *
 * Provides effective dating pattern for records that have start and end dates.
 * Core pattern:
 *   Historical: effective_start < effective_end < now
 *   Current: effective_start <= now <= effective_end
 *   Future: now < effective_start
 *
 * This model can be used as a mixin/trait for other models that need effective dating.
 *
 * Example:
 *   Configuration A
 *   2026-01-01 → 2026-06-30
 *
 *   Configuration B
 *   2026-07-01 → onwards
 */
trait EffectiveDating
{
    /**
     * Effective start date for this record.
     */
    protected $effective_start;

    /**
     * Effective end date for this record. Null means "ongoing/indefinite".
     */
    protected $effective_end;

    public function setEffectiveStart($date): void
    {
        $this->effective_start = $date instanceof \DateTime ? $date->format('Y-m-d') : $date;
    }

    public function getEffectiveStart(): ?string
    {
        return $this->effective_start;
    }

    public function setEffectiveEnd($date): void
    {
        $this->effective_end = $date instanceof \DateTime ? $date->format('Y-m-d') : $date;
    }

    public function getEffectiveEnd(): ?string
    {
        return $this->effective_end;
    }

    public function isEffectiveNow(): bool
    {
        $now = now();
        $start = $this->effective_start ? \DateTime::createFromFormat('Y-m-d', $this->effective_start) : null;
        $end = $this->effective_end ? \DateTime::createFromFormat('Y-m-d', $this->effective_end) : null;

        if ($start && $now->lt($start)) {
            return false; // Not yet effective (future-dated)
        }

        if ($end && $now->gt($end)) {
            return false; // Expired (past effective end)
        }

        return true; // Currently effective
    }

    public function isFutureDated(): bool
    {
        $now = now();
        $start = $this->effective_start ? \DateTime::createFromFormat('Y-m-d', $this->effective_start) : null;

        return $start && $now->lt($start);
    }

    public function isExpired(): bool
    {
        $end = $this->effective_end ? \DateTime::createFromFormat('Y-m-d', $this->effective_end) : null;

        return $end && $now->gt($end);
    }

    public function scopeActive($query): void
    {
        $query->where(function ($q) {
            $q->whereNull('effective_end')
                ->where('effective_start', '<=', now())
                ->where(function ($q2) {
                    $q2->where('effective_end', '>=', now())
                        ->orWhereNull('effective_end');
                });
        });
    }

    public function scopeHistorical($query, $date = null): void
    {
        $date = $date ?? now();
        $query->where(function ($q) use ($date) {
            $q->where('effective_start', '<=', $date)
                ->where(function ($q2) use ($date) {
                    $q2->where('effective_end', '>=', $date)
                        ->where('effective_end', '>', '0000-00-00')
                        ->orWhereNull('effective_end');
                });
        });
    }

    public function scopeFuture($query): void
    {
        $query->where('effective_start', '>', now());
    }
}