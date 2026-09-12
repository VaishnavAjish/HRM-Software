<?php

namespace App\Http\Controllers\Api\V1\Admin\Organization;

use App\Http\Controllers\Controller;
use App\Models\EmployeeOrganizationAssignment;
use App\Models\OrganizationPosition;
use App\Models\OrganizationUnit;
use App\Services\Organization\OrganizationUnitService;
use App\Services\Provisioning\ProvisioningException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 02.03 — Organization Units.
 *
 * Units, positions and employee assignments. Routes carry permission:org.unit.*;
 * the service owns tenancy, code-uniqueness, parent-cycle and primary rules.
 */
class OrganizationUnitController extends Controller
{
    public function __construct(
        private readonly OrganizationUnitService $service,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->units([
                'enterpriseId' => $request->query('enterprise_id', $request->query('enterpriseId')),
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'search' => $request->query('search'),
                'type' => $request->query('type'),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]);
    }

    public function options(Request $request): JsonResponse
    {
        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->treeOptions([
                'enterpriseId' => $request->query('enterprise_id', $request->query('enterpriseId')),
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'search' => $request->query('search'),
            ], auth('api')->user()),
        ]));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->unitRules());

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->create($data, auth('api')->user())
            ),
        ], 201));
    }

    public function show(int $id): JsonResponse
    {
        $unit = OrganizationUnit::query()->find($id);

        if (! $unit) {
            return $this->missing('Organization unit not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present($unit),
        ]));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $unit = OrganizationUnit::query()->find($id);

        if (! $unit) {
            return $this->missing('Organization unit not found.');
        }

        $data = $request->validate($this->unitRules(true));

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($unit, $data, auth('api')->user())
            ),
        ]));
    }

    public function setStatus(Request $request, int $id): JsonResponse
    {
        $unit = OrganizationUnit::query()->find($id);

        if (! $unit) {
            return $this->missing('Organization unit not found.');
        }

        $data = $request->validate(['status' => ['required', 'string', Rule::in(OrganizationUnit::STATUSES)]]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->setStatus($unit, $data['status'], auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $id): JsonResponse
    {
        $unit = OrganizationUnit::query()->find($id);

        if (! $unit) {
            return $this->missing('Organization unit not found.');
        }

        return $this->guarded(function () use ($unit) {
            $this->service->delete($unit, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $unit->id]]);
        });
    }

    public function syncLegacyDepartments(): JsonResponse
    {
        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->syncFromLegacyDepartments(auth('api')->user()),
        ]));
    }

    /* ------------------------------------------------------------- positions */

    public function positions(Request $request, int $unitId): JsonResponse
    {
        if (! $this->unitExists($unitId)) {
            return $this->missing('Organization unit not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->positions($unitId, [
                'search' => $request->query('search'),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]));
    }

    public function storePosition(Request $request, int $unitId): JsonResponse
    {
        $this->service->ensureSchema();

        if (! $this->unitExists($unitId)) {
            return $this->missing('Organization unit not found.');
        }

        $data = $request->validate([
            'reportsToPositionId' => ['sometimes', 'nullable', 'integer'],
            'code' => ['sometimes', 'nullable', 'string', 'max:60'],
            'title' => ['required', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'approvedHeadcount' => ['sometimes', 'integer', 'min:0'],
            'budgetedHeadcount' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'status' => ['sometimes', 'string', Rule::in(OrganizationPosition::STATUSES)],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentPosition(
                $this->service->createPosition($unitId, $data, auth('api')->user())
            ),
        ], 201));
    }

    public function updatePosition(Request $request, int $unitId, int $id): JsonResponse
    {
        $position = OrganizationPosition::query()->find($id);

        if (! $position) {
            return $this->missing('Position not found.');
        }

        $data = $request->validate([
            'reportsToPositionId' => ['sometimes', 'nullable', 'integer'],
            'code' => ['sometimes', 'nullable', 'string', 'max:60'],
            'title' => ['sometimes', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'approvedHeadcount' => ['sometimes', 'integer', 'min:0'],
            'budgetedHeadcount' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'status' => ['sometimes', 'string', Rule::in(OrganizationPosition::STATUSES)],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentPosition(
                $this->service->updatePosition($position, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroyPosition(int $unitId, int $id): JsonResponse
    {
        $position = OrganizationPosition::query()->find($id);

        if (! $position) {
            return $this->missing('Position not found.');
        }

        return $this->guarded(function () use ($position) {
            $this->service->deletePosition($position, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $position->id]]);
        });
    }

    public function freezePosition(Request $request, int $unitId, int $id): JsonResponse
    {
        $position = OrganizationPosition::query()->find($id);

        if (! $position) {
            return $this->missing('Position not found.');
        }

        $data = $request->validate([
            'reason' => ['required', 'string', 'min:3', 'max:500'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentPosition(
                $this->service->freezePosition($position, $data['reason'], auth('api')->user())
            ),
        ]));
    }

    public function releasePosition(int $unitId, int $id): JsonResponse
    {
        $position = OrganizationPosition::query()->find($id);

        if (! $position) {
            return $this->missing('Position not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentPosition(
                $this->service->releasePosition($position, auth('api')->user())
            ),
        ]));
    }

    /**
     * Standalone designations — created directly, the same simple way a
     * Department itself is (just a title, nothing mandatory nested under
     * it), rather than requiring a department to be picked/expanded first.
     * update/destroy/freeze/release below reuse the same-named unit-scoped
     * methods above with a dummy unitId: those methods already resolve and
     * act on the position purely by its own id and never actually use the
     * unitId argument beyond routing, so a standalone position works there
     * unchanged.
     */
    public function globalPositions(Request $request): JsonResponse
    {
        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->globalPositions([
                'search' => $request->query('search'),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]));
    }

    public function storeGlobalPosition(Request $request): JsonResponse
    {
        $this->service->ensureSchema();

        $data = $request->validate([
            'reportsToPositionId' => ['sometimes', 'nullable', 'integer'],
            'code' => ['sometimes', 'nullable', 'string', 'max:60'],
            'title' => ['required', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'approvedHeadcount' => ['sometimes', 'integer', 'min:0'],
            'budgetedHeadcount' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'status' => ['sometimes', 'string', Rule::in(OrganizationPosition::STATUSES)],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentPosition(
                $this->service->createPosition(null, $data, auth('api')->user())
            ),
        ], 201));
    }

    public function updateGlobalPosition(Request $request, int $id): JsonResponse
    {
        return $this->updatePosition($request, 0, $id);
    }

    public function destroyGlobalPosition(int $id): JsonResponse
    {
        return $this->destroyPosition(0, $id);
    }

    public function freezeGlobalPosition(Request $request, int $id): JsonResponse
    {
        return $this->freezePosition($request, 0, $id);
    }

    public function releaseGlobalPosition(int $id): JsonResponse
    {
        return $this->releasePosition(0, $id);
    }

    public function headcountSummary(Request $request): JsonResponse
    {
        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->headcountSummary([
                'organizationUnitId' => $request->query('unit_id', $request->query('organizationUnitId')),
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
            ], auth('api')->user()),
        ]));
    }

    public function departmentBranchSummary(): JsonResponse
    {
        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->departmentBranchSummary(auth('api')->user()),
        ]));
    }

    public function missingDesignations(): JsonResponse
    {
        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->employeesMissingDesignation(auth('api')->user()),
        ]));
    }

    /* ---------------------------------------------------------- assignments */

    public function assignments(Request $request): JsonResponse
    {
        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->assignments([
                'enterpriseId' => $request->query('enterprise_id', $request->query('enterpriseId')),
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'organizationUnitId' => $request->query('unit_id', $request->query('unitId', $request->query('organizationUnitId'))),
                'positionId' => $request->query('position_id', $request->query('positionId')),
                'userId' => $request->query('user_id', $request->query('userId')),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]));
    }

    public function storeAssignment(Request $request): JsonResponse
    {
        $data = $request->validate([
            'userId' => ['required', 'integer', 'exists:users,id'],
            'organizationUnitId' => ['required', 'integer', 'exists:organization_units,id'],
            'positionId' => ['sometimes', 'nullable', 'integer', 'exists:organization_positions,id'],
            'locationId' => ['sometimes', 'nullable', 'integer', 'exists:locations,id'],
            'costCenterId' => ['sometimes', 'nullable', 'integer', 'exists:financial_organizations,id'],
            'managerUserId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'assignmentType' => ['sometimes', 'string', Rule::in(EmployeeOrganizationAssignment::ASSIGNMENT_TYPES)],
            'isPrimary' => ['sometimes', 'boolean'],
            'assignmentPercentage' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'fte' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:1'],
            'effectiveFrom' => ['required', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
            'isActive' => ['sometimes', 'boolean'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'changeReason' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentAssignment(
                $this->service->createAssignment($data, auth('api')->user())
            ),
        ], 201));
    }

    public function updateAssignment(Request $request, int $id): JsonResponse
    {
        $assignment = EmployeeOrganizationAssignment::query()->find($id);

        if (! $assignment) {
            return $this->missing('Assignment not found.');
        }

        $data = $request->validate([
            'positionId' => ['sometimes', 'nullable', 'integer', 'exists:organization_positions,id'],
            'locationId' => ['sometimes', 'nullable', 'integer', 'exists:locations,id'],
            'costCenterId' => ['sometimes', 'nullable', 'integer', 'exists:financial_organizations,id'],
            'managerUserId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'assignmentType' => ['sometimes', 'string', Rule::in(EmployeeOrganizationAssignment::ASSIGNMENT_TYPES)],
            'isPrimary' => ['sometimes', 'boolean'],
            'assignmentPercentage' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'fte' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:1'],
            'effectiveFrom' => ['sometimes', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
            'isActive' => ['sometimes', 'boolean'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'changeReason' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentAssignment(
                $this->service->updateAssignment($assignment, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroyAssignment(int $id): JsonResponse
    {
        $assignment = EmployeeOrganizationAssignment::query()->find($id);

        if (! $assignment) {
            return $this->missing('Assignment not found.');
        }

        return $this->guarded(function () use ($assignment) {
            $this->service->deleteAssignment($assignment, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $assignment->id]]);
        });
    }

    /* ----------------------------------------------------------------- helpers */

    private function unitRules(bool $update = false): array
    {
        $rules = [
            'enterpriseId' => ['sometimes', 'nullable', 'integer'],
            'companyId' => ['integer', 'exists:companies,id'],
            'parentId' => ['sometimes', 'nullable', 'integer'],
            'code' => ['sometimes', 'nullable', 'string', 'max:60'],
            'name' => ['string', 'max:190'],
            'type' => ['sometimes', 'string', Rule::in(OrganizationUnit::TYPES)],
            'status' => ['sometimes', 'string', Rule::in(OrganizationUnit::STATUSES)],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'managerUserId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'ownerUserId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'legacyDepartmentId' => ['sometimes', 'nullable', 'integer'],
            'legacyUnitId' => ['sometimes', 'nullable', 'integer'],
            'legacyBranchId' => ['sometimes', 'nullable', 'integer'],
            'legacyDesignationId' => ['sometimes', 'nullable', 'integer'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
        ];

        if ($update) {
            foreach ($rules as $key => $rule) {
                $rules[$key] = array_merge(['sometimes'], $rule);
            }
        } else {
            $rules['companyId'][] = 'required';
            $rules['name'][] = 'required';
        }

        return $rules;
    }

    private function unitExists(int $id): bool
    {
        return OrganizationUnit::query()->whereKey($id)->exists();
    }

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
