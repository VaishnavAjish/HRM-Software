<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimIntimation;
use App\Support\MediclaimActivityLogSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * `GET /intimations`, `POST /intimations/{intimation}/close` — the admin/HR
 * side of the "Notify Office" feature. Until this controller existed, an
 * employee's office intimation (`POST /me/intimations`) had no reachable
 * admin view at all: `IntimationController` (self-service) only ever
 * scopes `where('employee_user_id', $actor->id)`, so nothing an employee
 * submitted was ever visible anywhere in the admin web — this is the fix.
 *
 * `status` on `mediclaim_intimations` is a real column (unlike the
 * computed `mediclaimStatus` in `Admin\EmployeeController`), so filtering
 * and counting both happen in SQL rather than in-memory.
 *
 * Same known edge case `Admin\ClaimController` already flags: `ScopesCompany`
 * unconditionally applies `->where('unit', ...)` for a role=2 (unit-manager)
 * actor, and `mediclaim_intimations` has no `unit` column — pre-existing
 * trait assumption, not introduced here.
 */
class IntimationController extends Controller
{
    use ScopesCompany;
    use RespondsWithEnvelope;

    public function index(Request $request): JsonResponse
    {
        $query = MediclaimIntimation::query()
            ->with([
                'employee:id,name,email,emp_code,department,designation',
                'member:id,full_name,relationship_type',
                'hospital:id,name,city',
                'linkedClaim:id,claim_number,status',
                'reviewedBy:id,name',
            ]);

        $this->applyCompanyScope($query, $request);

        if ($request->filled('search')) {
            $search = (string) $request->query('search');
            $query->where(function ($q) use ($search) {
                $q->where('reference_number', 'like', "%{$search}%")
                    ->orWhere('planned_treatment', 'like', "%{$search}%")
                    ->orWhere('non_network_hospital_name', 'like', "%{$search}%")
                    ->orWhereHas('employee', function ($e) use ($search) {
                        $e->where('name', 'like', "%{$search}%")->orWhere('emp_code', 'like', "%{$search}%");
                    });
            });
        }

        if ($request->boolean('emergencyOnly') || $request->boolean('emergency_only')) {
            $query->where('is_emergency', true);
        }

        // Counted after search/emergency but before the status filter itself,
        // so each status tab's count reflects every other active filter
        // while staying stable as the admin switches between tabs — same
        // "live counts on the tab" convention as Admin\EmployeeController.
        $countsBase = (clone $query);
        $statusCounts = [
            'all' => (clone $countsBase)->count(),
            'recorded' => (clone $countsBase)->where('status', 'recorded')->count(),
            'linked' => (clone $countsBase)->where('status', 'linked')->count(),
            'closed' => (clone $countsBase)->where('status', 'closed')->count(),
        ];

        if ($request->filled('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        $paginated = $query->orderByDesc('id')->paginate(min((int) $request->query('per_page', 25), 100));

        return $this->ok([
            'data' => $paginated->items(),
            'total' => $paginated->total(),
            'current_page' => $paginated->currentPage(),
            'per_page' => $paginated->perPage(),
            'statusCounts' => $statusCounts,
        ]);
    }

    public function close(Request $request, int $intimation): JsonResponse
    {
        $query = MediclaimIntimation::query();
        $this->applyCompanyScope($query, $request);
        $model = $query->find($intimation);

        if (! $model) {
            return $this->missing('Intimation not found.');
        }

        $data = $request->validate([
            'remarks' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'status' => ['sometimes', Rule::in(['closed', 'recorded'])],
        ]);

        $actor = auth('api')->user();
        $before = $model->toArray();

        $model->update([
            'status' => $data['status'] ?? 'closed',
            'office_remarks' => $data['remarks'] ?? $model->office_remarks,
            'reviewed_by' => $actor?->id,
            'reviewed_at' => now(),
        ]);

        MediclaimActivityLogSupport::log(
            $actor,
            'INTIMATION_REVIEWED',
            'mediclaim_intimation',
            $model->id,
            $before,
            $model->fresh()->toArray(),
            'Office intimation reviewed.',
            $model->company_code
        );

        return $this->ok($model->fresh(['employee:id,name,email,emp_code,department,designation', 'member', 'hospital', 'linkedClaim:id,claim_number,status', 'reviewedBy:id,name']));
    }
}
