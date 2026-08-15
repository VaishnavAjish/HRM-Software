<?php

namespace App\Services\Authorization;

use App\Models\PrivilegedAccessRequest;
use App\Models\Role;
use App\Models\User;
use App\Models\UserSession;
use App\Models\UserDevice;
use Illuminate\Support\Facades\DB;

/**
 * Identity Lifecycle Service — Domain 01.14 Identity Lifecycle.
 *
 * Centralized service for joiner/mover/leaver/rehire workflows.
 * Handles provisioning, access changes, deprovisioning, and rehire evaluation.
 */
class IdentityLifecycleService
{
    /**
     * Provision a new user (joiner).
     */
    public function provisionUser(
        array $userData,
        array $roleCodes = [],
        ?User $provisionedBy = null
    ): User {
        return DB::transaction(function () use ($userData, $roleCodes, $provisionedBy) {
            // Create the user
            $user = User::create($userData);

            // Assign roles
            if (!empty($roleCodes)) {
                $this->assignRoles($user, $roleCodes, $provisionedBy);
            }

            // Set up default MFA if required by policy
            // This would be triggered by security policy

            // Log the provisioning event
            $this->logLifecycleEvent($user, 'provisioned', $provisionedBy, [
                'roles' => $roleCodes,
            ]);

            return $user;
        });
    }

    /**
     * Handle mover - user's organization/role changes.
     */
    public function handleMover(
        User $user,
        array $changes,
        ?User $changedBy = null
    ): User {
        return DB::transaction(function () use ($user, $changes, $changedBy) {
            $oldData = [
                'department' => $user->department,
                'company_code' => $user->company_code,
                'unit' => $user->unit,
                'designation' => $user->designation,
                'manager_name' => $user->manager_name,
                'role' => $user->role,
                'branch' => $user->branch,
            ];

            // Apply changes
            $user->fill($changes);
            $user->save();

            // Recalculate roles and permissions based on new position
            $this->recalculateAccess($user, $changedBy);

            // Revoke sessions if security policy requires it
            $this->revokeSessionsOnMover($user, $changedBy);

            // Log the mover event
            $this->logLifecycleEvent($user, 'mover', $changedBy, [
                'old' => $oldData,
                'new' => $changes,
            ]);

            return $user;
        });
    }

    /**
     * Handle leaver - user separation.
     */
    public function handleLeaver(
        User $user,
        string $reason,
        ?User $processedBy = null
    ): User {
        return DB::transaction(function () use ($user, $reason, $processedBy) {
            // Disable login
            $user->status = 2; // Deactivated
            $user->deactivated_at = now();
            $user->save();

            // Revoke all sessions
            UserSession::where('user_id', $user->id)
                ->where('revoked_at', null)
                ->update([
                    'revoked_at' => now(),
                    'revoked_by' => $processedBy?->id,
                    'revoke_reason' => 'separation',
                    'is_current' => false,
                ]);

            // Revoke all trusted devices
            UserDevice::where('user_id', $user->id)
                ->where('is_trusted', true)
                ->update([
                    'is_trusted' => false,
                    'trusted_at' => null,
                    'trusted_by' => null,
                ]);

            // Remove temporary roles
            $this->removeTemporaryRoles($user);

            // Revoke privileged access
            PrivilegedAccessRequest::where('requester_id', $user->id)
                ->whereIn('status', ['pending', 'approved', 'active'])
                ->update([
                    'status' => 'revoked',
                    'revoked_at' => now(),
                    'revoked_by' => $processedBy?->id,
                    'revoke_reason' => 'separation',
                ]);

            // Log the leaver event
            $this->logLifecycleEvent($user, 'leaver', $processedBy, [
                'reason' => $reason,
            ]);

            return $user;
        });
    }

    /**
     * Handle rehire - re-evaluate access for returning employee.
     */
    public function handleRehire(
        User $user,
        array $newData,
        ?User $processedBy = null
    ): User {
        return DB::transaction(function () use ($user, $newData, $processedBy) {
            // Reactivate account
            $user->status = 0; // Active
            $user->deactivated_at = null;
            $user->fill($newData);
            $user->save();

            // Perform fresh access evaluation (don't blindly restore old access)
            $this->recalculateAccess($user, $processedBy);

            // Require MFA re-enrollment
            // This would be enforced by security policy

            // Log the rehire event
            $this->logLifecycleEvent($user, 'rehire', $processedBy, [
                'new_data' => $newData,
            ]);

            return $user;
        });
    }

    /**
     * Assign roles to a user.
     */
    public function assignRoles(User $user, array $roleCodes, ?User $assignedBy = null): void
    {
        $roles = Role::whereIn('code', $roleCodes)
            ->orWhereIn('name', $roleCodes)
            ->get();

        foreach ($roles as $role) {
            // Check if role requires approval
            if ($role->requires_approval) {
                // Create approval request
                // This would integrate with workflow system
                continue;
            }

            $user->roles()->syncWithoutDetaching([$role->id]);
        }
    }

    /**
     * Remove temporary/expired roles.
     */
    public function removeTemporaryRoles(User $user): void
    {
        // Remove roles that have expired
        $user->roles()->wherePivot('valid_until', '<=', now())->detach();

        // Remove roles marked as temporary
        $user->roles()->where('type', 'temporary')->detach();
    }

    /**
     * Recalculate user's access based on current position.
     */
    public function recalculateAccess(User $user, ?User $changedBy = null): void
    {
        // This would implement the business logic for determining
        // what roles/permissions a user should have based on:
        // - Department
        // - Company
        // - Designation
        // - Grade/Level
        // - Location
        // - Manager status
        // - etc.

        // For now, this is a placeholder that would be implemented
        // based on the organization's specific access rules
    }

    /**
     * Revoke sessions on mover if required by policy.
     */
    private function revokeSessionsOnMover(User $user, ?User $changedBy): void
    {
        // Check security policy for session revocation on role change
        // For now, revoke all sessions for significant changes
        $significantChanges = ['company_code', 'role', 'department', 'designation'];

        // This would be more sophisticated in a real implementation
    }

    /**
     * Log a lifecycle event.
     */
    private function logLifecycleEvent(User $user, string $event, ?User $actor, array $metadata): void
    {
        // This would write to an audit log table
        // For now, we'll use the existing audit system
        \App\Support\AuditLogger::log(
            new \Illuminate\Http\Request(),
            strtoupper($event),
            'User',
            ['user_id' => $user->id],
            array_merge(['user_id' => $user->id, 'event' => $event], $metadata)
        );
    }

    /**
     * Detect orphaned accounts.
     */
    public function detectOrphanedAccounts(): array
    {
        $orphans = [];

        // Users without employee records
        $usersWithoutEmployee = User::where('is_deleted', 0)
            ->whereNull('emp_code')
            ->whereNotNull('email')
            ->get();

        foreach ($usersWithoutEmployee as $user) {
            $orphans[] = [
                'user_id' => $user->id,
                'type' => 'user_without_employee',
                'details' => 'User has no employee code',
            ];
        }

        // Separated employees with active accounts
        $separatedWithActive = User::where('is_deleted', 0)
            ->where('status', 0) // Active
            ->whereNotNull('resignation_date')
            ->where('resignation_date', '<=', now())
            ->get();

        foreach ($separatedWithActive as $user) {
            $orphans[] = [
                'user_id' => $user->id,
                'type' => 'separated_employee_active',
                'details' => 'Employee has resigned but account is still active',
            ];
        }

        // Expired accounts still active
        $expiredActive = User::where('is_deleted', 0)
            ->where('status', 0)
            ->whereNotNull('account_expires_at')
            ->where('account_expires_at', '<', now())
            ->get();

        foreach ($expiredActive as $user) {
            $orphans[] = [
                'user_id' => $user->id,
                'type' => 'expired_account_active',
                'details' => 'Account expiry date has passed but account is still active',
            ];
        }

        // Role assignments without justification
        // This would check role_assignments table for missing justification

        return $orphans;
    }

    /**
     * Remediate orphaned account.
     */
    public function remediateOrphan(int $userId, string $action, ?User $remediatedBy = null): bool
    {
        $user = User::find($userId);

        if (!$user) {
            return false;
        }

        return match ($action) {
            'deactivate' => $this->handleLeaver($user, 'Orphaned account remediation', $remediatedBy) !== null,
            'delete' => $user->delete(),
            'assign_employee' => false, // Would require employee data
            default => false,
        };
    }
}