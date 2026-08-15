<?php

namespace App\Http\Controllers\Api\V1\Admin\Leave;

use App\Http\Controllers\Controller;
use App\Models\CompensatoryOff;
use App\Models\LeaveType;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class CompensatoryOffController extends Controller
{
    public function index(Request $request)
    {
        $query = CompensatoryOff::query()
            ->with(['user', 'leaveType', 'leaveBalance', 'approvedBy'])
            ->where('status', '!=', 'pending');

        if ($request->has('user_id')) {
            $query->where('user_id', $request->user_id);
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('start_date') && $request->has('end_date')) {
            $query->whereBetween('worked_date', [$request->start_date, $request->end_date]);
        }

        if ($request->has('company_id')) {
            $query->whereHas('user', fn($q) => $q->where('company_code', $request->company_id));
        }

        $compOffs = $query->orderBy('worked_date', 'desc')->paginate($request->get('per_page', 20));

        return response()->json([
            'status' => true,
            'data' => $compOffs,
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'user_id' => 'required|exists:users,id',
            'leave_type_id' => 'required|exists:leave_types,id',
            'worked_date' => 'required|date',
            'hours_worked' => 'required|numeric|min:0',
            'earning_rule' => 'required|in:standard,time_and_half,double',
            'reason' => 'required|string|max:500',
            'supporting_documents' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        $leaveType = LeaveType::find($request->leave_type_id);
        
        if ($leaveType->category !== 'compensatory') {
            return response()->json([
                'status' => false,
                'message' => 'Selected leave type is not a compensatory off type',
            ], 422);
        }

        // Calculate hours earned based on earning rule
        $hoursWorked = $request->hours_worked;
        $hoursEarned = match ($request->earning_rule) {
            'standard' => $hoursWorked,
            'time_and_half' => $hoursWorked * 1.5,
            'double' => $hoursWorked * 2,
            default => $hoursWorked,
        };

        $compOff = CompensatoryOff::create([
            'user_id' => $request->user_id,
            'leave_type_id' => $request->leave_type_id,
            'worked_date' => $request->worked_date,
            'hours_worked' => $hoursWorked,
            'hours_earned' => $hoursEarned,
            'earning_rule' => $request->earning_rule,
            'reason' => $request->reason,
            'supporting_documents' => $request->supporting_documents,
            'status' => 'pending',
        ]);

        return response()->json([
            'status' => true,
            'message' => 'Compensatory off request created successfully',
            'data' => $compOff->load(['user', 'leaveType']),
        ], 201);
    }

    public function show(CompensatoryOff $compensatoryOff)
    {
        $compensatoryOff->load(['user', 'leaveType', 'leaveBalance', 'approvedBy', 'leaveRequest']);
        return response()->json([
            'status' => true,
            'data' => $compensatoryOff,
        ]);
    }

    public function approve(Request $request, CompensatoryOff $compensatoryOff)
    {
        if ($compensatoryOff->status !== 'pending') {
            return response()->json([
                'status' => false,
                'message' => 'Only pending requests can be approved',
            ], 422);
        }

        $compensatoryOff->approve(Auth::id());

        return response()->json([
            'status' => true,
            'message' => 'Compensatory off approved successfully',
            'data' => $compensatoryOff->fresh()->load(['user', 'leaveType', 'leaveBalance']),
        ]);
    }

    public function reject(Request $request, CompensatoryOff $compensatoryOff)
    {
        $validator = Validator::make($request->all(), [
            'reason' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        if ($compensatoryOff->status !== 'pending') {
            return response()->json([
                'status' => false,
                'message' => 'Only pending requests can be rejected',
            ], 422);
        }

        $compensatoryOff->reject(Auth::id(), $request->reason);

        return response()->json([
            'status' => true,
            'message' => 'Compensatory off rejected',
            'data' => $compensatoryOff->fresh(),
        ]);
    }

    public function avail(Request $request, CompensatoryOff $compensatoryOff)
    {
        $validator = Validator::make($request->all(), [
            'hours' => 'required|numeric|min:0',
            'leave_request_id' => 'nullable|exists:leave_requests,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        try {
            $compensatoryOff->avail($request->hours, $request->leave_request_id);

            return response()->json([
                'status' => true,
                'message' => 'Compensatory off availed successfully',
                'data' => $compensatoryOff->fresh()->load(['user', 'leaveType', 'leaveBalance']),
            ]);
        } catch (\Exception $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function getUserCompOff(Request $request, $userId)
    {
        $user = User::findOrFail($userId);

        $compOffs = CompensatoryOff::query()
            ->where('user_id', $userId)
            ->whereIn('status', ['approved', 'availed'])
            ->with(['leaveType', 'leaveBalance'])
            ->get();

        $totalEarned = $compOffs->sum('hours_earned');
        $totalAvailed = $compOffs->sum('availed_hours');
        $available = $totalEarned - $totalAvailed;

        return response()->json([
            'status' => true,
            'data' => [
                'user' => $user->only(['id', 'emp_code', 'name']),
                'total_earned' => $totalEarned,
                'total_availed' => $totalAvailed,
                'available_hours' => $available,
                'compensatory_offs' => $compOffs->map(function ($co) {
                    return [
                        'id' => $co->id,
                        'worked_date' => $co->worked_date,
                        'hours_worked' => $co->hours_worked,
                        'hours_earned' => $co->hours_earned,
                        'earning_rule' => $co->earning_rule,
                        'status' => $co->status,
                        'expiry_date' => $co->expiry_date,
                        'availed_hours' => $co->availed_hours,
                        'available_hours' => $co->available_hours,
                    ];
                }),
            ],
        ]);
    }
}