<?php

namespace App\Http\Controllers\Api\V1\Admin\Organization;

use App\Http\Controllers\Controller;
use App\Models\OrganizationChangeApproval;
use App\Models\OrganizationChangeItem;
use App\Models\OrganizationChangeRequest;
use App\Services\Organization\OrganizationChangeManagementService;
use App\Services\Provisioning\ProvisioningException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 02.09 — Organization Change Management.
 *
 * Draft -> submit -> approve/reject -> schedule -> apply workflow for
 * restructures and reorganizations. Routes carry permission:org.change.*;
 * the service owns the workflow rules; approving cannot happen on a draft.
 */
class OrganizationChangeManagementController extends Controller
{
    public function __construct(
        private readonly OrganizationChangeManagementService $service,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->requests([
                'enterpriseId' => $request->query('enterprise_id', $request->query('enterpriseId')),
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'search' => $request->query('search'),
                'changeType' => $request->query('change_type', $request->query('changeType')),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enterpriseId' => ['sometimes', 'nullable', 'integer'],
            'companyId' => ['sometimes', 'nullable', 'integer', 'exists:companies,id'],
            'code' => ['sometimes', 'nullable', 'string', 'max:60'],
            'name' => ['required', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'changeType' => ['sometimes', 'string', Rule::in(OrganizationChangeRequest::CHANGE_TYPES)],
            'organizationOwnerApproverId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'hrApproverId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->create($data, auth('api')->user())
            ),
        ], 201));
    }

    public function storePromotionTransfer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employeeId' => ['required', 'integer', 'exists:users,id'],
            'currentAssignmentId' => ['sometimes', 'nullable', 'integer', 'exists:employee_organization_assignments,id'],
            'organizationUnitId' => ['required', 'integer', 'exists:organization_units,id'],
            'positionId' => ['required', 'integer', 'exists:organization_positions,id'],
            'designationId' => ['required', 'integer', 'exists:designations,id'],
            'managerUserId' => ['required', 'integer', 'exists:users,id'],
            'locationId' => ['sometimes', 'nullable', 'integer', 'exists:locations,id'],
            'costCenterId' => ['sometimes', 'nullable', 'integer', 'exists:financial_organizations,id'],
            'effectiveFrom' => ['required', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
            'reason' => ['required', 'string', 'max:500'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'name' => ['sometimes', 'nullable', 'string', 'max:190'],
            'organizationOwnerApproverId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'hrApproverId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->createPromotionTransfer($data, auth('api')->user())
            ),
        ], 201));
    }

    public function show(int $id): JsonResponse
    {
        $request = OrganizationChangeRequest::query()->find($id);

        if (! $request) {
            return $this->missing('Change request not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present($request),
        ]));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $change = OrganizationChangeRequest::query()->find($id);

        if (! $change) {
            return $this->missing('Change request not found.');
        }

        $data = $request->validate([
            'code' => ['sometimes', 'nullable', 'string', 'max:60'],
            'name' => ['sometimes', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'changeType' => ['sometimes', 'string', Rule::in(OrganizationChangeRequest::CHANGE_TYPES)],
            'organizationOwnerApproverId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'hrApproverId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($change, $data, auth('api')->user())
            ),
        ]));
    }

    public function submit(int $id): JsonResponse
    {
        $change = OrganizationChangeRequest::query()->find($id);

        if (! $change) {
            return $this->missing('Change request not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->submit($change, auth('api')->user())
            ),
        ]));
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $change = OrganizationChangeRequest::query()->find($id);

        if (! $change) {
            return $this->missing('Change request not found.');
        }

        $data = $request->validate(['comments' => ['sometimes', 'nullable', 'string', 'max:2000']]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->approve($change, auth('api')->user(), $data['comments'] ?? null)
            ),
        ]));
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $change = OrganizationChangeRequest::query()->find($id);

        if (! $change) {
            return $this->missing('Change request not found.');
        }

        $data = $request->validate(['reason' => ['required', 'string', 'max:2000']]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->reject($change, auth('api')->user(), $data['reason'])
            ),
        ]));
    }

    public function cancel(int $id): JsonResponse
    {
        $change = OrganizationChangeRequest::query()->find($id);

        if (! $change) {
            return $this->missing('Change request not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->cancel($change, auth('api')->user())
            ),
        ]));
    }

    public function schedule(Request $request, int $id): JsonResponse
    {
        $change = OrganizationChangeRequest::query()->find($id);

        if (! $change) {
            return $this->missing('Change request not found.');
        }

        $data = $request->validate(['scheduledAt' => ['required', 'date']]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->schedule($change, $data['scheduledAt'], auth('api')->user())
            ),
        ]));
    }

    public function apply(int $id): JsonResponse
    {
        $change = OrganizationChangeRequest::query()->find($id);

        if (! $change) {
            return $this->missing('Change request not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->apply($change, auth('api')->user())
            ),
        ]));
    }

    /* ------------------------------------------------------------------ items */

    public function items(int $id): JsonResponse
    {
        $change = OrganizationChangeRequest::query()->find($id);

        if (! $change) {
            return $this->missing('Change request not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->items($change->id, auth('api')->user()),
        ]));
    }

    public function storeItem(Request $request, int $id): JsonResponse
    {
        $change = OrganizationChangeRequest::query()->find($id);

        if (! $change) {
            return $this->missing('Change request not found.');
        }

        $data = $request->validate([
            'itemType' => ['required', 'string', Rule::in(OrganizationChangeItem::ITEM_TYPES)],
            'targetType' => ['required', 'string', 'max:60'],
            'targetId' => ['sometimes', 'nullable', 'integer'],
            'beforeValues' => ['sometimes', 'nullable', 'array'],
            'afterValues' => ['sometimes', 'nullable', 'array'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentItem(
                $this->service->addItem($change->id, $data, auth('api')->user())
            ),
        ], 201));
    }

    public function destroyItem(int $id, int $itemId): JsonResponse
    {
        $item = OrganizationChangeItem::query()->find($itemId);

        if (! $item) {
            return $this->missing('Change item not found.');
        }

        return $this->guarded(function () use ($item) {
            $this->service->deleteItem($item, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $item->id]]);
        });
    }

    /* ------------------------------------------------------------- approvals */

    public function approvals(int $id): JsonResponse
    {
        $change = OrganizationChangeRequest::query()->find($id);

        if (! $change) {
            return $this->missing('Change request not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->approvals($change->id, auth('api')->user()),
        ]));
    }

    /* --------------------------------------------------------------- impact */

    public function impact(int $id): JsonResponse
    {
        $change = OrganizationChangeRequest::query()->find($id);

        if (! $change) {
            return $this->missing('Change request not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->impact($change->id, auth('api')->user()),
        ]));
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