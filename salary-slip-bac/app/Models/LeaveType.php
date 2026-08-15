<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class LeaveType extends Model
{
    use SoftDeletes;

    protected $table = 'leave_types';

    protected $fillable = [
        'code',
        'name',
        'description',
        'category',
        'is_paid',
        'requires_approval',
        'requires_document',
        'is_active',
        'is_system',
        'max_days_per_request',
        'max_days_per_year',
        'min_notice_days',
        'allow_half_day',
        'allow_negative_balance',
        'carry_forward_allowed',
        'max_carry_forward_days',
        'carry_forward_expiry',
        'applicable_genders',
        'applicable_employment_types',
        'applicable_grades',
        'applicable_departments',
        'applicable_locations',
        'color',
        'icon',
        'sort_order',
    ];

    protected $casts = [
        'is_paid' => 'boolean',
        'requires_approval' => 'boolean',
        'requires_document' => 'boolean',
        'is_active' => 'boolean',
        'is_system' => 'boolean',
        'allow_half_day' => 'boolean',
        'allow_negative_balance' => 'boolean',
        'carry_forward_allowed' => 'boolean',
        'applicable_genders' => 'array',
        'applicable_employment_types' => 'array',
        'applicable_grades' => 'array',
        'applicable_departments' => 'array',
        'applicable_locations' => 'array',
        'carry_forward_expiry' => 'date',
        'deleted_at' => 'datetime',
    ];

    public const CATEGORIES = [
        'standard' => 'Standard Leave',
        'medical' => 'Medical Leave',
        'special' => 'Special Leave',
        'compensatory' => 'Compensatory Leave',
    ];

    public function policyTypes(): HasMany
    {
        return $this->hasMany(LeavePolicyType::class);
    }

    public function policies(): BelongsToMany
    {
        return $this->belongsToMany(LeavePolicy::class, 'leave_policy_types')
            ->withPivot([
                'annual_entitlement',
                'max_per_request',
                'min_per_request',
                'max_requests_per_year',
                'min_notice_days',
                'allow_half_day',
                'requires_document',
                'document_types',
                'is_active',
            ])
            ->withTimestamps();
    }

    public function balances(): HasMany
    {
        return $this->hasMany(LeaveBalance::class);
    }

    public function requests(): HasMany
    {
        return $this->hasMany(LeaveRequest::class);
    }

    public function compensatoryOff(): HasMany
    {
        return $this->hasMany(CompensatoryOff::class);
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeCategory($query, $category)
    {
        return $query->where('category', $category);
    }

    public function scopeSystem($query)
    {
        return $query->where('is_system', true);
    }

    public function isApplicableTo($employee): bool
    {
        if (!$this->is_active) {
            return false;
        }

        // Check gender
        if ($this->applicable_genders && !in_array($employee->gender, $this->applicable_genders)) {
            return false;
        }

        // Check employment type
        if ($this->applicable_employment_types && !in_array($employee->employment_type, $this->applicable_employment_types)) {
            return false;
        }

        // Check grade
        if ($this->applicable_grades && $employee->grade_id && !in_array($employee->grade_id, $this->applicable_grades)) {
            return false;
        }

        // Check department
        if ($this->applicable_departments && $employee->department_id && !in_array($employee->department_id, $this->applicable_departments)) {
            return false;
        }

        // Check location
        if ($this->applicable_locations && $employee->location_id && !in_array($employee->location_id, $this->applicable_locations)) {
            return false;
        }

        return true;
    }

    public function getDefaultColor(): string
    {
        return $this->color ?? match ($this->category) {
            'standard' => '#3B82F6', // blue
            'medical' => '#EF4444',  // red
            'special' => '#F59E0B',  // amber
            'compensatory' => '#10B981', // emerald
            default => '#6B7280',    // gray
        };
    }
}