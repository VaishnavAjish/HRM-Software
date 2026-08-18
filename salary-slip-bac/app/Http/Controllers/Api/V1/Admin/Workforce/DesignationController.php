<?php

namespace App\Http\Controllers\Api\V1\Admin\Workforce;

use App\Http\Controllers\Controller;
use App\Services\JobArchitecture\DesignationService;
use App\Services\JobArchitecture\JobArchitectureException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 03.01 — Designations API.
 *
 * Manages formal job titles within the architecture.
 * Distinct from Job: Designation is the formal title used in contracts, org charts, etc.
 * Links to Job Family, Function, Level, Grade.
 */
class DesignationController extends Controller
{
    public function __construct(
        private readonly DesignationService $service,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->designations([
                'enterpriseId' => $request->query('enterprise_id', $request->query('enterpriseId')),
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'jobFamilyId' => $request->query('job_family_id', $request->query('jobFamilyId')),
                'jobFunctionId' => $request->query('job_function_id', $request->query('jobFunctionId')),
                'jobLevelId' => $request->query('job_level_id', $request->query('jobLevelId')),
                'jobGradeId' => $request->query('job_grade_id', $request->query('jobGradeId')),
                'departmentId' => $request->query('department_id', $request->query('departmentId')),
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
            'jobFamilyId' => ['sometimes', 'nullable', 'integer', 'exists:job_families,id'],
            'jobFunctionId' => ['sometimes', 'nullable', 'integer', 'exists:job_functions,id'],
            'jobLevelId' => ['sometimes', 'nullable', 'integer', 'exists:job_levels,id'],
            'jobGradeId' => ['sometimes', 'nullable', 'integer', 'exists:job_grades,id'],
            'departmentId' => ['sometimes', 'nullable', 'integer', 'exists:departments,id'],
            'code' => ['sometimes', 'nullable', 'string', 'max:40'],
            'title' => ['required', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string'],
            'status' => ['sometimes', 'string', Rule::in(DesignationService::STATUSES)],
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
        $des = \App\Models\Designation::query()->find($id);

        if (!$des) {
            return $this->missing('Designation not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present($des),
        ]));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $des = \App\Models\Designation::query()->find($id);

        if (!$des) {
            return $this->missing('Designation not found.');
        }

        $data = $request->validate([
            'enterpriseId' => ['sometimes', 'nullable', 'integer', 'exists:enterprises,id'],
            'companyId' => ['sometimes', 'nullable', 'integer', 'exists:companies,id'],
            'jobFamilyId' => ['sometimes', 'nullable', 'integer', 'exists:job_families,id'],
            'jobFunctionId' => ['sometimes', 'nullable', 'integer', 'exists:job_functions,id'],
            'jobLevelId' => ['sometimes', 'nullable', 'integer', 'exists:job_levels,id'],
            'jobGradeId' => ['sometimes', 'nullable', 'integer', 'exists:job_grades,id'],
            'departmentId' => ['sometimes', 'nullable', 'integer', 'exists:departments,id'],
            'code' => ['sometimes', 'nullable', 'string', 'max:40'],
            'title' => ['sometimes', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string'],
            'status' => ['sometimes', 'string', Rule::in(DesignationService::STATUSES)],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($des, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $id): JsonResponse
    {
        $des = \App\Models\Designation::query()->find($id);

        if (!$des) {
            return $this->missing('Designation not found.');
        }

        return $this->guarded(function () use ($des) {
            $this->service->delete($des, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $des->id]]);
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
