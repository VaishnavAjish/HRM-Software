<?php

namespace App\Http\Controllers\Api\V1\Admin\Workforce;

use App\Http\Controllers\Controller;
use App\Services\JobArchitecture\JobService;
use App\Services\JobArchitecture\JobArchitectureException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 03.01 — Jobs API.
 *
 * Manages the core job master.
 * Defines "what work is this?" — distinct from Position which defines "where does a seat exist?"
 * Links to Job Family, Function, Category, Level, Grade, Designation.
 * Supports Job Codes (auto-gen + manual), multiple titles, effective dating.
 */
class JobController extends Controller
{
    public function __construct(
        private readonly JobService $service,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->jobs([
                'enterpriseId' => $request->query('enterprise_id', $request->query('enterpriseId')),
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'jobFamilyId' => $request->query('job_family_id', $request->query('jobFamilyId')),
                'jobFunctionId' => $request->query('job_function_id', $request->query('jobFunctionId')),
                'jobCategoryId' => $request->query('job_category_id', $request->query('jobCategoryId')),
                'jobLevelId' => $request->query('job_level_id', $request->query('jobLevelId')),
                'jobGradeId' => $request->query('job_grade_id', $request->query('jobGradeId')),
                'designationId' => $request->query('designation_id', $request->query('designationId')),
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
            'jobCategoryId' => ['sometimes', 'nullable', 'integer', 'exists:job_categories,id'],
            'jobLevelId' => ['sometimes', 'nullable', 'integer', 'exists:job_levels,id'],
            'jobGradeId' => ['sometimes', 'nullable', 'integer', 'exists:job_grades,id'],
            'designationId' => ['sometimes', 'nullable', 'integer', 'exists:designations,id'],
            'code' => ['sometimes', 'nullable', 'string', 'max:60'],
            'formalTitle' => ['required', 'string', 'max:190'],
            'displayTitle' => ['sometimes', 'nullable', 'string', 'max:190'],
            'internalTitle' => ['sometimes', 'nullable', 'string', 'max:190'],
            'externalTitle' => ['sometimes', 'nullable', 'string', 'max:190'],
            'localizedTitles' => ['sometimes', 'nullable', 'array'],
            'summary' => ['sometimes', 'nullable', 'string'],
            'purpose' => ['sometimes', 'nullable', 'string'],
            'status' => ['sometimes', 'string', Rule::in(JobService::STATUSES)],
            'employmentType' => ['sometimes', 'nullable', 'string', Rule::in(JobService::EMPLOYMENT_TYPES)],
            'isRemoteEligible' => ['sometimes', 'boolean'],
            'remoteEligibilityType' => ['sometimes', 'nullable', 'string', Rule::in(JobService::REMOTE_ELIGIBILITY_TYPES)],
            'remoteConditions' => ['sometimes', 'nullable', 'array'],
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
        $job = \App\Models\Job::query()->find($id);

        if (!$job) {
            return $this->missing('Job not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present($job),
        ]));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $job = \App\Models\Job::query()->find($id);

        if (!$job) {
            return $this->missing('Job not found.');
        }

        $data = $request->validate([
            'enterpriseId' => ['sometimes', 'nullable', 'integer', 'exists:enterprises,id'],
            'companyId' => ['sometimes', 'nullable', 'integer', 'exists:companies,id'],
            'jobFamilyId' => ['sometimes', 'nullable', 'integer', 'exists:job_families,id'],
            'jobFunctionId' => ['sometimes', 'nullable', 'integer', 'exists:job_functions,id'],
            'jobCategoryId' => ['sometimes', 'nullable', 'integer', 'exists:job_categories,id'],
            'jobLevelId' => ['sometimes', 'nullable', 'integer', 'exists:job_levels,id'],
            'jobGradeId' => ['sometimes', 'nullable', 'integer', 'exists:job_grades,id'],
            'designationId' => ['sometimes', 'nullable', 'integer', 'exists:designations,id'],
            'code' => ['sometimes', 'nullable', 'string', 'max:60'],
            'formalTitle' => ['sometimes', 'string', 'max:190'],
            'displayTitle' => ['sometimes', 'nullable', 'string', 'max:190'],
            'internalTitle' => ['sometimes', 'nullable', 'string', 'max:190'],
            'externalTitle' => ['sometimes', 'nullable', 'string', 'max:190'],
            'localizedTitles' => ['sometimes', 'nullable', 'array'],
            'summary' => ['sometimes', 'nullable', 'string'],
            'purpose' => ['sometimes', 'nullable', 'string'],
            'status' => ['sometimes', 'string', Rule::in(JobService::STATUSES)],
            'employmentType' => ['sometimes', 'nullable', 'string', Rule::in(JobService::EMPLOYMENT_TYPES)],
            'isRemoteEligible' => ['sometimes', 'boolean'],
            'remoteEligibilityType' => ['sometimes', 'nullable', 'string', Rule::in(JobService::REMOTE_ELIGIBILITY_TYPES)],
            'remoteConditions' => ['sometimes', 'nullable', 'array'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($job, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $id): JsonResponse
    {
        $job = \App\Models\Job::query()->find($id);

        if (!$job) {
            return $this->missing('Job not found.');
        }

        return $this->guarded(function () use ($job) {
            $this->service->delete($job, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $job->id]]);
        });
    }

    public function clone(Request $request, int $id): JsonResponse
    {
        $job = \App\Models\Job::query()->find($id);

        if (!$job) {
            return $this->missing('Job not found.');
        }

        $data = $request->validate([
            'code' => ['sometimes', 'nullable', 'string', 'max:60'],
            'formalTitle' => ['sometimes', 'string', 'max:190'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->clone($job, $data, auth('api')->user())
            ),
        ], 201));
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
