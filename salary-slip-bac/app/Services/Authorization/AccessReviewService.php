<?php

namespace App\Services\Authorization;

use App\Models\AccessReview;
use App\Models\AccessReviewItem;
use App\Models\Role;
use App\Models\User;
use App\Models\UserSession;
use Illuminate\Support\Facades\DB;

/**
 * Access Review Service — Domain 01.20 Access Review.
 *
 * Centralized service for managing access reviews.
 * Supports periodic, manager, HR, application owner, and privileged access reviews.
 */
class AccessReviewService
{
    /**
     * Create a new access review.
     */
    public function createReview(
        string $name,
        string $type,
        User $creator,
        array $options = []
    ): AccessReview {
        return DB::transaction(function () use ($name, $type, $creator, $options) {
            $review = AccessReview::create([
                'name' => $name,
                'description' => $options['description'] ?? null,
                'type' => $type,
                'scope_type' => $options['scope_type'] ?? null,
                'scope_id' => $options['scope_id'] ?? null,
                'status' => 'draft',
                'reviewer_type' => $options['reviewer_type'] ?? null,
                'reviewer_id' => $options['reviewer_id'] ?? null,
                'frequency' => $options['frequency'] ?? null,
                'start_date' => $options['start_date'] ?? now(),
                'end_date' => $options['end_date'] ?? now()->addDays(30),
                'created_by' => $creator->id,
                'metadata' => $options['metadata'] ?? [],
            ]);

            // Populate review items based on scope
            $this->populateReviewItems($review);

            return $review;
        });
    }

    /**
     * Populate review items based on review scope.
     */
    private function populateReviewItems(AccessReview $review): void
    {
        $query = User::where('is_deleted', 0);

        // Apply scope filters
        if ($review->scope_type && $review->scope_id) {
            switch ($review->scope_type) {
                case 'company':
                    $query->where('company_code', $review->scope_id);
                    break;
                case 'department':
                    $query->where('department', $review->scope_id);
                    break;
                case 'role':
                    $query->where('role', $review->scope_id);
                    break;
                case 'user':
                    $query->where('id', $review->scope_id);
                    break;
            }
        }

        $users = $query->get();

        foreach ($users as $user) {
            // Get user's roles
            $roles = $user->roles()->get();

            foreach ($roles as $role) {
                AccessReviewItem::create([
                    'review_id' => $review->id,
                    'user_id' => $user->id,
                    'role_id' => $role->id,
                    'scope_type' => $review->scope_type,
                    'scope_id' => $review->scope_id,
                    'assignment_reason' => $role->pivot->assignment_reason ?? 'Role assigned',
                    'last_used_at' => $this->getLastRoleUsage($user, $role),
                ]);
            }

            // Also review direct permissions
            $permissions = $user->permissions()->get();
            foreach ($permissions as $permission) {
                AccessReviewItem::create([
                    'review_id' => $review->id,
                    'user_id' => $user->id,
                    'permission_id' => $permission->id,
                    'scope_type' => $review->scope_type,
                    'scope_id' => $review->scope_id,
                    'assignment_reason' => 'Direct permission',
                    'last_used_at' => $this->getLastPermissionUsage($user, $permission),
                ]);
            }
        }
    }

    /**
     * Get last usage timestamp for a role.
     */
    private function getLastRoleUsage(User $user, Role $role): ?string
    {
        // This would check audit logs for when the role's permissions were last used
        // For now, return null
        return null;
    }

    /**
     * Get last usage timestamp for a permission.
     */
    private function getLastPermissionUsage(User $user, $permission): ?string
    {
        // This would check audit logs for when the permission was last used
        // For now, return null
        return null;
    }

    /**
     * Start a review (change status to in_progress).
     */
    public function startReview(AccessReview $review): void
    {
        if ($review->status !== 'draft') {
            throw new \RuntimeException('Review must be in draft status to start');
        }

        $review->status = 'in_progress';
        $review->save();
    }

    /**
     * Submit a decision for a review item.
     */
    public function submitDecision(
        AccessReviewItem $item,
        User $decider,
        string $decision,
        string $reason,
        array $modifications = []
    ): void {
        if ($item->isDecided()) {
            throw new \RuntimeException('Item already decided');
        }

        if (!in_array($decision, ['approve', 'revoke', 'modify', 'extend'])) {
            throw new \RuntimeException('Invalid decision');
        }

        $item->decision = $decision;
        $item->decision_reason = $reason;
        $item->decided_by = $decider->id;
        $item->decided_at = now();

        if ($decision === 'modify') {
            $item->new_role_id = $modifications['new_role_id'] ?? null;
            $item->new_permissions = $modifications['new_permissions'] ?? null;
            $item->new_scope_type = $modifications['new_scope_type'] ?? null;
            $item->new_scope_id = $modifications['new_scope_id'] ?? null;
        }

        if ($decision === 'extend') {
            $item->expiry_date = $modifications['expiry_date'] ?? null;
        }

        $item->save();

        // Apply the decision immediately if it's a revoke
        if ($decision === 'revoke') {
            $this->applyRevoke($item);
        }
    }

    /**
     * Apply a revoke decision.
     */
    private function applyRevoke(AccessReviewItem $item): void
    {
        if ($item->role_id) {
            $item->user->roles()->detach($item->role_id);
        }

        if ($item->permission_id) {
            $item->user->permissions()->detach($item->permission_id);
        }
    }

    /**
     * Complete a review.
     */
    public function completeReview(AccessReview $review): void
    {
        if ($review->status !== 'in_progress') {
            throw new \RuntimeException('Review must be in progress to complete');
        }

        $progress = $review->getProgress();

        if ($progress['pending'] > 0) {
            throw new \RuntimeException("Review has {$progress['pending']} pending items");
        }

        $review->status = 'completed';
        $review->completed_at = now();
        $review->save();
    }

    /**
     * Cancel a review.
     */
    public function cancelReview(AccessReview $review): void
    {
        if ($review->status === 'completed') {
            throw new \RuntimeException('Cannot cancel a completed review');
        }

        $review->status = 'cancelled';
        $review->save();
    }

    /**
     * Get reviews for a reviewer.
     */
    public function getReviewsForReviewer(User $reviewer): \Illuminate\Database\Eloquent\Collection
    {
        return AccessReview::where('status', 'in_progress')
            ->where(function ($q) use ($reviewer) {
                $q->where('reviewer_id', $reviewer->id)
                    ->orWhere(function ($q2) use ($reviewer) {
                        $q2->where('reviewer_type', 'manager')
                            ->whereHas('items', function ($q3) use ($reviewer) {
                                $q3->whereHas('user', function ($q4) use ($reviewer) {
                                    $q4->where('manager_name', $reviewer->name);
                                });
                            });
                    });
            })
            ->with(['items' => function ($q) {
                $q->whereNull('decision')->limit(5);
            }])
            ->orderBy('end_date', 'asc')
            ->get();
    }

    /**
     * Get review statistics.
     */
    public function getReviewStats(AccessReview $review): array
    {
        return $review->getProgress();
    }

    /**
     * Get overdue reviews.
     */
    public function getOverdueReviews(): \Illuminate\Database\Eloquent\Collection
    {
        return AccessReview::overdue()->with(['creator'])->get();
    }

    /**
     * Create a periodic review (run via scheduled job).
     */
    public function createPeriodicReview(string $frequency): AccessReview
    {
        $superAdmin = User::where('role', 0)->first();

        if (!$superAdmin) {
            throw new \RuntimeException('No super admin found to create review');
        }

        return $this->createReview(
            "{$frequency} Access Review - " . now()->format('Y-m-d'),
            'periodic',
            $superAdmin,
            [
                'frequency' => $frequency,
                'reviewer_type' => 'manager',
                'start_date' => now(),
                'end_date' => now()->addDays(30),
            ]
        );
    }
}