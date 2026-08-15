<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Company subscription — Domain 00.1 Tenant Subscription/License management.
 *
 * Tracks plan, status, limits, feature entitlements, and effective dates for
 * each company's subscription. Uses soft delete pattern with effective dates
 * rather than hard deletes, preserving historical subscription records.
 */
class CompanySubscription extends Model
{
    protected $fillable = [
        'company_id',
        'plan',
        'status',
        'start_date',
        'end_date',
        'employee_limit',
        'user_limit',
        'storage_limit_bytes',
        'feature_entitlements',
        'license_state',
        'billing_cycle',
        'trial_end',
        'cancellation_date',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'trial_end' => 'date',
        'employee_limit' => 'integer',
        'user_limit' => 'integer',
        'storage_limit_bytes' => 'integer',
        'feature_entitlements' => 'array',
        'license_state' => 'string',
        'billing_cycle' => 'string',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function isTrial(): bool
    {
        return $this->status === 'trial';
    }

    public function isExpired(): bool
    {
        return $this->end_date !== null && now()->gt($this->end_date);
    }

    public function isWithinLimits(int $employeeCount, int $userCount): bool
    {
        $employeeOk = $this->employee_limit === null ||
                      $employeeCount < $this->employee_limit;

        $userOk = $this->user_limit === null ||
                  $userCount < $this->user_limit;

        return $employeeOk && $userOk;
    }

    public function hasFeatureEntitlement(string $feature): bool
    {
        $entitlements = $this->feature_entitlements ?? [];
        return in_array($feature, $entitlements, true);
    }

    public function canAddEmployee(): bool
    {
        if (!$this->isActive()) {
            return false;
        }
        if ($this->isTrial() && now()->gt($this->trial_end ?? now())) {
            return false;
        }
        if ($this->isExpired()) {
            return false;
        }
        return true;
    }
}