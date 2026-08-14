<?php

namespace App\Http\Controllers\Api\V1\Admin\Workforce;

use App\Http\Controllers\Controller;
use App\Services\JobArchitecture\JobGradeService;
use App\Services\JobArchitecture\JobArchitectureException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 03.01 — Job Grades API.
 *
 * Manages compensation grades linked to job levels.
 * Integrates with Payroll, Compensation, Promotion, Benefits, Workforce Planning.
 */
class JobGradeController extends Controller
{
    public function __construct(
        private readonly JobGradeService $service,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->grades([
                'enterpriseId' => $request->query('enterprise_id', $request->query('enterpriseId')),
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'jobLevelId' => $request->query('job_level_id', $request->query('jobLevelId')),
                'search' => $request->query('search'),
                'status' => $request->query('status'),
                'asOf' => $request->query('as_of', $request->query('asOf')),
                'includeInactive' => $request->boolean('include_inactive', $request->boolean('includeInactive')),
            ], auth('api')->user()),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enterpriseId' => ['sometimes', 'nullable', 'integer', 'exists:enterprises,id'],
            'companyId' => ['required', 'integer', 'exists:companies,id'],
            'jobLevelId' => ['sometimes', 'nullable', 'integer', 'exists:job_levels,id'],
            'code' => ['sometimes', 'nullable', 'string', 'max:20'],
            'name' => ['required', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string'],
            'currency' => ['sometimes', 'string', 'size:3'],
            'minSalary' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'midSalary' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'maxSalary' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'eligibilityRules' => ['sometimes', 'nullable', 'array'],
            'status' => ['sometimes', 'string', Rule::in(JobGradeService::STATUSES)],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->create($data, auth('api')->user())
            ),
        ], 201));
    }

    public function show(int $id): JsonResponse
    {
        $grade = \App\Models\JobGrade::query()->find($id);

        if (!$grade) {
            return $this->missing('Job grade not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present($grade),
        ]));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $grade = \App\Models\JobGrade::query()->find($id);

        if (!$grade) {
            return $this->missing('Job grade not found.');
        }

        $data = $request->validate([
            'enterpriseId' => ['sometimes', 'nullable', 'integer', 'exists:enterprises,id'],
            'companyId' => ['sometimes', 'nullable', 'integer', 'exists:companies,id'],
            'jobLevelId' => ['sometimes', 'nullable', 'integer', 'exists:job_levels,id'],
            'code' => ['sometimes', 'nullable', 'string', 'max:20'],
            'name' => ['sometimes', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string'],
            'currency' => ['sometimes', 'string', 'size:3'],
            'minSalary' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'midSalary' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'maxSalary' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'eligibilityRules' => ['sometimes', 'nullable', 'array'],
            'status' => ['sometimes', 'string', Rule::in(JobGradeService::STATUSES)],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($grade, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $id): JsonResponse
    {
        $grade = \App\Models\JobGrade::query()->find($id);

        if (!$grade) {
            return $this->missing('Job grade not found.');
        }

        return $this->guarded(function () use ($grade) {
            $this->service->delete($grade, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $grade->id]]);
        });
    }

    private function guarded(callable $run): JsonResponse
    {
        try {
            return $run();
        } catch (JobArchitectureException $e) {
            return response()->json([
                'success' => false,
                'error' => ['code' => $e->errorCode, 'message' => $e->getMessage()],
            ], $e->getCode());
        }
    }

    private function missing(string $message): JsonResponse
    {
        return response()->json([
            'success' => false,
            'error' => ['code' => 'NOT_FOUND', 'message' => $message],
        ], 404);
    }
}
