<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CompensatoryOff extends Model
{
    use SoftDeletes;

    protected $table = 'compensatory_off';

    protected $fillable = [
        'user_id',
        'leave_type_id',
        'leave_balance_id',
        'worked_date',
        'hours_worked',
        'hours_earned',
        'earning_rule',
        'reason',
        'supporting_documents',
        'approved_by',
        'approved_at',
        'status',
        'expiry_date',
        'availed_hours',
        'avail_history',
        'leave_request_id',
    ];

    protected $casts = [
        'worked_date' => 'date',
        'hours_worked' => 'decimal:2',
        'hours_earned' => 'decimal:2',
        'hours_earned' => 'decimal:2',
        'approved_at' => 'datetime',
        'expiry_date' => 'date',
        'availed_hours' => 'decimal:2',
        'avail_history' => 'array',
        'deleted_at' => 'datetime',
    ];

    public const EARNING_RULES = [
        'standard' => 'Standard (1:1)',
        'time_and_half' => 'Time and Half (1.5:1)',
        'double' => 'Double (2:1)',
    ];

    public const STATUSES = [
        'pending' => 'Pending',
        'approved' => 'Approved',
        'rejected' => 'Rejected',
        'expired' => 'Expired',
        'availed' => 'Availed',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function leaveType(): BelongsTo
    {
        return $this->belongsTo(LeaveType::class);
    }

    public function leaveBalance(): BelongsTo
    {
        return $this->belongsTo(LeaveBalance::class, 'leave_balance_id');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function leaveRequest(): BelongsTo
    {
        return $this->belongsTo(LeaveRequest::class, 'leave_request_id');
    }

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeApproved($query)
    {
        return $query->where('status', 'approved');
    }

    public function scopeActive($query)
    {
        return $query->whereIn('status', ['approved', 'availed']);
    }

    public function scopeForUser($query, $userId)
    {
        return $query->where('user_id', $userId);
    }

    public function scopeValid($query)
    {
        return $query->where('status', 'approved')
            ->where(function ($q) {
                $q->whereNull('expiry_date')
                    ->orWhere('expiry_date', '>=', now()->toDateString());
            });
    }

    public function getAvailableHoursAttribute(): float
    {
        return $this->hours_earned - $this->availed_hours;
    }

    public function isExpired(): bool
    {
        return $this->expiry_date && $this->expiry_date < now()->toDateString();
    }

    public function approve($approverId = null): void
    {
        $this->update([
            'status' => 'approved',
            'approved_by' => $approverId ?? auth()->id(),
            'approved_at' => now(),
        ]);

        // Add to leave balance if linked
        if ($this->leave_balance_id) {
            $this->leaveBalance->accrue($this->hours_earned, "CO earned on {$this->worked_date}");
        }
    }

    public function reject($rejectorId = null, $reason = null): void
    {
        $this->update([
            'status' => 'rejected',
        ]);
    }

    public function avail(float $hours, $leaveRequestId = null): void
    {
        $available = $this->available_hours;
        
        if ($hours > $available) {
            throw new \Exception("Cannot avail more than available hours ($available)");
        }

        $this->availed_hours += $hours;
        
        $this->avail_history[] = [
            'date' => now()->toDateString(),
            'hours' => $hours,
            'leave_request_id' => $leaveRequestId,
            'balance_after' => $this->available_hours,
        ];

        if ($this->available_hours <= 0) {
            $this->status = 'availed';
        }

        if ($leaveRequestId) {
            $this->leave_request_id = $leaveRequestId;
        }

        $this->save();
    }

    public function checkExpiry(): void
    {
        if ($this->isExpired() && $this->status === 'approved') {
            $this->status = 'expired';
            $this->save();
        }
    }
}