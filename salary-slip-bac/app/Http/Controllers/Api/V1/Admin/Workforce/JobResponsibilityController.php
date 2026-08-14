<?php

namespace App\Http\Controllers\Api\V1\Admin\Workforce;

use App\Http\Controllers\Controller;
use App\Services\JobArchitecture\JobResponsibilityService;
use App\Services\JobArchitecture\JobArchitectureException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * DOMAIN 03.01 — Job Responsibilities API.
 *
 * Manages structured responsibilities linked to jobs.
 * Multiple responsibilities per job with priority, percentage, competency, KPI/KRA linkage.
 */
class JobResponsibilityController extends Controller
{
    public function __construct(
        private readonly JobResponsibilityService $service,
    ) {
    }

    public function index(Request $request, int $jobId): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->responsibilities($jobId, [
                'asOf' => $request->query('as_of', $request->query('asOf')),
            ], auth('api')->user()),
        ]);
    }

    public function store(Request $request, int $jobId): JsonResponse
    {
        $data = $request->validate([
            'responsibility' => ['required', 'string'],
            'priority' => ['sometimes', 'integer', 'min:0'],
            'percentage' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'competencyId' => ['sometimes', 'nullable', 'integer'],
            'kpiLinkage' => ['sometimes', 'nullable', 'string', 'max:190'],
            'kraLinkage' => ['sometimes', 'nullable', 'string', 'max:190'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->create($jobId, $data, auth('api')->user())
            ),
        ], 201));
    }

    public function show(int $jobId, int $id): JsonResponse
    {
        $resp = \App\Models\JobResponsibility::query()->find($id);

        if (!$resp || $resp->job_id !== $jobId) {
            return $this->missing('Job responsibility not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present($resp),
        ]));
    }

    public function update(Request $request, int $jobId, int $id): JsonResponse
    {
        $resp = \App\Models\JobResponsibility::query()->find($id);

        if (!$resp || $resp->job_id !== $jobId) {
            return $this->missing('Job responsibility not found.');
        }

        $data = $request->validate([
            'responsibility' => ['sometimes', 'string'],
            'priority' => ['sometimes', 'integer', 'min:0'],
            'percentage' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'competencyId' => ['sometimes', 'nullable', 'integer'],
            'kpiLinkage' => ['sometimes', 'nullable', 'string', 'max:190'],
            'kraLinkage' => ['sometimes', 'nullable', 'string', 'max:190'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($resp, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $jobId, int $id): JsonResponse
    {
        $resp = \App\Models\JobResponsibility::query()->find($id);

        if (!$resp || $resp->job_id !== $jobId) {
            return $this->missing('Job responsibility not found.');
        }

        return $this->guarded(function () use ($resp) {
            $this->service->delete($resp, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $resp->id]]);
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
