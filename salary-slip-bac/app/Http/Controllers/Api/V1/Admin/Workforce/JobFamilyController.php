<?php

namespace App\Http\Controllers\Api\V1\Admin\Workforce;

use App\Http\Controllers\Controller;
use App\Services\JobArchitecture\JobFamilyService;
use App\Services\JobArchitecture\JobArchitectureException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 03.01 — Job Families API.
 *
 * Manages groups of related jobs within a function.
 * Example: Technology → Software Engineering, Data, Infrastructure, Cyber Security.
 */
class JobFamilyController extends Controller
{
    public function __construct(
        private readonly JobFamilyService $service,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->families([
                'enterpriseId' => $request->query('enterprise_id', $request->query('enterpriseId')),
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'jobFunctionId' => $request->query('job_function_id', $request->query('jobFunctionId')),
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
            'jobFunctionId' => ['sometimes', 'nullable', 'integer', 'exists:job_functions,id'],
            'code' => ['sometimes', 'nullable', 'string', 'max:40'],
            'name' => ['required', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string'],
            'status' => ['sometimes', 'string', Rule::in(JobFamilyService::STATUSES)],
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
        $fam = \App\Models\JobFamily::query()->find($id);

        if (!$fam) {
            return $this->missing('Job family not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present($fam),
        ]));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $fam = \App\Models\JobFamily::query()->find($id);

        if (!$fam) {
            return $this->missing('Job family not found.');
        }

        $data = $request->validate([
            'enterpriseId' => ['sometimes', 'nullable', 'integer', 'exists:enterprises,id'],
            'companyId' => ['sometimes', 'nullable', 'integer', 'exists:companies,id'],
            'jobFunctionId' => ['sometimes', 'nullable', 'integer', 'exists:job_functions,id'],
            'code' => ['sometimes', 'nullable', 'string', 'max:40'],
            'name' => ['sometimes', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string'],
            'status' => ['sometimes', 'string', Rule::in(JobFamilyService::STATUSES)],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($fam, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $id): JsonResponse
    {
        $fam = \App\Models\JobFamily::query()->find($id);

        if (!$fam) {
            return $this->missing('Job family not found.');
        }

        return $this->guarded(function () use ($fam) {
            $this->service->delete($fam, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $fam->id]]);
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
