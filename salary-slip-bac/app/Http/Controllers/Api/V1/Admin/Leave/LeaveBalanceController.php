<?php

namespace App\Http\Controllers\Api\V1\Admin\Leave;

use App\Http\Controllers\Controller;
use App\Models\LeaveBalance;
use App\Models\LeaveType;
use App\Models\LeavePolicy;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class LeaveBalanceController extends Controller
{
    public function index(Request $request)
    {
        $query = LeaveBalance::query()
            ->with(['user', 'leaveType', 'leavePolicy'])
            ->where('is_frozen', false);

        if ($request->has('user_id')) {
            $query->where('user_id', $request->user_id);
        }

        if ($request->has('leave_type_id')) {
            $query->where('leave_type_id', $request->leave_type_id);
        }

        if ($request->has('leave_year')) {
            $query->where('leave_year', $request->leave_year);
        }

        if ($request->has('leave_policy_id')) {
            $query->where('leave_policy_id', $request->leave_policy_id);
        }

        if ($request->has('company_id')) {
            $query->whereHas('user', fn($q) => $q->where('company_code', $request->company_id));
        }

        if ($request->has('low_balance')) {
            $query->whereRaw('current_balance < 5');
        }

        $balances = $query->orderBy('user_id')->orderBy('leave_type_id')->paginate($request->get('per_page', 50));

        return response()->json([
            'status' => true,
            'data' => $balances,
        ]);
    }

    public function show(LeaveBalance $leaveBalance)
    {
        $leaveBalance->load(['user', 'leaveType', 'leavePolicy', 'requests']);
        return response()->json([
            'status' => true,
            'data' => $leaveBalance,
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'user_id' => 'required|exists:users,id',
            'leave_type_id' => 'required|exists:leave_types,id',
            'leave_policy_id' => 'nullable|exists:leave_policies,id',
            'leave_year' => 'required|string|max:16',
            'leave_year_start' => 'required|date',
            'leave_year_end' => 'required|date|after_or_equal:leave_year_start',
            'opening_balance' => 'nullable|numeric|min:0',
            'accrued' => 'nullable|numeric|min:0',
            'carried_forward' => 'nullable|numeric|min:0',
            'is_frozen' => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        $data = $validator->validated();
        $data['current_balance'] = ($data['opening_balance'] ?? 0) + ($data['accrued'] ?? 0) + ($data['carried_forward'] ?? 0);

        $balance = LeaveBalance::create($data);

        return response()->json([
            'status' => true,
            'message' => 'Leave balance created successfully',
            'data' => $balance->load(['user', 'leaveType', 'leavePolicy']),
        ], 201);
    }

    public function update(Request $request, LeaveBalance $leaveBalance)
    {
        $validator = Validator::make($request->all(), [
            'leave_policy_id' => 'nullable|exists:leave_policies,id',
            'leave_year_start' => 'sometimes|date',
            'leave_year_end' => 'sometimes|date|after_or_equal:leave_year_start',
            'opening_balance' => 'nullable|numeric|min:0',
            'accrued' => 'nullable|numeric|min:0',
            'carried_forward' => 'nullable|numeric|min:0',
            'is_frozen' => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        $leaveBalance->update($validator->validated());
        $leaveBalance->recalculate();

        return response()->json([
            'status' => true,
            'message' => 'Leave balance updated successfully',
            'data' => $leaveBalance->fresh()->load(['user', 'leaveType', 'leavePolicy']),
        ]);
    }

    public function adjust(Request $request, LeaveBalance $leaveBalance)
    {
        $validator = Validator::make($request->all(), [
            'days' => 'required|numeric',
            'description' => 'required|string|max:500',
            'type' => 'required|in:accrue,avail,encash,lapse,carry_forward,adjust',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        try {
            $days = $request->days;
            $description = $request->description;
            $type = $request->type;

            switch ($type) {
                case 'accrue':
                    $leaveBalance->accrue($days, $description);
                    break;
                case 'avail':
                    $leaveBalance->avail($days, $description);
                    break;
                case 'encash':
                    $leaveBalance->encash($days, $description);
                    break;
                case 'lapse':
                    $leaveBalance->lapse($days, $description);
                    break;
                case 'carry_forward':
                    $leaveBalance->carryForward($days, $description);
                    break;
                case 'adjust':
                    $leaveBalance->adjust($days, $description);
                    break;
            }

            return response()->json([
                'status' => true,
                'message' => 'Leave balance adjusted successfully',
                'data' => $leaveBalance->fresh()->load(['user', 'leaveType', 'leavePolicy']),
            ]);
        } catch (\Exception $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function bulkAccrue(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'leave_type_id' => 'required|exists:leave_types,id',
            'leave_policy_id' => 'nullable|exists:leave_policies,id',
            'leave_year' => 'required|string|max:16',
            'date' => 'required|date',
            'user_ids' => 'nullable|array',
            'user_ids.*' => 'exists:users,id',
            'company_id' => 'nullable|exists:companies,id',
            'description' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        $leaveType = LeaveType::find($request->leave_type_id);
        $leavePolicy = $request->leave_policy_id ? LeavePolicy::find($request->leave_policy_id) : null;
        $date = Carbon::parse($request->date);
        $description = $request->description ?? "Accrual on {$date->format('Y-m-d')}";

        $query = LeaveBalance::query()
            ->where('leave_type_id', $request->leave_type_id)
            ->where('leave_year', $request->leave_year)
            ->where('is_frozen', false);

        if ($leavePolicy) {
            $query->where('leave_policy_id', $leavePolicy->id);
        }

        if ($request->has('user_ids')) {
            $query->whereIn('user_id', $request->user_ids);
        }

        if ($request->has('company_id')) {
            $query->whereHas('user', fn($q) => $q->where('company_code', $request->company_id));
        }

        $balances = $query->get();
        $accrued = 0;
        $errors = [];

        foreach ($balances as $balance) {
            try {
                $days = $leavePolicy 
                    ? $leavePolicy->calculateAccrual($leaveType->id, $balance->user, $date)
                    : ($leaveType->max_days_per_year ?? 0) / 12;

                if ($days > 0) {
                    $balance->accrue($days, $description);
                    $accrued++;
                }
            } catch (\Exception $e) {
                $errors[] = [
                    'user_id' => $balance->user_id,
                    'error' => $e->getMessage(),
                ];
            }
        }

        return response()->json([
            'status' => true,
            'message' => "Accrual completed for {$accrued} employees",
            'data' => [
                'accrued_count' => $accrued,
                'errors' => $errors,
            ],
        ]);
    }

    public function carryForward(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'from_leave_year' => 'required|string|max:16',
            'to_leave_year' => 'required|string|max:16',
            'leave_type_id' => 'nullable|exists:leave_types,id',
            'leave_policy_id' => 'nullable|exists:leave_policies,id',
            'user_ids' => 'nullable|array',
            'user_ids.*' => 'exists:users,id',
            'max_days' => 'nullable|integer|min:0',
            'expiry_date' => 'nullable|date',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        $query = LeaveBalance::query()
            ->where('leave_year', $request->from_leave_year)
            ->where('is_frozen', false);

        if ($request->has('leave_type_id')) {
            $query->where('leave_type_id', $request->leave_type_id);
        }

        if ($request->has('leave_policy_id')) {
            $query->where('leave_policy_id', $request->leave_policy_id);
        }

        if ($request->has('user_ids')) {
            $query->whereIn('user_id', $request->user_ids);
        }

        $balances = $query->get();
        $carried = 0;
        $errors = [];

        foreach ($balances as $balance) {
            try {
                $days = $balance->current_balance;

                if ($request->has('max_days') && $days > $request->max_days) {
                    $days = $request->max_days;
                }

                if ($days > 0) {
                    // Create or update balance for new year
                    $newBalance = LeaveBalance::updateOrCreate(
                        [
                            'user_id' => $balance->user_id,
                            'leave_type_id' => $balance->leave_type_id,
                            'leave_year' => $request->to_leave_year,
                        ],
                        [
                            'leave_policy_id' => $balance->leave_policy_id,
                            'leave_year_start' => $balance->leave_year_start->copy()->addYear(),
                            'leave_year_end' => $balance->leave_year_end->copy()->addYear(),
                            'opening_balance' => 0,
                            'accrued' => 0,
                            'carried_forward' => $days,
                            'current_balance' => $days,
                            'is_frozen' => false,
                        ]
                    );

                    if ($request->has('expiry_date')) {
                        $newBalance->carry_forward_expiry = $request->expiry_date;
                        $newBalance->save();
                    }

                    $balance->carryForward($days, "Carried forward to {$request->to_leave_year}");
                    $carried++;
                }
            } catch (\Exception $e) {
                $errors[] = [
                    'user_id' => $balance->user_id,
                    'error' => $e->getMessage(),
                ];
            }
        }

        return response()->json([
            'status' => true,
            'message' => "Carry forward completed for {$carried} employees",
            'data' => [
                'carried_count' => $carried,
                'errors' => $errors,
            ],
        ]);
    }

    public function getUserBalances(Request $request, $userId)
    {
        $user = User::findOrFail($userId);
        $leaveYear = $request->get('leave_year', now()->format('Y'));

        $balances = LeaveBalance::query()
            ->where('user_id', $userId)
            ->where('leave_year', $leaveYear)
            ->where('is_frozen', false)
            ->with(['leaveType', 'leavePolicy'])
            ->get();

        return response()->json([
            'status' => true,
            'data' => [
                'user' => $user->only(['id', 'emp_code', 'name', 'email']),
                'leave_year' => $leaveYear,
                'balances' => $balances->map(function ($balance) {
                    return [
                        'id' => $balance->id,
                        'leave_type' => $balance->leaveType->only(['id', 'code', 'name', 'category', 'color']),
                        'opening_balance' => $balance->opening_balance,
                        'accrued' => $balance->accrued,
                        'carried_forward' => $balance->carried_forward,
                        'availed' => $balance->availed,
                        'encashed' => $balance->encashed,
                        'lapsed' => $balance->lapsed,
                        'adjusted' => $balance->adjusted,
                        'current_balance' => $balance->current_balance,
                        'available_balance' => $balance->available_balance,
                        'pending_approval' => $balance->pending_approval,
                        'last_accrual_date' => $balance->last_accrual_date,
                    ];
                }),
            ],
        ]);
    }
}