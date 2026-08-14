<?php

namespace App\Http\Controllers\Api\V1\Admin\Organization;

use App\Http\Controllers\Controller;
use App\Models\OrganizationLeadershipAssignment;
use App\Models\ReportingRelationship;
use App\Services\Organization\ReportingStructureService;
use App\Services\Provisioning\ProvisioningException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 02.07 — Reporting Structure.
 *
 * Reporting relationships (primary + secondary/functional/project/matrix), the
 * upward reporting chain, and leadership assignments. Routes carry
 * permission:org.reporting.*; the service owns one-active-primary and
 * cross-scope rules.
 */
class ReportingStructureController extends Controller
{
    public function __construct(
        private readonly ReportingStructureService $service,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->relationships([
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'employeeId' => $request->query('employee_id', $request->query('employeeId')),
                'managerId' => $request->query('manager_id', $request->query('managerId')),
                'relationshipType' => $request->query('relationship_type', $request->query('relationshipType')),
                'status' => $request->query('status'),
                'asOf' => $request->query('as_of', $request->query('asOf')),
                'includeInactive' => $request->query('include_inactive', $request->query('includeInactive')),
            ], auth('api')->user()),
        ]));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employeeId' => ['required', 'integer', 'exists:users,id'],
            'managerId' => ['required', 'integer', 'exists:users,id'],
            'companyId' => ['sometimes', 'nullable', 'integer', 'exists:companies,id'],
            'relationshipType' => ['sometimes', 'string', Rule::in(ReportingStructureService::RELATIONSHIP_TYPES)],
            'effectiveFrom' => ['required', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
            'isActive' => ['sometimes', 'boolean'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->create($data, auth('api')->user())
            ),
        ], 201));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $rel = ReportingRelationship::query()->find($id);

        if (! $rel) {
            return $this->missing('Reporting relationship not found.');
        }

        $data = $request->validate([
            'managerId' => ['sometimes', 'integer', 'exists:users,id'],
            'relationshipType' => ['sometimes', 'string', Rule::in(ReportingStructureService::RELATIONSHIP_TYPES)],
            'effectiveFrom' => ['sometimes', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
            'isActive' => ['sometimes', 'boolean'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($rel, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $id): JsonResponse
    {
        $rel = ReportingRelationship::query()->find($id);

        if (! $rel) {
            return $this->missing('Reporting relationship not found.');
        }

        return $this->guarded(function () use ($rel) {
            $this->service->delete($rel, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $rel->id]]);
        });
    }

    public function chain(Request $request, int $employeeId): JsonResponse
    {
        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->chain(
                $employeeId,
                $request->query('as_of', $request->query('asOf')),
                auth('api')->user()
            ),
        ]));
    }

    /* ------------------------------------------------------ leadership assignments */

    public function leadershipAssignments(Request $request): JsonResponse
    {
        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->leadershipAssignments([
                'enterpriseId' => $request->query('enterprise_id', $request->query('enterpriseId')),
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'userId' => $request->query('user_id', $request->query('userId')),
                'leadershipType' => $request->query('leadership_type', $request->query('leadershipType')),
                'status' => $request->query('status'),
                'asOf' => $request->query('as_of', $request->query('asOf')),
                'includeInactive' => $request->query('include_inactive', $request->query('includeInactive')),
            ], auth('api')->user()),
        ]));
    }

    public function storeLeadershipAssignment(Request $request): JsonResponse
    {
        $data = $request->validate([
            'userId' => ['required', 'integer', 'exists:users,id'],
            'enterpriseId' => ['sometimes', 'nullable', 'integer', 'exists:enterprises,id'],
            'companyId' => ['sometimes', 'nullable', 'integer', 'exists:companies,id'],
            'scopeId' => ['required', 'integer'],
            'scopeType' => ['required', 'string', Rule::in(['department', 'organization_unit', 'organization_location', 'financial_organization'])],
            'leadershipType' => ['required', 'string', Rule::in(ReportingStructureService::LEADERSHIP_TYPES)],
            'effectiveFrom' => ['required', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
            'isActive' => ['sometimes', 'boolean'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentLeadership(
                $this->service->createLeadershipAssignment($data, auth('api')->user())
            ),
        ], 201));
    }

    public function updateLeadershipAssignment(Request $request, int $id): JsonResponse
    {
        $assignment = OrganizationLeadershipAssignment::query()->find($id);

        if (! $assignment) {
            return $this->missing('Leadership assignment not found.');
        }

        $data = $request->validate([
            'leadershipType' => ['sometimes', 'string', Rule::in(ReportingStructureService::LEADERSHIP_TYPES)],
            'scopeId' => ['sometimes', 'integer'],
            'scopeType' => ['sometimes', 'string', Rule::in(['department', 'organization_unit', 'organization_location', 'financial_organization'])],
            'effectiveFrom' => ['sometimes', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
            'isActive' => ['sometimes', 'boolean'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentLeadership(
                $this->service->updateLeadershipAssignment($assignment, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroyLeadershipAssignment(int $id): JsonResponse
    {
        $assignment = OrganizationLeadershipAssignment::query()->find($id);

        if (! $assignment) {
            return $this->missing('Leadership assignment not found.');
        }

        return $this->guarded(function () use ($assignment) {
            $this->service->deleteLeadershipAssignment($assignment, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $assignment->id]]);
        });
    }

    /* ----------------------------------------------------------------- helpers */

    private function guarded(callable $run): JsonResponse
    {
        try {
            return $run();
        } catch (ProvisioningException $e) {
            return response()->json([
                'success' => false,
                'error' => ['code' => $e->errorCode, 'message' => $e->getMessage()],
            ], $e->status);
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
