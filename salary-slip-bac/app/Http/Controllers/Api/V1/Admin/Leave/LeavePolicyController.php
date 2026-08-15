<?php

namespace App\Http\Controllers\Api\V1\Admin\Leave;

use App\Http\Controllers\Controller;
use App\Models\LeavePolicy;
use App\Models\LeaveType;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\Company;
use App\Models\LegalEntity;
use App\Models\Country;
use App\Models\Location;
use App\Models\Department;
use App\Models\Grade;
use App\Models\WorkerType;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class LeavePolicyController extends Controller
{
    public function index(Request $request)
    {
        $query = LeavePolicy::query()->with('types.leaveType');

        if ($request->has('scope_type')) {
            $query->where('scope_type', $request->scope_type);
        }

        if ($request->has('scope_id')) {
            $query->where('scope_id', $request->scope_id);
        }

        if ($request->has('company_id')) {
            $query->where('company_id', $request->company_id);
        }

        if ($request->has('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        if ($request->has('is_default')) {
            $query->where('is_default', $request->boolean('is_default'));
        }

        if ($request->has('search')) {
            $query->where(function ($q) use ($request) {
                $q->where('name', 'like', "%{$request->search}%")
                    ->orWhere('code', 'like', "%{$request->search}%");
            });
        }

        $policies = $query->orderBy('priority')->orderBy('name')->paginate($request->get('per_page', 20));

        return response()->json([
            'status' => true,
            'data' => $policies,
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'code' => 'required|string|max:64|unique:leave_policies,code',
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'scope_type' => 'required|in:company,legal_entity,country,location,department,grade,worker_type',
            'scope_id' => 'required_if:scope_type,!=,company|nullable|integer',
            'company_id' => 'nullable|exists:companies,id',
            'legal_entity_id' => 'nullable|exists:legal_entities,id',
            'country_id' => 'nullable|exists:countries,id',
            'location_id' => 'nullable|exists:locations,id',
            'department_id' => 'nullable|exists:departments,id',
            'grade_id' => 'nullable|exists:grades,id',
            'worker_type_id' => 'nullable|exists:worker_types,id',
            'effective_from' => 'required|date',
            'effective_to' => 'nullable|date|after_or_equal:effective_from',
            'accrual_frequency' => 'required|in:daily,weekly,monthly,quarterly,yearly,on_joining',
            'accrual_day_of_month' => 'integer|between:1,28',
            'pro_rata_first_year' => 'boolean',
            'pro_rata_last_year' => 'boolean',
            'leave_year_start' => 'required|regex:/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/',
            'allow_carry_forward' => 'boolean',
            'max_carry_forward_days' => 'nullable|integer|min:0',
            'carry_forward_expiry' => 'nullable|date',
            'allow_negative_balance' => 'boolean',
            'max_negative_balance_days' => 'nullable|integer|min:0',
            'require_approval_for_all' => 'boolean',
            'approval_workflow' => 'nullable|array',
            'is_active' => 'boolean',
            'is_default' => 'boolean',
            'priority' => 'integer|min:0',
            'leave_types' => 'required|array|min:1',
            'leave_types.*.leave_type_id' => 'required|exists:leave_types,id',
            'leave_types.*.annual_entitlement' => 'required|numeric|min:0',
            'leave_types.*.max_per_request' => 'nullable|numeric|min:0',
            'leave_types.*.min_per_request' => 'numeric|min:0.5',
            'leave_types.*.max_requests_per_year' => 'nullable|integer|min:1',
            'leave_types.*.min_notice_days' => 'integer|min:0',
            'leave_types.*.allow_half_day' => 'boolean',
            'leave_types.*.requires_document' => 'boolean',
            'leave_types.*.document_types' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            $leaveTypes = $request->input('leave_types');
            $policyData = $request->except('leave_types');
            
            // Handle default policy
            if ($policyData['is_default'] ?? false) {
                LeavePolicy::where('scope_type', $policyData['scope_type'])
                    ->where('scope_id', $policyData['scope_id'] ?? null)
                    ->where('is_default', true)
                    ->update(['is_default' => false]);
            }

            $policy = LeavePolicy::create($policyData);

            // Attach leave types
            foreach ($leaveTypes as $lt) {
                $policy->types()->attach($lt['leave_type_id'], [
                    'annual_entitlement' => $lt['annual_entitlement'],
                    'max_per_request' => $lt['max_per_request'],
                    'min_per_request' => $lt['min_per_request'] ?? 0.5,
                    'max_requests_per_year' => $lt['max_requests_per_year'],
                    'min_notice_days' => $lt['min_notice_days'] ?? 0,
                    'allow_half_day' => $lt['allow_half_day'] ?? true,
                    'requires_document' => $lt['requires_document'] ?? false,
                    'document_types' => $lt['document_types'],
                    'is_active' => true,
                ]);
            }

            DB::commit();

            return response()->json([
                'status' => true,
                'message' => 'Leave policy created successfully',
                'data' => $policy->load('types.leaveType'),
            ], 201);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['status' => false, 'message' => $e->getMessage()], 500);
        }
    }

    public function show(LeavePolicy $leavePolicy)
    {
        $leavePolicy->load('types.leaveType', 'company', 'legalEntity', 'country', 'location', 'department', 'grade', 'workerType');
        return response()->json([
            'status' => true,
            'data' => $leavePolicy,
        ]);
    }

    public function update(Request $request, LeavePolicy $leavePolicy)
    {
        $validator = Validator::make($request->all(), [
            'code' => 'sometimes|string|max:64|unique:leave_policies,code,' . $leavePolicy->id,
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'scope_type' => 'sometimes|in:company,legal_entity,country,location,department,grade,worker_type',
            'scope_id' => 'nullable|integer',
            'company_id' => 'nullable|exists:companies,id',
            'legal_entity_id' => 'nullable|exists:legal_entities,id',
            'country_id' => 'nullable|exists:countries,id',
            'location_id' => 'nullable|exists:locations,id',
            'department_id' => 'nullable|exists:departments,id',
            'grade_id' => 'nullable|exists:grades,id',
            'worker_type_id' => 'nullable|exists:worker_types,id',
            'effective_from' => 'sometimes|date',
            'effective_to' => 'nullable|date|after_or_equal:effective_from',
            'accrual_frequency' => 'sometimes|in:daily,weekly,monthly,quarterly,yearly,on_joining',
            'accrual_day_of_month' => 'integer|between:1,28',
            'pro_rata_first_year' => 'boolean',
            'pro_rata_last_year' => 'boolean',
            'leave_year_start' => 'sometimes|regex:/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/',
            'allow_carry_forward' => 'boolean',
            'max_carry_forward_days' => 'nullable|integer|min:0',
            'carry_forward_expiry' => 'nullable|date',
            'allow_negative_balance' => 'boolean',
            'max_negative_balance_days' => 'nullable|integer|min:0',
            'require_approval_for_all' => 'boolean',
            'approval_workflow' => 'nullable|array',
            'is_active' => 'boolean',
            'is_default' => 'boolean',
            'priority' => 'integer|min:0',
            'leave_types' => 'sometimes|array',
            'leave_types.*.leave_type_id' => 'required|exists:leave_types,id',
            'leave_types.*.annual_entitlement' => 'required|numeric|min:0',
            'leave_types.*.max_per_request' => 'nullable|numeric|min:0',
            'leave_types.*.min_per_request' => 'numeric|min:0.5',
            'leave_types.*.max_requests_per_year' => 'nullable|integer|min:1',
            'leave_types.*.min_notice_days' => 'integer|min:0',
            'leave_types.*.allow_half_day' => 'boolean',
            'leave_types.*.requires_document' => 'boolean',
            'leave_types.*.document_types' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            $leaveTypes = $request->input('leave_types');
            $policyData = $request->except('leave_types');

            // Handle default policy
            if ($policyData['is_default'] ?? false) {
                LeavePolicy::where('scope_type', $policyData['scope_type'] ?? $leavePolicy->scope_type)
                    ->where('scope_id', $policyData['scope_id'] ?? $leavePolicy->scope_id)
                    ->where('id', '!=', $leavePolicy->id)
                    ->where('is_default', true)
                    ->update(['is_default' => false]);
            }

            $leavePolicy->update($policyData);

            if ($leaveTypes) {
                // Sync leave types
                $newTypeIds = collect($leaveTypes)->pluck('leave_type_id')->toArray();
                $leavePolicy->types()->whereNotIn('leave_type_id', $newTypeIds)->detach();

                foreach ($leaveTypes as $lt) {
                    $leavePolicy->types()->syncWithoutDetaching([
                        $lt['leave_type_id'] => [
                            'annual_entitlement' => $lt['annual_entitlement'],
                            'max_per_request' => $lt['max_per_request'],
                            'min_per_request' => $lt['min_per_request'] ?? 0.5,
                            'max_requests_per_year' => $lt['max_requests_per_year'],
                            'min_notice_days' => $lt['min_notice_days'] ?? 0,
                            'allow_half_day' => $lt['allow_half_day'] ?? true,
                            'requires_document' => $lt['requires_document'] ?? false,
                            'document_types' => $lt['document_types'],
                            'is_active' => true,
                        ],
                    ]);
                }
            }

            DB::commit();

            return response()->json([
                'status' => true,
                'message' => 'Leave policy updated successfully',
                'data' => $leavePolicy->fresh()->load('types.leaveType'),
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['status' => false, 'message' => $e->getMessage()], 500);
        }
    }

    public function destroy(LeavePolicy $leavePolicy)
    {
        if ($leavePolicy->balances()->exists() || $leavePolicy->requests()->exists()) {
            return response()->json([
                'status' => false,
                'message' => 'Cannot delete leave policy with existing balances or requests',
            ], 422);
        }

        $leavePolicy->types()->detach();
        $leavePolicy->delete();

        return response()->json([
            'status' => true,
            'message' => 'Leave policy deleted successfully',
        ]);
    }

    public function getScopeTypes()
    {
        return response()->json([
            'status' => true,
            'data' => LeavePolicy::SCOPE_TYPES,
        ]);
    }

    public function getAccrualFrequencies()
    {
        return response()->json([
            'status' => true,
            'data' => LeavePolicy::ACCRUAL_FREQUENCIES,
        ]);
    }

    public function getApplicablePolicies(Request $request)
    {
        $request->validate([
            'company_id' => 'required|exists:companies,id',
            'legal_entity_id' => 'nullable|exists:legal_entities,id',
            'country_id' => 'nullable|exists:countries,id',
            'location_id' => 'nullable|exists:locations,id',
            'department_id' => 'nullable|exists:departments,id',
            'grade_id' => 'nullable|exists:grades,id',
            'worker_type_id' => 'nullable|exists:worker_types,id',
            'date' => 'nullable|date',
        ]);

        $date = $request->input('date', now()->toDateString());
        $policies = LeavePolicy::query()
            ->where('is_active', true)
            ->where(function ($q) use ($request) {
                $q->where('scope_type', 'company')
                    ->where('company_id', $request->company_id)
                    ->orWhere(function ($q2) use ($request) {
                        if ($request->legal_entity_id) {
                            $q2->where('scope_type', 'legal_entity')
                                ->where('legal_entity_id', $request->legal_entity_id);
                        }
                        if ($request->country_id) {
                            $q2->orWhere('scope_type', 'country')
                                ->where('country_id', $request->country_id);
                        }
                        if ($request->location_id) {
                            $q2->orWhere('scope_type', 'location')
                                ->where('location_id', $request->location_id);
                        }
                        if ($request->department_id) {
                            $q2->orWhere('scope_type', 'department')
                                ->where('department_id', $request->department_id);
                        }
                        if ($request->grade_id) {
                            $q2->orWhere('scope_type', 'grade')
                                ->where('grade_id', $request->grade_id);
                        }
                        if ($request->worker_type_id) {
                            $q2->orWhere('scope_type', 'worker_type')
                                ->where('worker_type_id', $request->worker_type_id);
                        }
                    });
            })
            ->effective($date)
            ->priorityOrder()
            ->with('types.leaveType')
            ->get();

        return response()->json([
            'status' => true,
            'data' => $policies,
        ]);
    }
}