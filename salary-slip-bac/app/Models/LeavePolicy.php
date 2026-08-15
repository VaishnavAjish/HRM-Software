<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class LeavePolicy extends Model
{
    use SoftDeletes;

    protected $table = 'leave_policies';

    protected $fillable = [
        'code',
        'name',
        'description',
        'scope_type',
        'scope_id',
        'company_id',
        'legal_entity_id',
        'country_id',
        'location_id',
        'department_id',
        'grade_id',
        'worker_type_id',
        'effective_from',
        'effective_to',
        'accrual_frequency',
        'accrual_day_of_month',
        'pro_rata_first_year',
        'pro_rata_last_year',
        'leave_year_start',
        'allow_carry_forward',
        'max_carry_forward_days',
        'carry_forward_expiry',
        'allow_negative_balance',
        'max_negative_balance_days',
        'require_approval_for_all',
        'approval_workflow',
        'is_active',
        'is_default',
        'priority',
    ];

    protected $casts = [
        'pro_rata_first_year' => 'boolean',
        'pro_rata_last_year' => 'boolean',
        'allow_carry_forward' => 'boolean',
        'allow_negative_balance' => 'boolean',
        'require_approval_for_all' => 'boolean',
        'approval_workflow' => 'array',
        'is_active' => 'boolean',
        'is_default' => 'boolean',
        'effective_from' => 'date',
        'effective_to' => 'date',
        'carry_forward_expiry' => 'date',
        'deleted_at' => 'datetime',
    ];

    public const SCOPE_TYPES = [
        'company' => 'Company',
        'legal_entity' => 'Legal Entity',
        'country' => 'Country',
        'location' => 'Location',
        'department' => 'Department',
        'grade' => 'Grade',
        'worker_type' => 'Worker Type',
    ];

    public const ACCRUAL_FREQUENCIES = [
        'daily' => 'Daily',
        'weekly' => 'Weekly',
        'monthly' => 'Monthly',
        'quarterly' => 'Quarterly',
        'yearly' => 'Yearly',
        'on_joining' => 'On Joining',
    ];

    public function types(): BelongsToMany
    {
        return $this->belongsToMany(LeaveType::class, 'leave_policy_types')
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

    public function policyTypes(): HasMany
    {
        return $this->hasMany(LeavePolicyType::class);
    }

    public function balances(): HasMany
    {
        return $this->hasMany(LeaveBalance::class);
    }

    public function requests(): HasMany
    {
        return $this->hasMany(LeaveRequest::class);
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function legalEntity()
    {
        return $this->belongsTo(LegalEntity::class);
    }

    public function country()
    {
        return $this->belongsTo(Country::class);
    }

    public function location()
    {
        return $this->belongsTo(Location::class);
    }

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function grade()
    {
        return $this->belongsTo(Grade::class);
    }

    public function workerType()
    {
        return $this->belongsTo(WorkerType::class);
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeDefault($query)
    {
        return $query->where('is_default', true);
    }

    public function scopeForScope($query, $scopeType, $scopeId)
    {
        return $query->where('scope_type', $scopeType)
            ->where('scope_id', $scopeId);
    }

    public function scopeForCompany($query, $companyId)
    {
        return $query->where('company_id', $companyId);
    }

    public function scopeEffective($query, $date = null)
    {
        $date = $date ?? now()->toDateString();
        return $query->where('effective_from', '<=', $date)
            ->where(function ($q) use ($date) {
                $q->whereNull('effective_to')
                    ->orWhere('effective_to', '>=', $date);
            });
    }

    public function scopePriorityOrder($query)
    {
        return $query->orderBy('priority', 'asc');
    }

    public function getApplicableLeaveTypes(): array
    {
        return $this->types()
            ->wherePivot('is_active', true)
            ->get()
            ->mapWithKeys(function ($type) {
                return [$type->id => [
                    'type' => $type,
                    'annual_entitlement' => $type->pivot->annual_entitlement,
                    'max_per_request' => $type->pivot->max_per_request,
                    'min_per_request' => $type->pivot->min_per_request,
                    'max_requests_per_year' => $type->pivot->max_requests_per_year,
                    'min_notice_days' => $type->pivot->min_notice_days,
                    'allow_half_day' => $type->pivot->allow_half_day,
                    'requires_document' => $type->pivot->requires_document,
                    'document_types' => $type->pivot->document_types,
                ]];
            })
            ->toArray();
    }

    public function calculateAccrual($leaveTypeId, $employee, $date): float
    {
        $policyType = $this->policyTypes()
            ->where('leave_type_id', $leaveTypeId)
            ->where('is_active', true)
            ->first();

        if (!$policyType) {
            return 0;
        }

        $annualEntitlement = $policyType->annual_entitlement;

        // Pro-rata for first year
        if ($this->pro_rata_first_year && $employee->joining_date) {
            $joiningDate = \Carbon\Carbon::parse($employee->joining_date);
            $leaveYearStart = \Carbon\Carbon::parse($date)->startOfYear();
            
            if ($joiningDate->gt($leaveYearStart)) {
                $daysInYear = $leaveYearStart->copy()->endOfYear()->diffInDays($leaveYearStart) + 1;
                $daysWorked = $leaveYearStart->copy()->endOfYear()->diffInDays($joiningDate) + 1;
                $annualEntitlement = $annualEntitlement * ($daysWorked / $daysInYear);
            }
        }

        // Calculate based on frequency
        return match ($this->accrual_frequency) {
            'daily' => $annualEntitlement / 365,
            'weekly' => $annualEntitlement / 52,
            'monthly' => $annualEntitlement / 12,
            'quarterly' => $annualEntitlement / 4,
            'yearly' => $annualEntitlement,
            'on_joining' => $annualEntitlement,
            default => $annualEntitlement / 12,
        };
    }

    public function getEffectiveLeaveYearStart($date): \Carbon\Carbon
    {
        $date = \Carbon\Carbon::parse($date);
        $parts = explode('-', $this->leave_year_start);
        $month = (int)($parts[0] ?? 1);
        $day = (int)($parts[1] ?? 1);
        
        $yearStart = \Carbon\Carbon::create($date->year, $month, $day);
        
        if ($date->lt($yearStart)) {
            $yearStart->subYear();
        }
        
        return $yearStart;
    }

    public function getEffectiveLeaveYearEnd($date): \Carbon\Carbon
    {
        return $this->getEffectiveLeaveYearStart($date)->copy()->addYear()->subDay();
    }
}