<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeaveBalance extends Model
{
    use SoftDeletes;

    protected $table = 'leave_balances';

    protected $fillable = [
        'user_id',
        'leave_type_id',
        'leave_policy_id',
        'leave_year',
        'leave_year_start',
        'leave_year_end',
        'opening_balance',
        'accrued',
        'carried_forward',
        'availed',
        'encashed',
        'lapsed',
        'adjusted',
        'current_balance',
        'pending_approval',
        'last_accrual_date',
        'last_carry_forward_date',
        'is_frozen',
        'accrual_history',
        'adjustment_history',
    ];

    protected $casts = [
        'opening_balance' => 'decimal:2',
        'accrued' => 'decimal:2',
        'carried_forward' => 'decimal:2',
        'availed' => 'decimal:2',
        'encashed' => 'decimal:2',
        'lapsed' => 'decimal:2',
        'adjusted' => 'decimal:2',
        'current_balance' => 'decimal:2',
        'pending_approval' => 'decimal:2',
        'leave_year_start' => 'date',
        'leave_year_end' => 'date',
        'last_accrual_date' => 'date',
        'last_carry_forward_date' => 'date',
        'is_frozen' => 'boolean',
        'accrual_history' => 'array',
        'adjustment_history' => 'array',
        'deleted_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function leaveType(): BelongsTo
    {
        return $this->belongsTo(LeaveType::class);
    }

    public function leavePolicy(): BelongsTo
    {
        return $this->belongsTo(LeavePolicy::class);
    }

    public function requests(): HasMany
    {
        return $this->hasMany(LeaveRequest::class, 'leave_balance_id');
    }

    public function scopeActive($query)
    {
        return $query->where('is_frozen', false);
    }

    public function scopeForYear($query, $leaveYear)
    {
        return $query->where('leave_year', $leaveYear);
    }

    public function scopeForUser($query, $userId)
    {
        return $query->where('user_id', $userId);
    }

    public function scopeForType($query, $leaveTypeId)
    {
        return $query->where('leave_type_id', $leaveTypeId);
    }

    public function getAvailableBalanceAttribute(): float
    {
        return $this->current_balance - $this->pending_approval;
    }

    public function canAvail(float $days): bool
    {
        if ($this->is_frozen) {
            return false;
        }

        $available = $this->available_balance;
        $leaveType = $this->leaveType;

        if (!$leaveType->allow_negative_balance && $available < $days) {
            return false;
        }

        if ($leaveType->max_days_per_request && $days > $leaveType->max_days_per_request) {
            return false;
        }

        return true;
    }

    public function accrue(float $days, string $description = 'Accrual'): void
    {
        $this->accrued += $days;
        $this->current_balance += $days;
        $this->last_accrual_date = now()->toDateString();

        $this->accrual_history[] = [
            'date' => now()->toDateString(),
            'days' => $days,
            'description' => $description,
            'balance_after' => $this->current_balance,
        ];

        $this->save();
    }

    public function avail(float $days, string $description = 'Leave availed'): void
    {
        $this->availed += $days;
        $this->current_balance -= $days;

        $this->adjustment_history[] = [
            'date' => now()->toDateString(),
            'days' => -$days,
            'description' => $description,
            'balance_after' => $this->current_balance,
        ];

        $this->save();
    }

    public function adjust(float $days, string $description = 'Manual adjustment'): void
    {
        $this->adjusted += $days;
        $this->current_balance += $days;

        $this->adjustment_history[] = [
            'date' => now()->toDateString(),
            'days' => $days,
            'description' => $description,
            'balance_after' => $this->current_balance,
        ];

        $this->save();
    }

    public function encash(float $days, string $description = 'Leave encashment'): void
    {
        if ($days > $this->current_balance) {
            throw new \Exception('Cannot encash more than current balance');
        }

        $this->encashed += $days;
        $this->current_balance -= $days;

        $this->adjustment_history[] = [
            'date' => now()->toDateString(),
            'days' => -$days,
            'description' => $description,
            'balance_after' => $this->current_balance,
        ];

        $this->save();
    }

    public function lapse(float $days, string $description = 'Leave lapsed'): void
    {
        if ($days > $this->current_balance) {
            $days = $this->current_balance;
        }

        $this->lapsed += $days;
        $this->current_balance -= $days;

        $this->adjustment_history[] = [
            'date' => now()->toDateString(),
            'days' => -$days,
            'description' => $description,
            'balance_after' => $this->current_balance,
        ];

        $this->save();
    }

    public function carryForward(float $days, string $description = 'Carry forward'): void
    {
        $this->carried_forward += $days;
        $this->current_balance += $days;
        $this->last_carry_forward_date = now()->toDateString();

        $this->adjustment_history[] = [
            'date' => now()->toDateString(),
            'days' => $days,
            'description' => $description,
            'balance_after' => $this->current_balance,
        ];

        $this->save();
    }

    public function addPendingApproval(float $days): void
    {
        $this->pending_approval += $days;
        $this->save();
    }

    public function removePendingApproval(float $days): void
    {
        $this->pending_approval = max(0, $this->pending_approval - $days);
        $this->save();
    }

    public function confirmApproval(float $days): void
    {
        $this->pending_approval = max(0, $this->pending_approval - $days);
        $this->avail($days, 'Approved leave');
    }

    public function rejectApproval(float $days): void
    {
        $this->pending_approval = max(0, $this->pending_approval - $days);
        $this->save();
    }

    public function recalculate(): void
    {
        $this->current_balance = $this->opening_balance
            + $this->accrued
            + $this->carried_forward
            + $this->adjusted
            - $this->availed
            - $this->encashed
            - $this->lapsed;

        $this->save();
    }
}