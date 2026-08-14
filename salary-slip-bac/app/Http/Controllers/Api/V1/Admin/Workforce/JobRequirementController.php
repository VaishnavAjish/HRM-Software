<?php

namespace App\Http\Controllers\Api\V1\Admin\Workforce;

use App\Http\Controllers\Controller;
use App\Services\JobArchitecture\JobRequirementService;
use App\Services\JobArchitecture\JobArchitectureException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * DOMAIN 03.01 — Job Requirements API.
 *
 * Manages structured requirements for jobs.
 * Supports: Education, Experience, Skill, Certification, Competency, Language, Travel, Security Clearance.
 * Each requirement can be: mandatory, preferred, minimum, maximum.
 */
class JobRequirementController extends Controller
{
    public function __construct(
        private readonly JobRequirementService $service,
    ) {
    }

    public function index(Request $request, int $jobId): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->requirements($jobId, [
                'type' => $request->query('type'),
                'category' => $request->query('category'),
                'asOf' => $request->query('as_of', $request->query('asOf')),
            ], auth('api')->user()),
        ]);
    }

    public function store(Request $request, int $jobId): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'string', 'in:' . implode(',', \App\Models\JobRequirement::TYPES)],
            'requirement' => ['required', 'string', 'max:500'],
            'category' => ['sometimes', 'string', 'in:' . implode(',', \App\Models\JobRequirement::CATEGORIES)],
            'details' => ['sometimes', 'nullable', 'array'],
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
        $req = \App\Models\JobRequirement::query()->find($id);

        if (!$req || $req->job_id !== $jobId) {
            return $this->missing('Job requirement not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present($req),
        ]));
    }

    public function update(Request $request, int $jobId, int $id): JsonResponse
    {
        $req = \App\Models\JobRequirement::query()->find($id);

        if (!$req || $req->job_id !== $jobId) {
            return $this->missing('Job requirement not found.');
        }

        $data = $request->validate([
            'type' => ['sometimes', 'string', 'in:' . implode(',', \App\Models\JobRequirement::TYPES)],
            'requirement' => ['sometimes', 'string', 'max:500'],
            'category' => ['sometimes', 'string', 'in:' . implode(',', \App\Models\JobRequirement::CATEGORIES)],
            'details' => ['sometimes', 'nullable', 'array'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($req, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $jobId, int $id): JsonResponse
    {
        $req = \App\Models\JobRequirement::query()->find($id);

        if (!$req || $req->job_id !== $jobId) {
            return $this->missing('Job requirement not found.');
        }

        return $this->guarded(function () use ($req) {
            $this->service->delete($req, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $req->id]]);
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
