<?php

namespace App\Http\Controllers\Api\V1\Admin\Leave;

use App\Http\Controllers\Controller;
use App\Models\LeaveDelegation;
use App\Models\LeaveType;
use App\Models\LeavePolicy;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Auth;
use Carbon\Carbon;

class LeaveDelegationController extends Controller
{
    public function index(Request $request)
    {
        $query = LeaveDelegation::query()
            ->with(['user', 'delegate', 'leaveType', 'leavePolicy', 'approvedBy'])
            ->where('status', '!=', 'revoked');

        if ($request->has('user_id')) {
            $query->where('user_id', $request->user_id);
        }

        if ($request->has('delegate_id')) {
            $query->where('delegate_id', $request->delegate_id);
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('company_id')) {
            $query->whereHas('user', fn($q) => $q->where('company_code', $request->company_id));
        }

        $delegations = $query->orderBy('created_at', 'desc')->paginate($request->get('per_page', 20));

        return response()->json([
            'status' => true,
            'data' => $delegations,
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'user_id' => 'required|exists:users,id',
            'delegate_id' => 'required|exists:users,id|different:user_id',
            'leave_type_id' => 'nullable|exists:leave_types,id',
            'leave_policy_id' => 'nullable|exists:leave_policies,id',
            'start_date' => 'required|date',
            'end_date' => 'required|date|after_or_equal:start_date',
            'reason' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        // Check for existing active delegation
        $existing = LeaveDelegation::where('user_id', $request->user_id)
            ->where('delegate_id', $request->delegate_id)
            ->where('status', 'active')
            ->where(function ($q) use ($request) {
                $q->whereBetween('start_date', [$request->start_date, $request->end_date])
                    ->orWhereBetween('end_date', [$request->start_date, $request->end_date])
                    ->orWhere(function ($q2) use ($request) {
                        $q2->where('start_date', '<=', $request->start_date)
                            ->where('end_date', '>=', $request->end_date);
                    });
            })
            ->exists();

        if ($existing) {
            return response()->json([
                'status' => false,
                'message' => 'An active delegation already exists for this period',
            ], 422);
        }

        $delegation = LeaveDelegation::create([
            'user_id' => $request->user_id,
            'delegate_id' => $request->delegate_id,
            'leave_type_id' => $request->leave_type_id,
            'leave_policy_id' => $request->leave_policy_id,
            'start_date' => $request->start_date,
            'end_date' => $request->end_date,
            'reason' => $request->reason,
            'status' => 'pending',
        ]);

        return response()->json([
            'status' => true,
            'message' => 'Leave delegation created successfully',
            'data' => $delegation->load(['user', 'delegate', 'leaveType', 'leavePolicy']),
        ], 201);
    }

    public function show(LeaveDelegation $leaveDelegation)
    {
        $leaveDelegation->load(['user', 'delegate', 'leaveType', 'leavePolicy', 'approvedBy']);
        return response()->json([
            'status' => true,
            'data' => $leaveDelegation,
        ]);
    }

    public function approve(Request $request, LeaveDelegation $leaveDelegation)
    {
        if ($leaveDelegation->status !== 'pending') {
            return response()->json([
                'status' => false,
                'message' => 'Only pending delegations can be approved',
            ], 422);
        }

        $leaveDelegation->approve(Auth::id());

        return response()->json([
            'status' => true,
            'message' => 'Leave delegation approved successfully',
            'data' => $leaveDelegation->fresh()->load(['user', 'delegate', 'leaveType', 'leavePolicy']),
        ]);
    }

    public function revoke(Request $request, LeaveDelegation $leaveDelegation)
    {
        if (!in_array($leaveDelegation->status, ['active', 'pending'])) {
            return response()->json([
                'status' => false,
                'message' => 'Only active or pending delegations can be revoked',
            ], 422);
        }

        $leaveDelegation->revoke(Auth::id());

        return response()->json([
            'status' => true,
            'message' => 'Leave delegation revoked successfully',
            'data' => $leaveDelegation->fresh()->load(['user', 'delegate']),
        ]);
    }

    public function getMyDelegations(Request $request)
    {
        $user = Auth::user();

        $delegations = LeaveDelegation::forUser($user->id)
            ->with(['delegate', 'leaveType', 'leavePolicy'])
            ->get();

        return response()->json([
            'status' => true,
            'data' => $delegations,
        ]);
    }

    public function getDelegatedToMe(Request $request)
    {
        $user = Auth::user();

        $delegations = LeaveDelegation::forDelegate($user->id)
            ->active()
            ->effective()
            ->with(['user', 'leaveType', 'leavePolicy'])
            ->get();

        return response()->json([
            'status' => true,
            'data' => $delegations,
        ]);
    }
}