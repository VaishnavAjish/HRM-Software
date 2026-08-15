<?php

namespace App\Http\Controllers\Api\V1\Admin\Leave;

use App\Http\Controllers\Controller;
use App\Models\WorkFromHomeRequest;
use App\Models\WfhCheckIn;
use App\Models\LeaveType;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Auth;
use Carbon\Carbon;

class WorkFromHomeController extends Controller
{
    public function index(Request $request)
    {
        $query = WorkFromHomeRequest::query()
            ->with(['user', 'leaveType', 'approvedBy'])
            ->where('status', '!=', 'draft');

        if ($request->has('user_id')) {
            $query->where('user_id', $request->user_id);
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
            'is_recurring' => 'boolean',
            'recurrence_pattern' => 'nullable|array',
            'reason' => 'required|string|max:500',
            'work_location' => 'nullable|string|max:255',
            'contact_number' => 'nullable|string|max:32',
            'emergency_contact' => 'nullable|string|max:255',
            'equipment_taken' => 'nullable|array',
            'requires_check_in' => 'boolean',
            'check_in_schedule' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        $leaveType = LeaveType::find($request->leave_type_id);
        
        if ($leaveType->code !== 'WFH') {
            return response()->json([
                'status' => false,
                'message' => 'Selected leave type is not a Work From Home type',
            ], 422);
        }

        $wfhRequest = WorkFromHomeRequest::create([
            'user_id' => $request->user_id,
            'leave_type_id' => $request->leave_type_id,
            'leave_policy_id' => $request->leave_policy_id,
            'start_date' => $request->start_date,
            'end_date' => $request->end_date,
            'total_days' => Carbon::parse($request->start_date)->diffInDays(Carbon::parse($request->end_date)) + 1,
            'is_recurring' => $request->boolean('is_recurring'),
            'recurrence_pattern' => $request->recurrence_pattern,
            'reason' => $request->reason,
            'work_location' => $request->work_location,
            'contact_number' => $request->contact_number,
            'emergency_contact' => $request->emergency_contact,
            'equipment_taken' => $request->equipment_taken,
            'requires_check_in' => $request->boolean('requires_check_in', true),
            'check_in_schedule' => $request->check_in_schedule,
            'status' => 'draft',
            'request_number' => 'WFH-' . now()->format('Y') . '-' . str_pad(WorkFromHomeRequest::count() + 1, 6, '0', STR_PAD_LEFT),
        ]);

        return response()->json([
            'status' => true,
            'message' => 'Work from home request created successfully',
            'data' => $wfhRequest->load(['user', 'leaveType']),
        ], 201);
    }

    public function show(WorkFromHomeRequest $workFromHomeRequest)
    {
        $workFromHomeRequest->load(['user', 'leaveType', 'leavePolicy', 'approvedBy', 'checkIns']);
        return response()->json([
            'status' => true,
            'data' => $workFromHomeRequest,
        ]);
    }

    public function submit(Request $request, WorkFromHomeRequest $wfhRequest)
    {
        if ($wfhRequest->status !== 'draft') {
            return response()->json([
                'status' => false,
                'message' => 'Only draft requests can be submitted',
            ], 422);
        }

        $wfhRequest->submit();

        return response()->json([
            'status' => true,
            'message' => 'Work from home request submitted successfully',
            'data' => $wfhRequest->fresh()->load(['user', 'leaveType']),
        ]);
    }

    public function approve(Request $request, WorkFromHomeRequest $wfhRequest)
    {
        if (!in_array($wfhRequest->status, ['submitted', 'pending'])) {
            return response()->json([
                'status' => false,
                'message' => 'Only submitted/pending requests can be approved',
            ], 422);
        }

        $wfhRequest->approve(Auth::id());

        return response()->json([
            'status' => true,
            'message' => 'Work from home request approved successfully',
            'data' => $wfhRequest->fresh()->load(['user', 'leaveType']),
        ]);
    }

    public function reject(Request $request, WorkFromHomeRequest $wfhRequest)
    {
        $validator = Validator::make($request->all(), [
            'reason' => 'required|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        if (!in_array($wfhRequest->status, ['submitted', 'pending'])) {
            return response()->json([
                'status' => false,
                'message' => 'Only submitted/pending requests can be rejected',
            ], 422);
        }

        $wfhRequest->reject(Auth::id(), $request->reason);

        return response()->json([
            'status' => true,
            'message' => 'Work from home request rejected',
            'data' => $wfhRequest->fresh()->load(['user', 'leaveType']),
        ]);
    }

    public function cancel(Request $request, WorkFromHomeRequest $wfhRequest)
    {
        $validator = Validator::make($request->all(), [
            'reason' => 'nullable|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        if (!in_array($wfhRequest->status, ['draft', 'submitted', 'pending', 'approved'])) {
            return response()->json([
                'status' => false,
                'message' => 'Request cannot be cancelled in current status',
            ], 422);
        }

        $wfhRequest->cancel(Auth::id(), $request->reason);

        return response()->json([
            'status' => true,
            'message' => 'Work from home request cancelled',
            'data' => $wfhRequest->fresh()->load(['user', 'leaveType']),
        ]);
    }

    public function checkIn(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'wfh_request_id' => 'required|exists:work_from_home_requests,id',
            'check_in_time' => 'nullable|date_format:H:i',
            'location' => 'nullable|string|max:255',
            'activity_log' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        $wfhRequest = WorkFromHomeRequest::find($request->wfh_request_id);
        
        if ($wfhRequest->status !== 'approved') {
            return response()->json([
                'status' => false,
                'message' => 'Can only check in for approved WFH requests',
            ], 422);
        }

        $today = now()->toDateString();
        
        // Check if already checked in today
        $existing = WfhCheckIn::where('wfh_request_id', $wfhRequest->id)
            ->where('check_in_date', $today)
            ->first();

        if ($existing) {
            return response()->json([
                'status' => false,
                'message' => 'Already checked in today',
            ], 422);
        }

        $checkIn = WfhCheckIn::create([
            'wfh_request_id' => $wfhRequest->id,
            'user_id' => $wfhRequest->user_id,
            'check_in_date' => $today,
            'check_in_time' => $request->check_in_time ?? now()->format('H:i'),
            'location' => $request->location,
            'activity_log' => $request->activity_log,
            'status' => 'present',
        ]);

        return response()->json([
            'status' => true,
            'message' => 'Check-in successful',
            'data' => $checkIn,
        ]);
    }

    public function checkOut(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'wfh_request_id' => 'required|exists:work_from_home_requests,id',
            'check_out_time' => 'nullable|date_format:H:i',
            'activity_log' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        $wfhRequest = WorkFromHomeRequest::find($request->wfh_request_id);
        $today = now()->toDateString();

        $checkIn = WfhCheckIn::where('wfh_request_id', $wfhRequest->id)
            ->where('check_in_date', $today)
            ->first();

        if (!$checkIn) {
            return response()->json([
                'status' => false,
                'message' => 'No check-in found for today',
            ], 422);
        }

        if ($checkIn->check_out_time) {
            return response()->json([
                'status' => false,
                'message' => 'Already checked out today',
            ], 422);
        }

        $checkIn->update([
            'check_out_time' => $request->check_out_time ?? now()->format('H:i'),
            'activity_log' => array_merge($checkIn->activity_log ?? [], $request->activity_log ?? []),
        ]);

        return response()->json([
            'status' => true,
            'message' => 'Check-out successful',
            'data' => $checkIn->fresh(),
        ]);
    }

    public function getCheckIns(Request $request, $wfhRequestId)
    {
        $wfhRequest = WorkFromHomeRequest::findOrFail($wfhRequestId);
        
        $checkIns = WfhCheckIn::where('wfh_request_id', $wfhRequestId)
            ->orderBy('check_in_date', 'desc')
            ->get();

        return response()->json([
            'status' => true,
            'data' => $checkIns,
        ]);
    }
}