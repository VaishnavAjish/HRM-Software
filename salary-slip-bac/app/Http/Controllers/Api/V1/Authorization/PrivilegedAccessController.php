<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Models\PrivilegedAccessRequest;
use App\Models\User;
use App\Services\Authorization\PrivilegedAccessService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class PrivilegedAccessController extends Controller
{
    public function __construct(
        private readonly PrivilegedAccessService $privilegedAccessService
    ) {}

    /**
     * Get all privileged access requests (for approvers).
     */
    public function index(Request $request)
    {
        $user = $request->user();

        // Only super admins and users with admin permission can view all requests
        if (!$user->isSuperAdmin() && !$this->canViewAllRequests($user)) {
            return response()->json(['status' => false, 'message' => 'Unauthorized'], 403);
        }

        $status = $request->query('status');
        $type = $request->query('type');

        $query = PrivilegedAccessRequest::with(['requester', 'targetUser', 'approver', 'revokedByUser']);

        if ($status) {
            $query->where('status', $status);
        }

        if ($type) {
            $query->where('type', $type);
        }

        $requests = $query->orderBy('created_at', 'desc')->paginate(20);

        return response()->json([
            'status' => true,
            'data' => $requests->items(),
            'pagination' => [
                'current_page' => $requests->currentPage(),
                'last_page' => $requests->lastPage(),
                'per_page' => $requests->perPage(),
                'total' => $requests->total(),
            ],
        ]);
    }

    /**
     * Get the authenticated user's privileged access requests.
     */
    public function myRequests(Request $request)
    {
        $user = $request->user();

        $requests = PrivilegedAccessRequest::where('requester_id', $user->id)
            ->with(['approver', 'revokedByUser'])
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return response()->json([
            'status' => true,
            'data' => $requests->items(),
            'pagination' => [
                'current_page' => $requests->currentPage(),
                'last_page' => $requests->lastPage(),
                'per_page' => $requests->perPage(),
                'total' => $requests->total(),
            ],
        ]);
    }

    /**
     * Get active privileged access for the authenticated user.
     */
    public function active(Request $request)
    {
        $user = $request->user();
        $activeAccess = $this->privilegedAccessService->getActiveAccess($user);

        return response()->json([
            'status' => true,
            'data' => $activeAccess->map(fn($r) => [
                'id' => $r->id,
                'type' => $r->type,
                'reason' => $r->reason,
                'requested_role' => $r->requested_role,
                'requested_permissions' => $r->requested_permissions,
                'scope_type' => $r->scope_type,
                'scope_id' => $r->scope_id,
                'approved_at' => $r->approved_at?->toISOString(),
                'activated_at' => $r->activated_at?->toISOString(),
                'expires_at' => $r->expires_at?->toISOString(),
                'approver' => $r->approver ? [
                    'id' => $r->approver->id,
                    'name' => $r->approver->name,
                ] : null,
            ]),
        ]);
    }

    /**
     * Request break-glass access.
     */
    public function requestBreakGlass(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'reason' => 'required|string|max:1000',
            'requested_role' => 'required|string|max:100',
            'scope_type' => 'nullable|string|in:tenant,company,legal_entity,department,global',
            'scope_id' => 'nullable|integer',
            'metadata' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $user = $request->user();

        try {
            $request = $this->privilegedAccessService->requestBreakGlass(
                $user,
                $request->input('reason'),
                $request->input('requested_role'),
                $request->input('scope_type'),
                $request->input('scope_id'),
                $request->input('metadata')
            );

            return response()->json([
                'status' => true,
                'message' => 'Break-glass access requested. Awaiting approval.',
                'data' => [
                    'id' => $request->id,
                    'status' => $request->status,
                    'expires_at' => $request->expires_at?->toISOString(),
                ],
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], 400);
        }
    }

    /**
     * Request JIT access.
     */
    public function requestJit(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'reason' => 'required|string|max:1000',
            'requested_permissions' => 'required|array|min:1',
            'requested_permissions.*' => 'string|max:190',
            'scope_type' => 'nullable|string|in:tenant,company,legal_entity,department,global',
            'scope_id' => 'nullable|integer',
            'duration_hours' => 'nullable|integer|min:1|max:24',
            'metadata' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $user = $request->user();

        try {
            $request = $this->privilegedAccessService->requestJitAccess(
                $user,
                $request->input('reason'),
                $request->input('requested_permissions'),
                $request->input('scope_type'),
                $request->input('scope_id'),
                $request->input('duration_hours', 2),
                $request->input('metadata')
            );

            return response()->json([
                'status' => true,
                'message' => 'JIT access requested. Awaiting approval.',
                'data' => [
                    'id' => $request->id,
                    'status' => $request->status,
                    'expires_at' => $request->expires_at?->toISOString(),
                ],
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], 400);
        }
    }

    /**
     * Request impersonation.
     */
    public function requestImpersonation(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'target_user_id' => 'required|integer|exists:users,id',
            'reason' => 'required|string|max:1000',
            'scope_type' => 'nullable|string|in:tenant,company,legal_entity,department,global',
            'scope_id' => 'nullable|integer',
            'duration_hours' => 'nullable|integer|min:1|max:8',
            'metadata' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $user = $request->user();
        $targetUser = User::find($request->input('target_user_id'));

        if (!$targetUser) {
            return response()->json(['status' => false, 'message' => 'Target user not found'], 404);
        }

        try {
            $request = $this->privilegedAccessService->requestImpersonation(
                $user,
                $targetUser,
                $request->input('reason'),
                $request->input('scope_type'),
                $request->input('scope_id'),
                $request->input('duration_hours', 1),
                $request->input('metadata')
            );

            return response()->json([
                'status' => true,
                'message' => 'Impersonation requested. Awaiting approval.',
                'data' => [
                    'id' => $request->id,
                    'status' => $request->status,
                    'expires_at' => $request->expires_at?->toISOString(),
                ],
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], 400);
        }
    }

    /**
     * Approve a privileged access request.
     */
    public function approve(Request $request, int $requestId)
    {
        $user = $request->user();
        $privilegedRequest = PrivilegedAccessRequest::with(['requester', 'targetUser'])->find($requestId);

        if (!$privilegedRequest) {
            return response()->json(['status' => false, 'message' => 'Request not found'], 404);
        }

        try {
            $this->privilegedAccessService->approveRequest($privilegedRequest, $user);

            return response()->json([
                'status' => true,
                'message' => 'Request approved successfully',
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], 400);
        }
    }

    /**
     * Reject a privileged access request.
     */
    public function reject(Request $request, int $requestId)
    {
        $validator = Validator::make($request->all(), [
            'reason' => 'required|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $user = $request->user();
        $privilegedRequest = PrivilegedAccessRequest::find($requestId);

        if (!$privilegedRequest) {
            return response()->json(['status' => false, 'message' => 'Request not found'], 404);
        }

        try {
            $this->privilegedAccessService->rejectRequest($privilegedRequest, $user, $request->input('reason'));

            return response()->json([
                'status' => true,
                'message' => 'Request rejected',
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], 400);
        }
    }

    /**
     * Activate approved access.
     */
    public function activate(Request $request, int $requestId)
    {
        $user = $request->user();
        $privilegedRequest = PrivilegedAccessRequest::find($requestId);

        if (!$privilegedRequest) {
            return response()->json(['status' => false, 'message' => 'Request not found'], 404);
        }

        // Only the requester can activate their own approved request
        if ($privilegedRequest->requester_id !== $user->id) {
            return response()->json(['status' => false, 'message' => 'Unauthorized'], 403);
        }

        try {
            $this->privilegedAccessService->activateAccess($privilegedRequest);

            return response()->json([
                'status' => true,
                'message' => 'Access activated successfully',
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], 400);
        }
    }

    /**
     * Revoke active access.
     */
    public function revoke(Request $request, int $requestId)
    {
        $validator = Validator::make($request->all(), [
            'reason' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $user = $request->user();
        $privilegedRequest = PrivilegedAccessRequest::find($requestId);

        if (!$privilegedRequest) {
            return response()->json(['status' => false, 'message' => 'Request not found'], 404);
        }

        // Requester or super admin can revoke
        if ($privilegedRequest->requester_id !== $user->id && !$user->isSuperAdmin()) {
            return response()->json(['status' => false, 'message' => 'Unauthorized'], 403);
        }

        try {
            $reason = $request->input('reason', 'revoked_by_user');
            $this->privilegedAccessService->revokeAccess($privilegedRequest, $user, $reason);

            return response()->json([
                'status' => true,
                'message' => 'Access revoked successfully',
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], 400);
        }
    }

    /**
     * Get impersonation sessions for a target user.
     */
    public function impersonationSessions(Request $request, int $targetUserId)
    {
        $user = $request->user();

        // Only super admins and the target user can view impersonation sessions
        if (!$user->isSuperAdmin() && $user->id !== $targetUserId) {
            return response()->json(['status' => false, 'message' => 'Unauthorized'], 403);
        }

        $targetUser = User::find($targetUserId);

        if (!$targetUser) {
            return response()->json(['status' => false, 'message' => 'Target user not found'], 404);
        }

        $sessions = $this->privilegedAccessService->getImpersonationSessions($targetUser);

        return response()->json([
            'status' => true,
            'data' => $sessions->map(fn($r) => [
                'id' => $r->id,
                'requester' => [
                    'id' => $r->requester->id,
                    'name' => $r->requester->name,
                    'email' => $r->requester->email,
                ],
                'reason' => $r->reason,
                'status' => $r->status,
                'approved_at' => $r->approved_at?->toISOString(),
                'activated_at' => $r->activated_at?->toISOString(),
                'expires_at' => $r->expires_at?->toISOString(),
                'revoked_at' => $r->revoked_at?->toISOString(),
                'revoke_reason' => $r->revoke_reason,
                'approver' => $r->approver ? [
                    'id' => $r->approver->id,
                    'name' => $r->approver->name,
                ] : null,
            ]),
        ]);
    }

    /**
     * Get privileged access statistics.
     */
    public function stats(Request $request)
    {
        $user = $request->user();

        if (!$user->isSuperAdmin() && !$this->canViewAllRequests($user)) {
            return response()->json(['status' => false, 'message' => 'Unauthorized'], 403);
        }

        $stats = $this->privilegedAccessService->getStats();

        return response()->json([
            'status' => true,
            'data' => $stats,
        ]);
    }

    /**
     * Check if user can view all privileged access requests.
     */
    private function canViewAllRequests(User $user): bool
    {
        // Check if user has admin permission
        return $user->role === 'admin' || $user->isSuperAdmin();
    }
}