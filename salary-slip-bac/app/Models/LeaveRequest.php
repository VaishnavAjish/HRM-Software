<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeaveRequest extends Model
{
    use SoftDeletes;

    protected $table = 'leave_requests';

    protected $fillable = [
        'request_number',
        'user_id',
        'leave_type_id',
        'leave_policy_id',
        'leave_balance_id',
        'start_date',
        'end_date',
        'total_days',
        'is_half_day_start',
        'is_half_day_end',
        'half_day_start_time',
        'half_day_end_time',
        'reason',
        'supporting_documents',
        'contact_during_leave',
        'emergency_contact',
        'handover_notes',
        'status',
        'workflow_stage',
        'approval_chain',
        'approval_history',
        'submitted_by',
        'submitted_at',
        'approved_by',
        'approved_at',
        'rejected_by',
        'rejected_at',
        'rejection_reason',
        'cancelled_by',
        'cancelled_at',
        'cancellation_reason',
        'withdrawn_by',
        'withdrawn_at',
        'is_emergency',
        'auto_approve',
        'metadata',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'total_days' => 'decimal:2',
        'is_half_day_start' => 'boolean',
        'is_half_day_end' => 'boolean',
        'half_day_start_time' => 'datetime:H:i',
        'half_day_end_time' => 'datetime:H:i',
        'supporting_documents' => 'array',
        'approval_chain' => 'array',
        'approval_history' => 'array',
        'submitted_at' => 'datetime',
        'approved_at' => 'datetime',
        'rejected_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'withdrawn_at' => 'datetime',
        'is_emergency' => 'boolean',
        'auto_approve' => 'boolean',
        'metadata' => 'array',
        'deleted_at' => 'datetime',
    ];

    public const STATUSES = [
        'draft' => 'Draft',
        'submitted' => 'Submitted',
        'pending' => 'Pending Approval',
        'approved' => 'Approved',
        'rejected' => 'Rejected',
        'cancelled' => 'Cancelled',
        'withdrawn' => 'Withdrawn',
    ];

    public const WORKFLOW_STAGES = [
        'manager' => 'Manager Approval',
        'hr' => 'HR Approval',
        'department_head' => 'Department Head Approval',
        'final' => 'Final Approval',
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

    public function leaveBalance(): BelongsTo
    {
        return $this->belongsTo(LeaveBalance::class, 'leave_balance_id');
    }

    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function rejectedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }

    public function cancelledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }

    public function withdrawnBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'withdrawn_by');
    }

    public function approvals(): HasMany
    {
        return $this->hasMany(LeaveApproval::class);
    }

    public function delegations(): HasMany
    {
        return $this->hasMany(LeaveDelegation::class);
    }

    public function scopeDraft($query)
    {
        return $query->where('status', 'draft');
    }

    public function scopeSubmitted($query)
    {
        return $query->where('status', 'submitted');
    }

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeApproved($query)
    {
        return $query->where('status', 'approved');
    }

    public function scopeRejected($query)
    {
        return $query->where('status', 'rejected');
    }

    public function scopeActive($query)
    {
        return $query->whereIn('status', ['submitted', 'pending', 'approved']);
    }

    public function scopeForUser($query, $userId)
    {
        return $query->where('user_id', $userId);
    }

    public function scopeForType($query, $leaveTypeId)
    {
        return $query->where('leave_type_id', $leaveTypeId);
    }

    public function scopeForDateRange($query, $startDate, $endDate)
    {
        return $query->where(function ($q) use ($startDate, $endDate) {
            $q->whereBetween('start_date', [$startDate, $endDate])
                ->orWhereBetween('end_date', [$startDate, $endDate])
                ->orWhere(function ($q2) use ($startDate, $endDate) {
                    $q2->where('start_date', '<=', $startDate)
                        ->where('end_date', '>=', $endDate);
                });
        });
    }

    public function scopeOverlapping($query, $userId, $startDate, $endDate, $excludeId = null)
    {
        return $query->where('user_id', $userId)
            ->where('status', '!=', 'rejected')
            ->where('status', '!=', 'cancelled')
            ->where('status', '!=', 'withdrawn')
            ->where(function ($q) use ($startDate, $endDate) {
                $q->whereBetween('start_date', [$startDate, $endDate])
                    ->orWhereBetween('end_date', [$startDate, $endDate])
                    ->orWhere(function ($q2) use ($startDate, $endDate) {
                        $q2->where('start_date', '<=', $startDate)
                            ->where('end_date', '>=', $endDate);
                    });
            })
            ->when($excludeId, fn($q) => $q->where('id', '!=', $excludeId));
    }

    public function getStatusLabelAttribute(): string
    {
        return self::STATUSES[$this->status] ?? $this->status;
    }

    public function getWorkflowStageLabelAttribute(): string
    {
        return self::WORKFLOW_STAGES[$this->workflow_stage] ?? $this->workflow_stage;
    }

    public function isEditable(): bool
    {
        return in_array($this->status, ['draft', 'submitted']);
    }

    public function isCancellable(): bool
    {
        return in_array($this->status, ['draft', 'submitted', 'pending', 'approved']);
    }

    public function isWithdrawable(): bool
    {
        return in_array($this->status, ['submitted', 'pending']);
    }

    public function submit(): void
    {
        if ($this->status !== 'draft') {
            throw new \Exception('Only draft requests can be submitted');
        }

        $this->status = 'submitted';
        $this->submitted_at = now();
        $this->submitted_by = auth()->id();
        $this->workflow_stage = $this->getFirstApprovalStage();
        $this->buildApprovalChain();
        $this->save();

        // Add pending approval to balance
        if ($this->leave_balance_id) {
            $this->leaveBalance->addPendingApproval($this->total_days);
        }

        // Notify first approver
        $this->notifyApprovers();
    }

    public function approve($approverId = null, $comments = null): void
    {
        if (!in_array($this->status, ['submitted', 'pending'])) {
            throw new \Exception('Only submitted/pending requests can be approved');
        }

        $approverId = $approverId ?? auth()->id();
        $currentApproval = $this->getCurrentApproval();

        if ($currentApproval) {
            $currentApproval->update([
                'status' => 'approved',
                'decided_at' => now(),
                'comments' => $comments,
            ]);

            $this->addToHistory('approved', $approverId, $comments);
        }

        // Check if there are more approval stages
        $nextStage = $this->getNextApprovalStage();
        
        if ($nextStage) {
            $this->workflow_stage = $nextStage;
            $this->status = 'pending';
            $this->createNextApproval($nextStage);
        } else {
            $this->status = 'approved';
            $this->approved_at = now();
            $this->approved_by = $approverId;
            
            // Confirm approval in balance
            if ($this->leave_balance_id) {
                $this->leaveBalance->confirmApproval($this->total_days);
            }
        }

        $this->save();
        $this->notifyApprovers();
    }

    public function reject($rejectorId = null, $reason = null): void
    {
        if (!in_array($this->status, ['submitted', 'pending'])) {
            throw new \Exception('Only submitted/pending requests can be rejected');
        }

        $rejectorId = $rejectorId ?? auth()->id();
        $currentApproval = $this->getCurrentApproval();

        if ($currentApproval) {
            $currentApproval->update([
                'status' => 'rejected',
                'decided_at' => now(),
                'comments' => $reason,
            ]);

            $this->addToHistory('rejected', $rejectorId, $reason);
        }

        $this->status = 'rejected';
        $this->rejected_at = now();
        $this->rejected_by = $rejectorId;
        $this->rejection_reason = $reason;
        $this->workflow_stage = null;

        // Remove pending approval from balance
        if ($this->leave_balance_id) {
            $this->leaveBalance->rejectApproval($this->total_days);
        }

        $this->save();
        $this->notifyUser('rejected', $reason);
    }

    public function cancel($cancellerId = null, $reason = null): void
    {
        if (!in_array($this->status, ['draft', 'submitted', 'pending', 'approved'])) {
            throw new \Exception('Request cannot be cancelled in current status');
        }

        $cancellerId = $cancellerId ?? auth()->id();

        // If approved, remove from balance
        if ($this->status === 'approved' && $this->leave_balance_id) {
            $this->leaveBalance->removePendingApproval($this->total_days);
        } elseif ($this->leave_balance_id) {
            $this->leaveBalance->rejectApproval($this->total_days);
        }

        $this->status = 'cancelled';
        $this->cancelled_at = now();
        $this->cancelled_by = $cancellerId;
        $this->cancellation_reason = $reason;
        $this->workflow_stage = null;
        $this->save();

        $this->notifyApprovers('cancelled', $reason);
        $this->notifyUser('cancelled', $reason);
    }

    public function withdraw($withdrawerId = null): void
    {
        if (!in_array($this->status, ['submitted', 'pending'])) {
            throw new \Exception('Only submitted/pending requests can be withdrawn');
        }

        $withdrawerId = $withdrawerId ?? auth()->id();

        if ($this->leave_balance_id) {
            $this->leaveBalance->rejectApproval($this->total_days);
        }

        $this->status = 'withdrawn';
        $this->withdrawn_at = now();
        $this->withdrawn_by = $withdrawerId;
        $this->workflow_stage = null;
        $this->save();

        $this->notifyApprovers('withdrawn');
        $this->notifyUser('withdrawn');
    }

    protected function getFirstApprovalStage(): ?string
    {
        $workflow = $this->approval_chain ?? $this->leavePolicy->approval_workflow ?? [];
        
        if (empty($workflow)) {
            return null;
        }

        return $workflow[0]['stage'] ?? 'manager';
    }

    protected function getNextApprovalStage(): ?string
    {
        $workflow = $this->approval_chain ?? $this->leavePolicy->approval_workflow ?? [];
        $currentIndex = array_search($this->workflow_stage, array_column($workflow, 'stage'));
        
        if ($currentIndex === false || $currentIndex >= count($workflow) - 1) {
            return null;
        }

        return $workflow[$currentIndex + 1]['stage'] ?? null;
    }

    protected function buildApprovalChain(): void
    {
        $workflow = $this->leavePolicy->approval_workflow ?? [];
        $chain = [];

        foreach ($workflow as $index => $stage) {
            $approvers = $this->resolveApprovers($stage);
            
            foreach ($approvers as $sequence => $approver) {
                $chain[] = [
                    'stage' => $stage['stage'],
                    'sequence' => $sequence + 1,
                    'approver_id' => $approver['id'],
                    'approver_role' => $approver['role'] ?? null,
                    'is_mandatory' => $stage['is_mandatory'] ?? true,
                    'can_skip' => $stage['can_skip'] ?? false,
                    'conditions' => $stage['conditions'] ?? null,
                ];
            }
        }

        $this->approval_chain = $chain;
        $this->createApprovalsFromChain();
    }

    protected function resolveApprovers($stage): array
    {
        // This would be implemented based on your organizational structure
        // For now, return a default manager
        $employee = $this->user;
        $manager = $employee->manager ?? null;
        
        if ($manager) {
            return [['id' => $manager->id, 'role' => 'manager']];
        }

        return [];
    }

    protected function createApprovalsFromChain(): void
    {
        foreach ($this->approval_chain as $approvalData) {
            $this->approvals()->create($approvalData);
        }
    }

    protected function createNextApproval($stage): void
    {
        $nextApprovals = array_filter($this->approval_chain, fn($a) => $a['stage'] === $stage);
        
        foreach ($nextApprovals as $approvalData) {
            $this->approvals()->create($approvalData);
        }
    }

    protected function getCurrentApproval(): ?LeaveApproval
    {
        return $this->approvals()
            ->where('stage', $this->workflow_stage)
            ->where('status', 'pending')
            ->first();
    }

    protected function addToHistory($action, $userId, $comments = null): void
    {
        $history = $this->approval_history ?? [];
        $history[] = [
            'action' => $action,
            'user_id' => $userId,
            'stage' => $this->workflow_stage,
            'comments' => $comments,
            'timestamp' => now()->toISOString(),
        ];
        $this->approval_history = $history;
    }

    protected function notifyApprovers($action = 'pending', $reason = null): void
    {
        // Implementation for notifications
        // Would integrate with your notification system
    }

    protected function notifyUser($action, $reason = null): void
    {
        // Implementation for notifications
    }

    public function calculateTotalDays(): float
    {
        $start = \Carbon\Carbon::parse($this->start_date);
        $end = \Carbon\Carbon::parse($this->end_date);
        $days = $start->diffInDays($end) + 1;

        // Adjust for half days
        if ($this->is_half_day_start) {
            $days -= 0.5;
        }
        if ($this->is_half_day_end) {
            $days -= 0.5;
        }

        return max(0, $days);
    }

    public function overlapsWith(LeaveRequest $other): bool
    {
        return $this->start_date <= $other->end_date 
            && $this->end_date >= $other->start_date;
    }
}