<?php

namespace App\Http\Controllers\Api\V1\Admin\Workforce;

use App\Http\Controllers\Controller;
use App\Services\JobArchitecture\JobEvaluationService;
use App\Services\JobArchitecture\JobArchitectureException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * DOMAIN 03.01 — Job Evaluations API.
 *
 * Manages configurable job evaluation records.
 * Supports configurable factors: Responsibility, Complexity, Skills, Decision Making, Leadership, Impact, Experience, Risk.
 * Provides evaluation form, score, evaluator, review date, history, result.
 */
class JobEvaluationController extends Controller
{
    public function __construct(
        private readonly JobEvaluationService $service,
    ) {
    }

    public function index(Request $request, int $jobId): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->evaluations($jobId, [
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]);
    }

    public function store(Request $request, int $jobId): JsonResponse
    {
        $data = $request->validate([
            'evaluatorId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'factorScores' => ['sometimes', 'nullable', 'array'],
            'factorScores.*' => ['numeric', 'min:1', 'max:5'],
            'result' => ['sometimes', 'nullable', 'string', 'max:190'],
            'notes' => ['sometimes', 'nullable', 'string'],
            'reviewDate' => ['sometimes', 'nullable', 'date'],
            'status' => ['sometimes', 'string', 'in:' . implode(',', \App\Models\JobEvaluation::STATUSES)],
            'approvedBy' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
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
        $eval = \App\Models\JobEvaluation::query()->find($id);

        if (!$eval || $eval->job_id !== $jobId) {
            return $this->missing('Job evaluation not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present($eval),
        ]));
    }

    public function update(Request $request, int $jobId, int $id): JsonResponse
    {
        $eval = \App\Models\JobEvaluation::query()->find($id);

        if (!$eval || $eval->job_id !== $jobId) {
            return $this->missing('Job evaluation not found.');
        }

        $data = $request->validate([
            'evaluatorId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'factorScores' => ['sometimes', 'nullable', 'array'],
            'factorScores.*' => ['numeric', 'min:1', 'max:5'],
            'result' => ['sometimes', 'nullable', 'string', 'max:190'],
            'notes' => ['sometimes', 'nullable', 'string'],
            'reviewDate' => ['sometimes', 'nullable', 'date'],
            'status' => ['sometimes', 'string', 'in:' . implode(',', \App\Models\JobEvaluation::STATUSES)],
            'approvedBy' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($eval, $data, auth('api')->user())
            ),
        ]));
    }

    public function submit(int $jobId, int $id): JsonResponse
    {
        $eval = \App\Models\JobEvaluation::query()->find($id);

        if (!$eval || $eval->job_id !== $jobId) {
            return $this->missing('Job evaluation not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->submit($eval, auth('api')->user())
            ),
        ]));
    }

    public function approve(int $jobId, int $id): JsonResponse
    {
        $eval = \App\Models\JobEvaluation::query()->find($id);

        if (!$eval || $eval->job_id !== $jobId) {
            return $this->missing('Job evaluation not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->approve($eval, auth('api')->user())
            ),
        ]));
    }

    public function reject(int $jobId, int $id): JsonResponse
    {
        $eval = \App\Models\JobEvaluation::query()->find($id);

        if (!$eval || $eval->job_id !== $jobId) {
            return $this->missing('Job evaluation not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->reject($eval, auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $jobId, int $id): JsonResponse
    {
        $eval = \App\Models\JobEvaluation::query()->find($id);

        if (!$eval || $eval->job_id !== $jobId) {
            return $this->missing('Job evaluation not found.');
        }

        return $this->guarded(function () use ($eval) {
            $this->service->delete($eval, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $eval->id]]);
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
