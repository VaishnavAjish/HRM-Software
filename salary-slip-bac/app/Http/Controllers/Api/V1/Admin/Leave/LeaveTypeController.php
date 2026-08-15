<?php

namespace App\Http\Controllers\Api\V1\Admin\Leave;

use App\Http\Controllers\Controller;
use App\Models\LeaveType;
use App\Models\LeavePolicy;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\LeaveApproval;
use App\Models\LeaveDelegation;
use App\Models\CompensatoryOff;
use App\Models\WorkFromHomeRequest;
use App\Models\WfhCheckIn;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Carbon\Carbon;

class LeaveTypeController extends Controller
{
    public function index(Request $request)
    {
        $query = LeaveType::query();

        if ($request->has('category')) {
            $query->where('category', $request->category);
        }

        if ($request->has('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        if ($request->has('search')) {
            $query->where(function ($q) use ($request) {
                $q->where('name', 'like', "%{$request->search}%")
                    ->orWhere('code', 'like', "%{$request->search}%");
            });
        }

        $leaveTypes = $query->orderBy('sort_order')->orderBy('name')->paginate($request->get('per_page', 20));

        return response()->json([
            'status' => true,
            'data' => $leaveTypes,
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'code' => 'required|string|max:32|unique:leave_types,code',
            'name' => 'required|string|max:128',
            'description' => 'nullable|string',
            'category' => 'required|in:standard,medical,special,compensatory',
            'is_paid' => 'boolean',
            'requires_approval' => 'boolean',
            'requires_document' => 'boolean',
            'max_days_per_request' => 'nullable|integer|min:1',
            'max_days_per_year' => 'nullable|integer|min:1',
            'min_notice_days' => 'integer|min:0',
            'allow_half_day' => 'boolean',
            'allow_negative_balance' => 'boolean',
            'carry_forward_allowed' => 'boolean',
            'max_carry_forward_days' => 'nullable|integer|min:0',
            'carry_forward_expiry' => 'nullable|date',
            'applicable_genders' => 'nullable|array',
            'applicable_employment_types' => 'nullable|array',
            'applicable_grades' => 'nullable|array',
            'applicable_departments' => 'nullable|array',
            'applicable_locations' => 'nullable|array',
            'color' => 'nullable|string|max:7',
            'icon' => 'nullable|string|max:64',
            'sort_order' => 'integer|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        $leaveType = LeaveType::create($validator->validated());

        return response()->json([
            'status' => true,
            'message' => 'Leave type created successfully',
            'data' => $leaveType,
        ], 201);
    }

    public function show(LeaveType $leaveType)
    {
        $leaveType->load('policyTypes');
        return response()->json([
            'status' => true,
            'data' => $leaveType,
        ]);
    }

    public function update(Request $request, LeaveType $leaveType)
    {
        if ($leaveType->is_system) {
            return response()->json([
                'status' => false,
                'message' => 'System leave types cannot be modified',
            ], 403);
        }

        $validator = Validator::make($request->all(), [
            'code' => 'sometimes|string|max:32|unique:leave_types,code,' . $leaveType->id,
            'name' => 'sometimes|string|max:128',
            'description' => 'nullable|string',
            'category' => 'sometimes|in:standard,medical,special,compensatory',
            'is_paid' => 'boolean',
            'requires_approval' => 'boolean',
            'requires_document' => 'boolean',
            'max_days_per_request' => 'nullable|integer|min:1',
            'max_days_per_year' => 'nullable|integer|min:1',
            'min_notice_days' => 'integer|min:0',
            'allow_half_day' => 'boolean',
            'allow_negative_balance' => 'boolean',
            'carry_forward_allowed' => 'boolean',
            'max_carry_forward_days' => 'nullable|integer|min:0',
            'carry_forward_expiry' => 'nullable|date',
            'applicable_genders' => 'nullable|array',
            'applicable_employment_types' => 'nullable|array',
            'applicable_grades' => 'nullable|array',
            'applicable_departments' => 'nullable|array',
            'applicable_locations' => 'nullable|array',
            'color' => 'nullable|string|max:7',
            'icon' => 'nullable|string|max:64',
            'sort_order' => 'integer|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        $leaveType->update($validator->validated());

        return response()->json([
            'status' => true,
            'message' => 'Leave type updated successfully',
            'data' => $leaveType->fresh(),
        ]);
    }

    public function destroy(LeaveType $leaveType)
    {
        if ($leaveType->is_system) {
            return response()->json([
                'status' => false,
                'message' => 'System leave types cannot be deleted',
            ], 403);
        }

        if ($leaveType->balances()->exists() || $leaveType->requests()->exists()) {
            return response()->json([
                'status' => false,
                'message' => 'Cannot delete leave type with existing balances or requests',
            ], 422);
        }

        $leaveType->delete();

        return response()->json([
            'status' => true,
            'message' => 'Leave type deleted successfully',
        ]);
    }

    public function getCategories()
    {
        return response()->json([
            'status' => true,
            'data' => LeaveType::CATEGORIES,
        ]);
    }
}