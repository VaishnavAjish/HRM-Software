<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimEnrollment;
use App\Support\MediclaimActivityLogSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** `GET,POST /enrollments`. */
class EnrollmentController extends Controller
{
    use ScopesCompany;
    use RespondsWithEnvelope;

    public function index(Request $request): JsonResponse
    {
        $query = MediclaimEnrollment::query()->with(['employee:id,name,email,emp_code', 'policyVersion.policy']);
        $this->applyCompanyScope($query, $request);

        if ($request->filled('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        if ($request->filled('employee_id')) {
            $query->where('employee_user_id', (int) $request->query('employee_id'));
        }

        return $this->ok($query->orderByDesc('id')->paginate(min((int) $request->query('per_page', 25), 100)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_user_id' => ['required', 'integer', 'exists:users,id'],
            'policy_version_id' => ['required', 'integer', 'exists:mediclaim_policy_versions,id'],
            'company_code' => ['required', 'string', 'max:60'],
            'status' => ['sometimes', Rule::in(MediclaimEnrollment::STATUSES)],
            'enrolled_at' => ['sometimes', 'nullable', 'date'],
        ]);

        $actor = auth('api')->user();

        $enrollment = MediclaimEnrollment::create($data + [
            'status' => $data['status'] ?? 'active',
            'enrolled_at' => $data['enrolled_at'] ?? now()->toDateString(),
        ]);

        MediclaimActivityLogSupport::log($actor, 'ENROLLMENT_CREATED', 'mediclaim_enrollment', $enrollment->id, null, $enrollment->toArray(), 'Enrollment created.', $enrollment->company_code);

        return $this->ok($enrollment->fresh(['employee:id,name,email,emp_code', 'policyVersion.policy']), 201);
    }

    public function update(Request $request, int $enrollment): JsonResponse
    {
        $model = $this->scoped($request, $enrollment);

        if (! $model) {
            return $this->missing('Enrollment not found.');
        }

        $data = $request->validate([
            'status' => ['sometimes', Rule::in(MediclaimEnrollment::STATUSES)],
            'terminated_at' => ['sometimes', 'nullable', 'date'],
        ]);

        $actor = auth('api')->user();
        $before = $model->toArray();

        $model->fill($data);
        $model->save();

        MediclaimActivityLogSupport::log($actor, 'ENROLLMENT_UPDATED', 'mediclaim_enrollment', $model->id, $before, $model->fresh()->toArray(), 'Enrollment updated.', $model->company_code);

        return $this->ok($model->fresh(['employee:id,name,email,emp_code', 'policyVersion.policy']));
    }

    private function scoped(Request $request, int $id): ?MediclaimEnrollment
    {
        $query = MediclaimEnrollment::query()->where('id', $id);
        $this->applyCompanyScope($query, $request);

        return $query->first();
    }
}
