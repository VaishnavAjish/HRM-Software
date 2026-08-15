<?php

namespace App\Models;

/**
 * FeatureFlag — Domain 00.7 Feature Management.
 *
 * Centralized feature flag evaluation service. Uses one centralized feature
 * evaluation service rather than scattering feature checks throughout the codebase.
 *
 * Feature evaluation may consider:
 *   Platform → Tenant → Company → Country → Role → User
 *
 * Do NOT scatter if (companyId === ...) if (tenantId === ...) throughout the codebase.
 */
class FeatureFlag extends Model
{
    protected $fillable = [
        'key',
        'name',
        'description',
        'enabled',
        'rollout_percentage',
        'rollout_cohort',
        'dependency_keys',
        'status',
        'tenant_scoped',
        'company_scoped',
        'created_by',
    ];

    protected $casts = [
        'enabled' => 'boolean',
        'rollout_percentage' => 'integer',
        'dependency_keys' => 'array',
    ];

    public function tenantAssignments()
    {
        return $this->hasMany(FeatureTenantAssignment::class);
    }

    public function companyAssignments()
    {
        return $this->hasMany(FeatureCompanyAssignment::class);
    }

    public function isEnabledFor(User $user = null): bool
    {
        // Check global enabled status
        if (!$this->enabled) {
            return false;
        }

        // Check status
        if ($this->status !== 'active') {
            return false;
        }

        // Check rollout percentage
        if ($this->rollout_percentage !== null && $this->rollout_percentage > 0) {
            $random = random_int(1, 100);
            if ($random > $this->rollout_percentage) {
                return false;
            }
        }

        // Check dependencies
        if (!empty($this->dependency_keys)) {
            foreach ($this->dependency_keys as $depKey) {
                $depFlag = FeatureFlag::where('key', $depKey)->first();
                if ($depFlag && !$depFlag->isEnabledFor($user)) {
                    return false; // Required dependency is disabled
                }
            }
        }

        // Check tenant scope
        if ($this->tenant_scoped && $user) {
            $tenantAssignment = $this->tenantAssignments()
                ->where('tenant_id', $user->company_id)
                ->first();

            if (!$tenantAssignment?->is_enabled) {
                return false;
            }
        }

        // Check company scope
        if ($this->company_scoped && $user) {
            $companyAssignment = $this->companyAssignments()
                ->where('company_id', $user->company_id)
                ->first();

            if (!$companyAssignment?->is_enabled) {
                return false;
            }
        }

        return true;
    }

    public function evaluate(string $featureKey, User $user = null): bool
    {
        $flag = $this->where('key', $featureKey)->first();

        if (!$flag) {
            return false; // Feature not found - default off
        }

        return $flag->isEnabledFor($user);
    }
}