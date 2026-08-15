<?php

namespace App\Http\Controllers\Api\V1\Admin\Leave;

use App\Http\Controllers\Controller;
use App\Models\LeaveRequest;
use App\Models\LeaveApproval;
use App\Models\LeaveBalance;
use App\Models\LeaveType;
use App\Models\LeavePolicy;
use App\Models\LeaveDelegation;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Carbon\Carbon;

class LeaveRequestController extends Controller
{
    public function index(Request $request)
    {
        $query = LeaveRequest::query()
            ->with(['user', 'leaveType', 'leavePolicy', 'leaveBalance', 'approvals.approver'])
            ->where('status', '!=', 'draft');

        if ($request->has('user_id')) {
            $query->where('user_id', $request->user_id);
        }

        if ($request->has('leave_type_id')) {
            $query->where('leave_type_id', $request->leave_type_id);
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('start_date') && $request->has('end_date')) {
            $query->forDateRange($request->start_date, $request->end_date);
        }

        if ($request->has('company_id')) {
            $query->whereHas('user', fn($q) => $q->where('company_code', $request->company_id));
        }

        if ($request->has('is_emergency')) {
            $query->where('is_emergency', $request->boolean('is_emergency'));
        }

        $requests = $query->orderBy('created_at', 'desc')->paginate($request->get('per_page', 20));

        return response()->json([
            'status' => true,
            'data' => $requests,
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'user_id' => 'required|exists:users,id',
            'leave_type_id' => 'required|exists:leave_types,id',
            'leave_policy_id' => 'nullable|exists:leave_policies,id',
            'start_date' => 'required|date',
            'end_date' => 'required|date|after_or_equal:start_date',
            'is_half_day_start' => 'boolean',
            'is_half_day_end' => 'boolean',
            'half_day_start_time' => 'nullable|date_format:H:i',
            'half_day_end_time' => 'nullable|date_format:H:i',
            'reason' => 'required|string|max:1000',
            'supporting_documents' => 'nullable|array',
            'contact_during_leave' => 'nullable|string|max:255',
            'emergency_contact' => 'nullable|string|max:255',
            'handover_notes' => 'nullable|string|max:2000',
            'is_emergency' => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        $user = User::find($request->user_id);
        $leaveType = LeaveType::find($request->leave_type_id);

        // Check if leave type is applicable to user
        if (!$leaveType->isApplicableTo($user)) {
            return response()->json([
                'status' => false,
                'message' => 'This leave type is not applicable to the selected employee',
            ], 422);
        }

        // Determine leave policy
        $leavePolicy = null;
        if ($request->leave_policy_id) {
            $leavePolicy = LeavePolicy::find($request->leave_policy_id);
        } else {
            $policies = LeavePolicy::getApplicablePolicies([
                'company_id' => $user->company_id,
                'legal_entity_id' => $user->legal_entity_id ?? null,
                'country_id' => $user->country_id ?? null,
                'location_id' => $user->location_id ?? null,
                'department_id' => $user->department_id ?? null,
                'grade_id' => $user->grade_id ?? null,
                'worker_type_id' => $user->worker_type_id ?? null,
                'date' => $request->start_date,
            ]);

            $leavePolicy = $policies->first();
        }

        if (!$leavePolicy) {
            return response()->json([
                'status' => false,
                'message' => 'No applicable leave policy found for this employee',
            ], 422);
        }

        // Check for overlapping requests
        $overlapping = LeaveRequest::overlapping(
            $user->id,
            $request->start_date,
            $request->end_date
        )->exists();

        if ($overlapping) {
            return response()->json([
                'status' => false,
                'message' => 'Employee already has a leave request overlapping with these dates',
            ], 422);
        }

        // Calculate total days
        $start = Carbon::parse($request->start_date);
        $end = Carbon::parse($request->end_date);
        $totalDays = $start->diffInDays($end) + 1;

        if ($request->boolean('is_half_day_start')) {
            $totalDays -= 0.5;
        }
        if ($request->boolean('is_half_day_end')) {
            $totalDays -= 0.5;
        }

        // Check leave balance
        $leaveBalance = LeaveBalance::where('user_id', $user->id)
            ->where('leave_type_id', $leaveType->id)
            ->where('leave_year', $start->format('Y'))
            ->where('is_frozen', false)
            ->first();

        if (!$leaveBalance) {
            // Create balance if doesn't exist
            $leaveYearStart = $leavePolicy->getEffectiveLeaveYearStart($start);
            $leaveYearEnd = $leavePolicy->getEffectiveLeaveYearEnd($start);
            
            $policyType = $leavePolicy->policyTypes()
                ->where('leave_type_id', $leaveType->id)
                ->where('is_active', true)
                ->first();

            $leaveBalance = LeaveBalance::create([
                'user_id' => $user->id,
                'leave_type_id' => $leaveType->id,
                'leave_policy_id' => $leavePolicy->id,
                'leave_year' => $start->format('Y'),
                'leave_year_start' => $leaveYearStart,
                'leave_year_end' => $leaveYearEnd,
                'opening_balance' => 0,
                'accrued' => 0,
                'carried_forward' => 0,
                'current_balance' => $policyType->annual_entitlement ?? 0,
                'is_frozen' => false,
            ]);
        }

        if (!$leaveBalance->canAvail($totalDays)) {
            return response()->json([
                'status' => false,
                'message' => 'Insufficient leave balance. Available: ' . $leaveBalance->available_balance . ' days',
            ], 422);
        }

        DB::beginTransaction();
        try {
            $requestData = $validator->validated();
            $requestData['total_days'] = $totalDays;
            $requestData['leave_policy_id'] = $leavePolicy->id;
            $requestData['leave_balance_id'] = $leaveBalance->id;
            $requestData['status'] = 'draft';
            $requestData['request_number'] = 'LR-' . now()->format('Y') . '-' . str_pad(LeaveRequest::count() + 1, 6, '0', STR_PAD_LEFT);

            $leaveRequest = LeaveRequest::create($requestData);

            DB::commit();

            return response()->json([
                'status' => true,
                'message' => 'Leave request created successfully',
                'data' => $leaveRequest->load(['user', 'leaveType', 'leavePolicy', 'leaveBalance']),
            ], 201);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['status' => false, 'message' => $e->getMessage()], 500);
        }
    }

    public function show(LeaveRequest $leaveRequest)
    {
        $leaveRequest->load([
            'user', 
            'leaveType', 
            'leavePolicy', 
            'leaveBalance', 
            'approvals.approver',
            'approvals.delegatedTo',
            'delegations.delegate',
        ]);

        return response()->json([
            'status' => true,
            'data' => $leaveRequest,
        ]);
    }

    public function update(Request $request, LeaveRequest $leaveRequest)
    {
        if (!$leaveRequest->isEditable()) {
            return response()->json([
                'status' => false,
                'message' => 'Leave request cannot be edited in current status',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'leave_type_id' => 'sometimes|exists:leave_types,id',
            'start_date' => 'sometimes|date',
            'end_date' => 'sometimes|date|after_or_equal:start_date',
            'is_half_day_start' => 'boolean',
            'is_half_day_end' => 'boolean',
            'half_day_start_time' => 'nullable|date_format:H:i',
            'half_day_end_time' => 'nullable|date_format:H:i',
            'reason' => 'sometimes|string|max:1000',
            'supporting_documents' => 'nullable|array',
            'contact_during_leave' => 'nullable|string|max:255',
            'emergency_contact' => 'nullable|string|max:255',
            'handover_notes' => 'nullable|string|max:2000',
            'is_emergency' => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        // Recalculate total days if dates changed
        if ($request->has('start_date') || $request->has('end_date') || 
            $request->has('is_half_day_start') || $request->has('is_half_day_end')) {
            
            $start = Carbon::parse($request->input('start_date', $leaveRequest->start_date));
            $end = Carbon::parse($request->input('end_date', $leaveRequest->end_date));
            $totalDays = $start->diffInDays($end) + 1;

            if ($request->boolean('is_half_day_start', $leaveRequest->is_half_day_start)) {
                $totalDays -= 0.5;
            }
            if ($request->boolean('is_half_day_end', $leaveRequest->is_half_day_end)) {
                $totalDays -= 0.5;
            }

            $request->merge(['total_days' => $totalDays]);
        }

        $leaveRequest->update($validator->validated());

        return response()->json([
            'status' => true,
            'message' => 'Leave request updated successfully',
            'data' => $leaveRequest->fresh()->load(['user', 'leaveType', 'leavePolicy', 'leaveBalance']),
        ]);
    }

    public function submit(Request $request, LeaveRequest $leaveRequest)
    {
        if ($leaveRequest->status !== 'draft') {
            return response()->json([
                'status' => false,
                'message' => 'Only draft requests can be submitted',
            ], 422);
        }

        try {
            $leaveRequest->submit();

            return response()->json([
                'status' => true,
                'message' => 'Leave request submitted successfully',
                'data' => $leaveRequest->fresh()->load(['user', 'leaveType', 'leavePolicy', 'leaveBalance', 'approvals']),
            ]);
        } catch (\Exception $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function approve(Request $request, LeaveRequest $leaveRequest)
    {
        $validator = Validator::make($request->all(), [
            'comments' => 'nullable|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        try {
            $approverId = Auth::id();
            $leaveRequest->approve($approverId, $request->comments);

            return response()->json([
                'status' => true,
                'message' => 'Leave request approved successfully',
                'data' => $leaveRequest->fresh()->load(['user', 'leaveType', 'leavePolicy', 'leaveBalance', 'approvals']),
            ]);
        } catch (\Exception $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function reject(Request $request, LeaveRequest $leaveRequest)
    {
        $validator = Validator::make($request->all(), [
            'reason' => 'required|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        try {
            $rejectorId = Auth::id();
            $leaveRequest->reject($rejectorId, $request->reason);

            return response()->json([
                'status' => true,
                'message' => 'Leave request rejected',
                'data' => $leaveRequest->fresh()->load(['user', 'leaveType', 'leavePolicy', 'leaveBalance']),
            ]);
        } catch (\Exception $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function cancel(Request $request, LeaveRequest $leaveRequest)
    {
        $validator = Validator::make($request->all(), [
            'reason' => 'nullable|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        try {
            $cancellerId = Auth::id();
            $leaveRequest->cancel($cancellerId, $request->reason);

            return response()->json([
                'status' => true,
                'message' => 'Leave request cancelled',
                'data' => $leaveRequest->fresh()->load(['user', 'leaveType', 'leavePolicy', 'leaveBalance']),
            ]);
        } catch (\Exception $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function withdraw(Request $request, LeaveRequest $leaveRequest)
    {
        try {
            $withdrawerId = Auth::id();
            $leaveRequest->withdraw($withdrawerId);

            return response()->json([
                'status' => true,
                'message' => 'Leave request withdrawn',
                'data' => $leaveRequest->fresh()->load(['user', 'leaveType', 'leavePolicy', 'leaveBalance']),
            ]);
        } catch (\Exception $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function getPendingApprovals(Request $request)
    {
        $user = Auth::user();
        
        // Get delegations where user is delegate
        $delegations = LeaveDelegation::forDelegate($user->id)
            ->active()
            ->effective()
            ->pluck('user_id')
            ->toArray();

        $query = LeaveApproval::query()
            ->where('status', 'pending')
            ->where(function ($q) use ($user, $delegations) {
                $q->where('approver_id', $user->id)
                    ->orWhereIn('approver_id', $delegations);
            })
            ->with(['leaveRequest.user', 'leaveRequest.leaveType', 'leaveRequest.leavePolicy', 'leaveRequest.leaveBalance']);

        if ($request->has('stage')) {
            $query->where('stage', $request->stage);
        }

        $approvals = $query->orderBy('created_at')->paginate($request->get('per_page', 20));

        return response()->json([
            'status' => true,
            'data' => $approvals,
        ]);
    }

    public function approveApproval(Request $request, LeaveApproval $approval)
    {
        $validator = Validator::make($request->all(), [
            'comments' => 'nullable|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        if (!$approval->canBeDecidedBy(Auth::id())) {
            return response()->json([
                'status' => false,
                'message' => 'You are not authorized to approve this request',
            ], 403);
        }

        try {
            $approval->approve($request->comments);
            $approval->leaveRequest->approve(Auth::id(), $request->comments);

            return response()->json([
                'status' => true,
                'message' => 'Leave request approved',
                'data' => $approval->leaveRequest->fresh()->load(['user', 'leaveType', 'leavePolicy', 'leaveBalance', 'approvals']),
            ]);
        } catch (\Exception $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function rejectApproval(Request $request, LeaveApproval $approval)
    {
        $validator = Validator::make($request->all(), [
            'comments' => 'required|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        if (!$approval->canBeDecidedBy(Auth::id())) {
            return response()->json([
                'status' => false,
                'message' => 'You are not authorized to reject this request',
            ], 403);
        }

        try {
            $approval->reject($request->comments);
            $approval->leaveRequest->reject(Auth::id(), $request->comments);

            return response()->json([
                'status' => true,
                'message' => 'Leave request rejected',
                'data' => $approval->leaveRequest->fresh()->load(['user', 'leaveType', 'leavePolicy', 'leaveBalance']),
            ]);
        } catch (\Exception $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function delegateApproval(Request $request, LeaveApproval $approval)
    {
        $validator = Validator::make($request->all(), [
            'delegate_id' => 'required|exists:users,id',
            'reason' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        if (!$approval->canBeDecidedBy(Auth::id())) {
            return response()->json([
                'status' => false,
                'message' => 'You are not authorized to delegate this approval',
            ], 403);
        }

        try {
            $approval->delegate($request->delegate_id, $request->reason);

            return response()->json([
                'status' => true,
                'message' => 'Approval delegated successfully',
                'data' => $approval->fresh(),
            ]);
        } catch (\Exception $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], 422);
        }
    }
}