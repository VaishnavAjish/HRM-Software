<?php

namespace App\Http\Controllers\Api\V1\Admin\Workforce;

use App\Http\Controllers\Controller;
use App\Services\JobArchitecture\JobDescriptionService;
use App\Services\JobArchitecture\JobArchitectureException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 03.01 — Job Descriptions API.
 *
 * Manages versioned structured job descriptions.
 * Never overwrites historical job descriptions used by past employees or recruitment campaigns.
 */
class JobDescriptionController extends Controller
{
    public function __construct(
        private readonly JobDescriptionService $service,
    ) {
    }

    public function index(Request $request, int $jobId): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->descriptions($jobId, [
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]);
    }

    public function store(Request $request, int $jobId): JsonResponse
    {
        $data = $request->validate([
            'summary' => ['sometimes', 'nullable', 'string'],
            'purpose' => ['sometimes', 'nullable', 'string'],
            'responsibilities' => ['sometimes', 'nullable', 'string'],
            'qualifications' => ['sometimes', 'nullable', 'string'],
            'skills' => ['sometimes', 'nullable', 'string'],
            'competencies' => ['sometimes', 'nullable', 'string'],
            'experience' => ['sometimes', 'nullable', 'string'],
            'education' => ['sometimes', 'nullable', 'string'],
            'workConditions' => ['sometimes', 'nullable', 'string'],
            'travelRequirements' => ['sometimes', 'nullable', 'string'],
            'risk' => ['sometimes', 'nullable', 'string'],
            'remoteEligible' => ['sometimes', 'boolean'],
            'remoteEligibilityType' => ['sometimes', 'nullable', 'string', Rule::in(JobService::REMOTE_ELIGIBILITY_TYPES)],
            'remoteConditions' => ['sometimes', 'nullable', 'array'],
            'status' => ['sometimes', 'string', Rule::in(JobDescriptionService::STATUSES)],
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
        $desc = \App\Models\JobDescription::query()->find($id);

        if (!$desc || $desc->job_id !== $jobId) {
            return $this->missing('Job description not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present($desc),
        ]));
    }

    public function update(Request $request, int $jobId, int $id): JsonResponse
    {
        $desc = \App\Models\JobDescription::query()->find($id);

        if (!$desc || $desc->job_id !== $jobId) {
            return $this->missing('Job description not found.');
        }

        $data = $request->validate([
            'summary' => ['sometimes', 'nullable', 'string'],
            'purpose' => ['sometimes', 'nullable', 'string'],
            'responsibilities' => ['sometimes', 'nullable', 'string'],
            'qualifications' => ['sometimes', 'nullable', 'string'],
            'skills' => ['sometimes', 'nullable', 'string'],
            'competencies' => ['sometimes', 'nullable', 'string'],
            'experience' => ['sometimes', 'nullable', 'string'],
            'education' => ['sometimes', 'nullable', 'string'],
            'workConditions' => ['sometimes', 'nullable', 'string'],
            'travelRequirements' => ['sometimes', 'nullable', 'string'],
            'risk' => ['sometimes', 'nullable', 'string'],
            'remoteEligible' => ['sometimes', 'boolean'],
            'remoteEligibilityType' => ['sometimes', 'nullable', 'string', Rule::in(JobService::REMOTE_ELIGIBILITY_TYPES)],
            'remoteConditions' => ['sometimes', 'nullable', 'array'],
            'status' => ['sometimes', 'string', Rule::in(JobDescriptionService::STATUSES)],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
            'approvedBy' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($desc, $data, auth('api')->user())
            ),
        ]));
    }

    public function publish(int $jobId, int $id): JsonResponse
    {
        $desc = \App\Models\JobDescription::query()->find($id);

        if (!$desc || $desc->job_id !== $jobId) {
            return $this->missing('Job description not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->publish($desc, auth('api')->user())
            ),
        ]));
    }

    public function archive(int $jobId, int $id): JsonResponse
    {
        $desc = \App\Models\JobDescription::query()->find($id);

        if (!$desc || $desc->job_id !== $jobId) {
            return $this->missing('Job description not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->archive($desc, auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $jobId, int $id): JsonResponse
    {
        $desc = \App\Models\JobDescription::query()->find($id);

        if (!$desc || $desc->job_id !== $jobId) {
            return $this->missing('Job description not found.');
        }

        return $this->guarded(function () use ($desc) {
            $this->service->delete($desc, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $desc->id]]);
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
