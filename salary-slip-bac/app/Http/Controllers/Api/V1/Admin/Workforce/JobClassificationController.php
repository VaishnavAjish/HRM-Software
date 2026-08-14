<?php

namespace App\Http\Controllers\Api\V1\Admin\Workforce;

use App\Http\Controllers\Controller;
use App\Services\JobArchitecture\JobClassificationService;
use App\Services\JobArchitecture\JobArchitectureException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * DOMAIN 03.01 — Job Classifications API.
 *
 * Manages compliance and regulatory classifications.
 * Supports: Job Class, Worker Class, Employee Group, Job Type, Occupational Category, Compliance Classification.
 */
class JobClassificationController extends Controller
{
    public function __construct(
        private readonly JobClassificationService $service,
    ) {
    }

    public function show(int $jobId): JsonResponse
    {
        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->classification($jobId, auth('api')->user()),
        ]));
    }

    public function store(Request $request, int $jobId): JsonResponse
    {
        $data = $request->validate([
            'jobClass' => ['sometimes', 'nullable', 'string', 'max:100'],
            'workerClass' => ['sometimes', 'nullable', 'string', 'max:100'],
            'employeeGroup' => ['sometimes', 'nullable', 'string', 'max:100'],
            'jobType' => ['sometimes', 'nullable', 'string', 'max:100'],
            'occupationalCategory' => ['sometimes', 'nullable', 'string', 'max:100'],
            'complianceClassification' => ['sometimes', 'nullable', 'string', 'max:100'],
            'additionalClassifications' => ['sometimes', 'nullable', 'array'],
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

    public function update(Request $request, int $jobId): JsonResponse
    {
        $job = \App\Models\Job::query()->findOrFail($jobId);
        $classification = $job->classification;

        if (!$classification) {
            return $this->missing('Job classification not found.');
        }

        $data = $request->validate([
            'jobClass' => ['sometimes', 'nullable', 'string', 'max:100'],
            'workerClass' => ['sometimes', 'nullable', 'string', 'max:100'],
            'employeeGroup' => ['sometimes', 'nullable', 'string', 'max:100'],
            'jobType' => ['sometimes', 'nullable', 'string', 'max:100'],
            'occupationalCategory' => ['sometimes', 'nullable', 'string', 'max:100'],
            'complianceClassification' => ['sometimes', 'nullable', 'string', 'max:100'],
            'additionalClassifications' => ['sometimes', 'nullable', 'array'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($classification, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $jobId): JsonResponse
    {
        $job = \App\Models\Job::query()->findOrFail($jobId);
        $classification = $job->classification;

        if (!$classification) {
            return $this->missing('Job classification not found.');
        }

        return $this->guarded(function () use ($classification) {
            $this->service->delete($classification, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $classification->id]]);
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
