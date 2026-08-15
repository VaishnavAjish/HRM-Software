<?php

namespace App\Services\Authorization;

use App\Models\PrivilegedAccessRequest;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Privileged Access Service — Domain 01.13 Privileged Access.
 *
 * Centralized service for break-glass, JIT access, and impersonation.
 * All privileged access must be requested, approved, and audited.
 */
class PrivilegedAccessService
{
    /**
     * Request break-glass access.
     */
    public function requestBreakGlass(
        User $requester,
        string $reason,
        string $requestedRole,
        ?string $scopeType = null,
        ?int $scopeId = null,
        ?array $metadata = null
    ): PrivilegedAccessRequest {
        return DB::transaction(function () use ($requester, $reason, $requestedRole, $scopeType, $scopeId, $metadata) {
            // Check if requester already has an active break-glass request
            $existing = PrivilegedAccessRequest::where('requester_id', $requester->id)
                ->where('type', 'break_glass')
                ->whereIn('status', ['pending', 'approved', 'active'])
                ->first();

            if ($existing) {
                throw new \RuntimeException('You already have an active break-glass request');
            }

            // Validate the requested role exists
            $role = Role::where('code', $requestedRole)->orWhere('name', $requestedRole)->first();
            if (!$role) {
                throw new \RuntimeException('Requested role not found');
            }

            return PrivilegedAccessRequest::create([
                'requester_id' => $requester->id,
                'type' => 'break_glass',
                'reason' => $reason,
                'requested_role' => $requestedRole,
                'scope_type' => $scopeType,
                'scope_id' => $scopeId,
                'status' => 'pending',
                'expires_at' => now()->addHours(4), // Break-glass expires in 4 hours
                'metadata' => $metadata,
            ]);
        });
    }

    /**
     * Request JIT (Just-in-Time) access.
     */
    public function requestJitAccess(
        User $requester,
        string $reason,
        array $requestedPermissions,
        ?string $scopeType = null,
        ?int $scopeId = null,
        int $durationHours = 2,
        ?array $metadata = null
    ): PrivilegedAccessRequest {
        return DB::transaction(function () use ($requester, $reason, $requestedPermissions, $scopeType, $scopeId, $durationHours, $metadata) {
            return PrivilegedAccessRequest::create([
                'requester_id' => $requester->id,
                'type' => 'jit',
                'reason' => $reason,
                'requested_permissions' => $requestedPermissions,
                'scope_type' => $scopeType,
                'scope_id' => $scopeId,
                'status' => 'pending',
                'expires_at' => now()->addHours($durationHours),
                'metadata' => $metadata,
            ]);
        });
    }

    /**
     * Request impersonation access.
     */
    public function requestImpersonation(
        User $requester,
        User $targetUser,
        string $reason,
        ?string $scopeType = null,
        ?int $scopeId = null,
        int $durationHours = 1,
        ?array $metadata = null
    ): PrivilegedAccessRequest {
        return DB::transaction(function () use ($requester, $targetUser, $reason, $scopeType, $scopeId, $durationHours, $metadata) {
            // Prevent self-impersonation
            if ($requester->id === $targetUser->id) {
                throw new \RuntimeException('Cannot impersonate yourself');
            }

            // Prevent impersonating protected accounts unless super admin
            if ($targetUser->isProtected() && !$requester->isSuperAdmin()) {
                throw new \RuntimeException('Cannot impersonate a protected account');
            }

            return PrivilegedAccessRequest::create([
                'requester_id' => $requester->id,
                'target_user_id' => $targetUser->id,
                'type' => 'impersonation',
                'reason' => $reason,
                'scope_type' => $scopeType,
                'scope_id' => $scopeId,
                'status' => 'pending',
                'expires_at' => now()->addHours($durationHours),
                'metadata' => array_merge($metadata ?? [], [
                    'target_user_name' => $targetUser->name,
                    'target_user_email' => $targetUser->email,
                ]),
            ]);
        });
    }

    /**
     * Approve a privileged access request.
     */
    public function approveRequest(PrivilegedAccessRequest $request, User $approver): void
    {
        if (!$request->isPending()) {
            throw new \RuntimeException('Request is not pending approval');
        }

        // Check if approver has permission to approve
        if (!$this->canApprove($approver, $request)) {
            throw new \RuntimeException('You do not have permission to approve this request');
        }

        $request->approve($approver);
    }

    /**
     * Reject a privileged access request.
     */
    public function rejectRequest(PrivilegedAccessRequest $request, User $approver, string $reason): void
    {
        if (!$request->isPending()) {
            throw new \RuntimeException('Request is not pending approval');
        }

        $request->status = 'rejected';
        $request->approved_by = $approver->id;
        $request->approved_at = now();
        $request->metadata = array_merge($request->metadata ?? [], [
            'rejection_reason' => $reason,
        ]);
        $request->save();
    }

    /**
     * Activate approved access.
     */
    public function activateAccess(PrivilegedAccessRequest $request): void
    {
        if (!$request->isApproved()) {
            throw new \RuntimeException('Request must be approved before activation');
        }

        $request->activate();
    }

    /**
     * Revoke active access.
     */
    public function revokeAccess(PrivilegedAccessRequest $request, User $revokedBy, string $reason = 'revoked'): void
    {
        if (!$request->isActive()) {
            throw new \RuntimeException('Access is not active');
        }

        $request->revoke($revokedBy, $reason);
    }

    /**
     * Expire old active access (run via scheduled job).
     */
    public function expireOldAccess(): int
    {
        return PrivilegedAccessRequest::where('status', 'active')
            ->where('expires_at', '<=', now())
            ->update(['status' => 'expired']);
    }

    /**
     * Get pending requests for a user (as approver).
     */
    public function getPendingRequests(User $approver): \Illuminate\Database\Eloquent\Collection
    {
        // In a real implementation, this would check the approver's permissions
        // For now, return all pending requests
        return PrivilegedAccessRequest::pending()
            ->with(['requester', 'targetUser'])
            ->orderBy('created_at', 'asc')
            ->get();
    }

    /**
     * Get active privileged access for a user.
     */
    public function getActiveAccess(User $user): \Illuminate\Database\Eloquent\Collection
    {
        return PrivilegedAccessRequest::where('requester_id', $user->id)
            ->active()
            ->with(['approver'])
            ->get();
    }

    /**
     * Get impersonation sessions for a target user.
     */
    public function getImpersonationSessions(User $targetUser): \Illuminate\Database\Eloquent\Collection
    {
        return PrivilegedAccessRequest::where('target_user_id', $targetUser->id)
            ->where('type', 'impersonation')
            ->whereIn('status', ['active', 'expired', 'revoked'])
            ->with(['requester', 'approver'])
            ->orderBy('created_at', 'desc')
            ->get();
    }

    /**
     * Check if a user can approve a request.
     */
    private function canApprove(User $approver, PrivilegedAccessRequest $request): bool
    {
        // Super admins can approve anything
        if ($approver->isSuperAdmin()) {
            return true;
        }

        // For break-glass, only super admins can approve
        if ($request->type === 'break_glass') {
            return $approver->isSuperAdmin();
        }

        // For JIT, check if approver has the requested permissions
        if ($request->type === 'jit') {
            // This would check if the approver has the permissions being requested
            // For now, allow super admins and users with admin role
            return $approver->isSuperAdmin() || $approver->role === 'admin';
        }

        // For impersonation, only super admins can approve
        if ($request->type === 'impersonation') {
            return $approver->isSuperAdmin();
        }

        return false;
    }

    /**
     * Get statistics for privileged access.
     */
    public function getStats(): array
    {
        return [
            'pending' => PrivilegedAccessRequest::pending()->count(),
            'active' => PrivilegedAccessRequest::active()->count(),
            'expired_today' => PrivilegedAccessRequest::where('status', 'expired')
                ->whereDate('updated_at', today())
                ->count(),
            'revoked_today' => PrivilegedAccessRequest::where('status', 'revoked')
                ->whereDate('revoked_at', today())
                ->count(),
            'by_type' => [
                'break_glass' => PrivilegedAccessRequest::where('type', 'break_glass')->count(),
                'jit' => PrivilegedAccessRequest::where('type', 'jit')->count(),
                'impersonation' => PrivilegedAccessRequest::where('type', 'impersonation')->count(),
            ],
        ];
    }
}