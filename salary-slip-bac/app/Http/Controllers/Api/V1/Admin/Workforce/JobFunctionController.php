<?php

namespace App\Http\Controllers\Api\V1\Admin\Workforce;

use App\Http\Controllers\Controller;
use App\Services\JobArchitecture\JobFunctionService;
use App\Services\JobArchitecture\JobArchitectureException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 03.01 — Job Functions API.
 *
 * Manages functional classification of jobs (HR, Finance, IT, Operations, etc.).
 */
class JobFunctionController extends Controller
{
    public function __construct(
        private readonly JobFunctionService $service,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->functions([
                'enterpriseId' => $request->query('enterprise_id', $request->query('enterpriseId')),
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
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
            'code' => ['sometimes', 'nullable', 'string', 'max:40'],
            'name' => ['required', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string'],
            'status' => ['sometimes', 'string', Rule::in(JobFunctionService::STATUSES)],
            'sortOrder' => ['sometimes', 'integer', 'min:0'],
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
        $fn = \App\Models\JobFunction::query()->find($id);

        if (!$fn) {
            return $this->missing('Job function not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present($fn),
        ]));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $fn = \App\Models\JobFunction::query()->find($id);

        if (!$fn) {
            return $this->missing('Job function not found.');
        }

        $data = $request->validate([
            'enterpriseId' => ['sometimes', 'nullable', 'integer', 'exists:enterprises,id'],
            'companyId' => ['sometimes', 'nullable', 'integer', 'exists:companies,id'],
            'code' => ['sometimes', 'nullable', 'string', 'max:40'],
            'name' => ['sometimes', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string'],
            'status' => ['sometimes', 'string', Rule::in(JobFunctionService::STATUSES)],
            'sortOrder' => ['sometimes', 'integer', 'min:0'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($fn, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $id): JsonResponse
    {
        $fn = \App\Models\JobFunction::query()->find($id);

        if (!$fn) {
            return $this->missing('Job function not found.');
        }

        return $this->guarded(function () use ($fn) {
            $this->service->delete($fn, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $fn->id]]);
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
