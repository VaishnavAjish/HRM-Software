<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\AuthorizesEmployeeTarget;
use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Models\EmployeeResignation;
use App\Models\User;
use Illuminate\Http\Request;

class ExitManagementController extends Controller
{
    use AuthorizesEmployeeTarget;
    use ScopesCompany;

    private const STATUSES = ['submitted', 'approved', 'notice_period', 'cleared', 'exited', 'withdrawn'];
    private const DEFAULT_NOTICE_DAYS = 30;

    public function index(Request $request)
    {
        // Identity columns only. The unconstrained relation returned the whole
        // employee record for every resignation in the list.
        $query = EmployeeResignation::with(['user:id,name,emp_code', 'approvedBy:id,name']);
        $this->applyCompanyScope($query, $request);
        if ($request->status) {
            $query->whereIn('status', explode(',', $request->status));
        }

        $resignations = $query->orderByDesc('id')->paginate($request->per_page ?? 25);

        return response()->json(['status' => true, 'data' => $resignations]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'user_id' => 'required|exists:users,id',
            'reason' => 'required|string',
            'resignation_date' => 'required|date',
            'last_working_day' => 'nullable|date|after_or_equal:resignation_date',
            'notice_period_days' => 'nullable|integer|min:0|max:365',
            'notes' => 'nullable|string',
        ]);

        // Checked before any write. This endpoint also stamps
        // users.resignation_date on the target, so an unscoped user_id was a
        // cross-company write, not merely a disclosure.
        if ($denied = $this->denyUnlessEmployeeInScope($data['user_id'])) {
            return $denied;
        }

        $hasOpenResignation = EmployeeResignation::where('user_id', $data['user_id'])
            ->where('status', '!=', 'withdrawn')
            ->exists();
        if ($hasOpenResignation) {
            return response()->json(['status' => false, 'message' => 'This employee already has a resignation on record'], 422);
        }

        $noticeDays = (int) ($data['notice_period_days'] ?? self::DEFAULT_NOTICE_DAYS);
        $lastWorkingDay = $data['last_working_day'] ?? now()->parse($data['resignation_date'])->addDays($noticeDays)->toDateString();

        $context = $this->defaultCompanyContext($request);
        $resignation = EmployeeResignation::create($data + [
            'notice_period_days' => $noticeDays,
            'last_working_day' => $lastWorkingDay,
            'status' => 'submitted',
            'company_code' => $context['company_code'],
            'unit' => $context['unit'],
            'created_by' => auth('api')->id(),
        ]);

        // Feeds the existing dashboard/report queries that already read
        // users.resignation_date, without needing a second data source.
        User::where('id', $data['user_id'])->update(['resignation_date' => $lastWorkingDay]);

        return response()->json(['status' => true, 'message' => 'Resignation recorded', 'data' => $resignation], 201);
    }

    public function updateStatus(Request $request, $id)
    {
        $resignation = EmployeeResignation::find($id);
        if (!$resignation) {
            return response()->json(['status' => false, 'message' => 'Resignation not found'], 404);
        }

        $data = $request->validate([
            'status' => 'required|in:' . implode(',', self::STATUSES),
            'notes' => 'nullable|string',
        ]);

        // The resignation is reached by its own id, so both it and the employee
        // it belongs to must be in scope — otherwise another company's
        // resignation could be approved or withdrawn through this route, and
        // withdrawing clears users.resignation_date on that employee.
        if ($denied = $this->denyUnlessRecordInScope($resignation)) {
            return $denied;
        }

        if ($denied = $this->denyUnlessEmployeeInScope($resignation->user_id)) {
            return $denied;
        }

        $update = ['status' => $data['status']];
        if (array_key_exists('notes', $data)) {
            $update['notes'] = $data['notes'];
        }
        if ($data['status'] === 'approved') {
            $update['approved_by'] = auth('api')->id();
            $update['approved_at'] = now();
        }

        $resignation->update($update);

        // Withdrawing a resignation should un-flag the employee everywhere
        // else that reads users.resignation_date.
        if ($data['status'] === 'withdrawn') {
            User::where('id', $resignation->user_id)->update(['resignation_date' => null]);
        }

        return response()->json(['status' => true, 'message' => 'Status updated', 'data' => $resignation]);
    }
}
