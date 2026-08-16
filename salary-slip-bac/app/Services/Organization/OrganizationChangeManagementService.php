<?php

namespace App\Services\Organization;

use App\Models\OrganizationChangeRequest;
use App\Models\OrganizationChangeItem;
use App\Models\OrganizationChangeApproval;
use App\Models\OrganizationUnit;
use App\Models\OrganizationLocation;
use App\Models\FinancialOrganization;
use App\Models\OrganizationPosition;
use App\Models\EmployeeOrganizationAssignment;
use App\Models\OrganizationLeadershipAssignment;
use App\Models\Calendar;
use App\Models\OrganizationHierarchy;
use App\Models\OrganizationHierarchyNode;
use App\Models\User;
use App\Models\Enterprise;
use App\Models\Company;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * DOMAIN 02.09 — Organization Change Management Service.
 *
 * Workflow: DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED → SCHEDULED → APPLIED
 * Terminal: REJECTED, CANCELLED, FAILED
 */
class OrganizationChangeManagementService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'organization-changes';

    public const STATUSES = [
        'draft',
        'submitted',
        'pending_approval',
        'approved',
        'scheduled',
        'applied',
        'rejected',
        'cancelled',
        'failed',
    ];

    public const CHANGE_TYPES = [
        'restructure',
        'department_create',
        'department_merge',
        'department_split',
        'department_closure',
        'branch_closure',
        'location_closure',
        'cost_center_change',
        'manager_reassignment',
        'mass_movement',
        'effective_dated_change',
        'promotion_transfer',
    ];

    public const ITEM_TYPES = [
        'create_unit',
        'update_unit',
        'delete_unit',
        'create_location',
        'update_location',
        'delete_location',
        'create_financial_org',
        'update_financial_org',
        'delete_financial_org',
        'create_position',
        'update_position',
        'delete_position',
        'assign_employee',
        'reassign_manager',
        'update_leadership',
        'update_calendar',
        'update_hierarchy',
        'update_assignment',
    ];

    public function requests(array $filters, ?User $actor): array
    {
        $query = OrganizationChangeRequest::query()
            ->with(['enterprise', 'company', 'requestedBy', 'organizationOwnerApprover', 'hrApprover'])
            ->orderBy('created_at', 'desc');

        if (!empty($filters['enterpriseId'])) {
            $query->where('enterprise_id', (int) $filters['enterpriseId']);
        }

        if (!empty($filters['companyIds'])) {
            $query->whereIn('company_id', array_map('intval', (array) $filters['companyIds']));
        } elseif (!$this->hasGlobalCompanyScope($actor)) {
            $codes = $this->authorizedCompanyCodes($actor);
            $companyIds = Company::query()->whereIn('code', $codes)->pluck('id')->all();
            $query->whereIn('company_id', $companyIds);
        }

        if (($type = (string) ($filters['changeType'] ?? '')) !== '' && $type !== 'ALL') {
            $query->where('change_type', $type);
        }

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('status', $status);
        }

        if (($search = trim((string) ($filters['search'] ?? ''))) !== '') {
            $query->where(function ($inner) use ($search) {
                $inner->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%");
            });
        }

        return $query->get()->map(fn (OrganizationChangeRequest $request) => $this->present($request))->all();
    }

    public function present(OrganizationChangeRequest $request): array
    {
        return [
            'id' => (int) $request->id,
            'enterpriseId' => $request->enterprise_id === null ? null : (int) $request->enterprise_id,
            'enterpriseName' => $request->enterprise?->name,
            'companyId' => $request->company_id === null ? null : (int) $request->company_id,
            'companyName' => $request->company?->name,
            'code' => $request->code,
            'name' => $request->name,
            'description' => $request->description,
            'changeType' => $request->change_type,
            'status' => $request->status,
            'requestedBy' => $request->requestedBy?->name,
            'requestedById' => $request->requested_by,
            'organizationOwnerApprover' => $request->organizationOwnerApprover?->name,
            'organizationOwnerApproverId' => $request->organization_owner_approver_id,
            'hrApprover' => $request->hrApprover?->name,
            'hrApproverId' => $request->hr_approver_id,
            'requestedAt' => $request->requested_at?->toDateString(),
            'submittedAt' => $request->submitted_at?->toDateString(),
            'approvedAt' => $request->approved_at?->toDateString(),
            'scheduledAt' => $request->scheduled_at?->toDateString(),
            'appliedAt' => $request->applied_at?->toDateString(),
            'rejectedAt' => $request->rejected_at?->toDateString(),
            'cancelledAt' => $request->cancelled_at?->toDateString(),
            'rejectionReason' => $request->rejection_reason,
            'itemCount' => $request->items()->count(),
            'approvalCount' => $request->approvals()->count(),
            'createdAt' => $request->created_at,
        ];
    }

    public function create(array $data, User $actor): OrganizationChangeRequest
    {
        $enterpriseId = isset($data['enterpriseId']) && $data['enterpriseId'] !== '' ? (int) $data['enterpriseId'] : null;
        $companyId = isset($data['companyId']) && $data['companyId'] !== '' ? (int) $data['companyId'] : null;

        if ($enterpriseId) {
            $enterprise = Enterprise::query()->findOrFail($enterpriseId);
            $this->assertEnterpriseVisible($enterprise, $actor);
        }

        if ($companyId) {
            $company = Company::query()->findOrFail($companyId);
            $this->assertCompanyVisible($company, $actor);
        }

        $this->assertCodeFree($enterpriseId, $companyId, trim((string) ($data['code'] ?: $data['name'])), null);

        $request = DB::transaction(function () use ($data, $enterpriseId, $companyId, $actor) {
            return OrganizationChangeRequest::query()->create([
                'enterprise_id' => $enterpriseId,
                'company_id' => $companyId,
                'code' => trim((string) ($data['code'] ?: $data['name'])),
                'name' => trim((string) $data['name']),
                'description' => $this->blankToNull($data['description'] ?? null),
                'change_type' => $data['changeType'] ?? 'effective_dated_change',
                'status' => 'draft',
                'requested_by' => $actor->id,
                'organization_owner_approver_id' => isset($data['organizationOwnerApproverId']) && $data['organizationOwnerApproverId'] !== '' ? (int) $data['organizationOwnerApproverId'] : null,
                'hr_approver_id' => isset($data['hrApproverId']) && $data['hrApproverId'] !== '' ? (int) $data['hrApproverId'] : null,
            ]);
        });

        $this->audit($actor, 'CHANGE_REQUEST_CREATED', null, $this->snapshot($request));

        return $request;
    }

    public function update(OrganizationChangeRequest $request, array $data, User $actor): OrganizationChangeRequest
    {
        if ($request->status !== 'draft') {
            throw new OrganizationException(
                'CHANGE_REQUEST_NOT_EDITABLE',
                'Only draft change requests can be edited.',
                422
            );
        }

        $this->assertRequestVisible($request, $actor);
        $before = $this->snapshot($request);

        if (array_key_exists('code', $data)) {
            $code = trim((string) $data['code']);
            $this->assertCodeFree($request->enterprise_id, $request->company_id, $code, $request->id);
            $request->code = $code;
        }

        if (array_key_exists('name', $data)) {
            $request->name = trim((string) $data['name']);
        }

        if (array_key_exists('description', $data)) {
            $request->description = $this->blankToNull($data['description']);
        }

        if (array_key_exists('changeType', $data)) {
            $request->change_type = $data['changeType'];
        }

        if (array_key_exists('organizationOwnerApproverId', $data)) {
            $request->organization_owner_approver_id = $data['organizationOwnerApproverId'] === '' || $data['organizationOwnerApproverId'] === null ? null : (int) $data['organizationOwnerApproverId'];
        }

        if (array_key_exists('hrApproverId', $data)) {
            $request->hr_approver_id = $data['hrApproverId'] === '' || $data['hrApproverId'] === null ? null : (int) $data['hrApproverId'];
        }

        DB::transaction(fn () => $request->save());

        $this->audit($actor, 'CHANGE_REQUEST_UPDATED', $before, $this->snapshot($request));

        return $request;
    }

    /**
     * DOMAIN 08 — Promotion/Transfer convenience entry point: creates a
     * `promotion_transfer` change request together with its single
     * `update_assignment` item in one call, so the caller doesn't have to
     * orchestrate create() + addItem() itself. The change still goes through
     * the normal draft -> submit -> approve -> apply lifecycle.
     */
    public function createPromotionTransfer(array $data, User $actor): OrganizationChangeRequest
    {
        $employee = User::query()->findOrFail((int) $data['employeeId']);
        $unit = OrganizationUnit::query()->findOrFail((int) $data['organizationUnitId']);

        if ($unit->company_id) {
            $company = Company::query()->findOrFail($unit->company_id);
            $this->assertCompanyVisible($company, $actor);
        }

        $current = null;

        if (!empty($data['currentAssignmentId'])) {
            $current = EmployeeOrganizationAssignment::query()->findOrFail((int) $data['currentAssignmentId']);

            if ((int) $current->user_id !== $employee->id) {
                throw new OrganizationException(
                    'ASSIGNMENT_EMPLOYEE_MISMATCH',
                    'The selected current assignment does not belong to this employee.',
                    422
                );
            }
        } else {
            $current = EmployeeOrganizationAssignment::query()
                ->where('user_id', $employee->id)
                ->where('is_primary', true)
                ->where('is_active', true)
                ->latest('effective_from')
                ->first();
        }

        $name = trim((string) ($data['name'] ?? ''));
        if ($name === '') {
            $name = sprintf('Promotion/Transfer - %s - %s', $employee->name, $data['effectiveFrom']);
        }

        $request = $this->create([
            'companyId' => $unit->company_id,
            'name' => $name,
            'description' => $data['reason'] ?? null,
            'changeType' => 'promotion_transfer',
            'organizationOwnerApproverId' => $data['organizationOwnerApproverId'] ?? null,
            'hrApproverId' => $data['hrApproverId'] ?? null,
        ], $actor);

        $afterValues = [
            'userId' => $employee->id,
            'organizationUnitId' => $unit->id,
            'positionId' => $data['positionId'] ?? null,
            'designationId' => $data['designationId'] ?? null,
            'managerUserId' => $data['managerUserId'] ?? null,
            'locationId' => $data['locationId'] ?? null,
            'costCenterId' => $data['costCenterId'] ?? null,
            'effectiveFrom' => $data['effectiveFrom'],
            'effectiveTo' => $data['effectiveTo'] ?? null,
            'reason' => $data['reason'] ?? null,
            'notes' => $data['notes'] ?? null,
            'changeReason' => $data['reason'] ?? null,
        ];

        $beforeValues = $current ? [
            'assignmentId' => $current->id,
            'organizationUnitId' => $current->organization_unit_id,
            'positionId' => $current->position_id,
            'designationId' => $current->designation_id,
            'managerUserId' => $current->manager_user_id,
            'locationId' => $current->location_id,
            'costCenterId' => $current->cost_center_id,
            'effectiveFrom' => $current->effective_from?->toDateString(),
        ] : null;

        $this->addItem($request->id, [
            'itemType' => 'update_assignment',
            'targetType' => 'employee_organization_assignment',
            'targetId' => $current?->id,
            'beforeValues' => $beforeValues,
            'afterValues' => $afterValues,
        ], $actor);

        return $request->fresh(['items']);
    }

    public function submit(OrganizationChangeRequest $request, User $actor): OrganizationChangeRequest
    {
        $this->assertRequestVisible($request, $actor);

        if ($request->status !== 'draft') {
            throw new OrganizationException(
                'CHANGE_REQUEST_INVALID_STATE',
                'Only draft requests can be submitted.',
                422
            );
        }

        if ($request->items()->count() === 0) {
            throw new OrganizationException(
                'CHANGE_REQUEST_EMPTY',
                'A change request must have at least one item before submission.',
                422
            );
        }

        if (!$request->organization_owner_approver_id) {
            throw new OrganizationException(
                'CHANGE_REQUEST_MISSING_OWNER_APPROVER',
                'An Organization Owner approver is required for every change request.',
                422
            );
        }

        // Check if HR approval is required
        $requiresHrApproval = in_array($request->change_type, [
            'restructure',
            'department_merge',
            'department_split',
            'department_closure',
            'branch_closure',
            'location_closure',
            'manager_reassignment',
            'mass_movement',
            'promotion_transfer',
        ]);

        if ($requiresHrApproval && !$request->hr_approver_id) {
            throw new OrganizationException(
                'CHANGE_REQUEST_MISSING_HR_APPROVER',
                'This change type requires an HR approver.',
                422
            );
        }

        // Requester cannot be their own approver
        if ($request->organization_owner_approver_id === $actor->id || $request->hr_approver_id === $actor->id) {
            throw new OrganizationException(
                'CHANGE_REQUEST_SELF_APPROVAL',
                'A requester cannot approve their own request.',
                422
            );
        }

        $before = $this->snapshot($request);

        $request->status = 'submitted';
        $request->submitted_at = now()->toDateString();
        $request->save();

        // Create approval steps
        $sequence = 1;
        DB::transaction(function () use ($request, $requiresHrApproval, &$sequence) {
            OrganizationChangeApproval::query()->create([
                'change_request_id' => $request->id,
                'sequence' => $sequence++,
                'approver_role' => 'organization_owner',
                'approver_user_id' => $request->organization_owner_approver_id,
                'status' => 'pending',
            ]);

            if ($requiresHrApproval) {
                OrganizationChangeApproval::query()->create([
                    'change_request_id' => $request->id,
                    'sequence' => $sequence++,
                    'approver_role' => 'hr_approver',
                    'approver_user_id' => $request->hr_approver_id,
                    'status' => 'pending',
                ]);
            }

            $request->status = 'pending_approval';
            $request->save();
        });

        $this->audit($actor, 'CHANGE_REQUEST_SUBMITTED', $before, $this->snapshot($request));

        return $request;
    }

    public function approve(OrganizationChangeRequest $request, User $actor, ?string $comments = null): OrganizationChangeRequest
    {
        $this->assertRequestVisible($request, $actor);

        if ($request->status !== 'pending_approval') {
            throw new OrganizationException(
                'CHANGE_REQUEST_INVALID_STATE',
                'Only pending approval requests can be approved.',
                422
            );
        }

        $approval = OrganizationChangeApproval::query()
            ->where('change_request_id', $request->id)
            ->where('approver_user_id', $actor->id)
            ->where('status', 'pending')
            ->orderBy('sequence')
            ->first();

        if (!$approval) {
            throw new OrganizationException(
                'CHANGE_REQUEST_NOT_YOUR_TURN',
                'It is not your turn to approve this request, or you have already acted on it.',
                422
            );
        }

        $before = $this->snapshot($request);

        DB::transaction(function () use ($request, $approval, $comments) {
            $approval->status = 'approved';
            $approval->acted_at = now()->toDateString();
            $approval->comments = $comments;
            $approval->save();

            // Check if all approvals are done
            $pendingApprovals = OrganizationChangeApproval::query()
                ->where('change_request_id', $request->id)
                ->where('status', 'pending')
                ->count();

            if ($pendingApprovals === 0) {
                $request->status = 'approved';
                $request->approved_at = now()->toDateString();
                $request->save();
            }
        });

        $this->audit($actor, 'CHANGE_REQUEST_APPROVED', $before, $this->snapshot($request));

        return $request;
    }

    public function reject(OrganizationChangeRequest $request, User $actor, string $reason): OrganizationChangeRequest
    {
        $this->assertRequestVisible($request, $actor);

        if ($request->status !== 'pending_approval') {
            throw new OrganizationException(
                'CHANGE_REQUEST_INVALID_STATE',
                'Only pending approval requests can be rejected.',
                422
            );
        }

        $approval = OrganizationChangeApproval::query()
            ->where('change_request_id', $request->id)
            ->where('approver_user_id', $actor->id)
            ->where('status', 'pending')
            ->orderBy('sequence')
            ->first();

        if (!$approval) {
            throw new OrganizationException(
                'CHANGE_REQUEST_NOT_YOUR_TURN',
                'It is not your turn to reject this request, or you have already acted on it.',
                422
            );
        }

        $before = $this->snapshot($request);

        DB::transaction(function () use ($request, $approval, $reason) {
            $approval->status = 'rejected';
            $approval->acted_at = now()->toDateString();
            $approval->comments = $reason;
            $approval->save();

            // Rejection skips remaining approvals
            OrganizationChangeApproval::query()
                ->where('change_request_id', $request->id)
                ->where('status', 'pending')
                ->where('id', '!=', $approval->id)
                ->update(['status' => 'skipped']);

            $request->status = 'rejected';
            $request->rejected_at = now()->toDateString();
            $request->rejection_reason = $reason;
            $request->save();
        });

        $this->audit($actor, 'CHANGE_REQUEST_REJECTED', $before, $this->snapshot($request));

        return $request;
    }

    public function cancel(OrganizationChangeRequest $request, User $actor): OrganizationChangeRequest
    {
        $this->assertRequestVisible($request, $actor);

        if (!in_array($request->status, ['draft', 'submitted', 'pending_approval', 'approved', 'scheduled'])) {
            throw new OrganizationException(
                'CHANGE_REQUEST_INVALID_STATE',
                'This request cannot be cancelled in its current state.',
                422
            );
        }

        $before = $this->snapshot($request);

        DB::transaction(function () use ($request) {
            $request->status = 'cancelled';
            $request->cancelled_at = now()->toDateString();
            $request->save();
        });

        $this->audit($actor, 'CHANGE_REQUEST_CANCELLED', $before, $this->snapshot($request));

        return $request;
    }

    public function schedule(OrganizationChangeRequest $request, string $scheduledAt, User $actor): OrganizationChangeRequest
    {
        $this->assertRequestVisible($request, $actor);

        if ($request->status !== 'approved') {
            throw new OrganizationException(
                'CHANGE_REQUEST_INVALID_STATE',
                'Only approved requests can be scheduled.',
                422
            );
        }

        $before = $this->snapshot($request);

        $request->status = 'scheduled';
        $request->scheduled_at = $scheduledAt;
        $request->save();

        $this->audit($actor, 'CHANGE_REQUEST_SCHEDULED', $before, $this->snapshot($request));

        return $request;
    }

    public function apply(OrganizationChangeRequest $request, User $actor): OrganizationChangeRequest
    {
        $this->assertRequestVisible($request, $actor);

        if (!in_array($request->status, ['approved', 'scheduled'])) {
            throw new OrganizationException(
                'CHANGE_REQUEST_INVALID_STATE',
                'Only approved or scheduled requests can be applied.',
                422
            );
        }

        // Revalidate immediately before application
        $this->revalidateRequest($request);

        $before = $this->snapshot($request);

        DB::transaction(function () use ($request, $actor) {
            $request->status = 'applied';
            $request->applied_at = now()->toDateString();
            $request->save();

            // Apply all items atomically
            $items = $request->items()->orderBy('sequence')->get();

            foreach ($items as $item) {
                try {
                    $this->applyItem($item, $actor);
                    $item->status = 'applied';
                    $item->save();
                } catch (\Throwable $e) {
                    $item->status = 'failed';
                    $item->error_message = $e->getMessage();
                    $item->save();
                    throw $e; // Rollback entire transaction
                }
            }
        });

        $this->audit($actor, 'CHANGE_REQUEST_APPLIED', $before, $this->snapshot($request));

        // Invalidate relevant caches
        $this->invalidateCaches($request);

        return $request;
    }

    public function items(int $requestId, ?User $actor): array
    {
        $request = OrganizationChangeRequest::query()->findOrFail($requestId);
        $this->assertRequestVisible($request, $actor);

        return $request->items()->orderBy('sequence')->get()->map(fn (OrganizationChangeItem $item) => $this->presentItem($item))->all();
    }

    public function presentItem(OrganizationChangeItem $item): array
    {
        return [
            'id' => (int) $item->id,
            'changeRequestId' => (int) $item->change_request_id,
            'sequence' => (int) $item->sequence,
            'itemType' => $item->item_type,
            'targetType' => $item->target_type,
            'targetId' => $item->target_id === null ? null : (int) $item->target_id,
            'beforeValues' => $item->before_values,
            'afterValues' => $item->after_values,
            'status' => $item->status,
            'errorMessage' => $item->error_message,
            'createdAt' => $item->created_at,
        ];
    }

    public function addItem(int $requestId, array $data, User $actor): OrganizationChangeItem
    {
        $request = OrganizationChangeRequest::query()->findOrFail($requestId);
        $this->assertRequestVisible($request, $actor);

        if ($request->status !== 'draft') {
            throw new OrganizationException(
                'CHANGE_REQUEST_NOT_EDITABLE',
                'Items can only be added to draft requests.',
                422
            );
        }

        $maxSequence = $request->items()->max('sequence') ?? 0;

        $item = DB::transaction(function () use ($requestId, $maxSequence, $data) {
            return OrganizationChangeItem::query()->create([
                'change_request_id' => $requestId,
                'sequence' => $maxSequence + 1,
                'item_type' => $data['itemType'],
                'target_type' => $data['targetType'],
                'target_id' => isset($data['targetId']) && $data['targetId'] !== '' ? (int) $data['targetId'] : null,
                'before_values' => $data['beforeValues'] ?? null,
                'after_values' => $data['afterValues'] ?? null,
                'status' => 'pending',
            ]);
        });

        $this->audit($actor, 'CHANGE_REQUEST_ITEM_ADDED', null, $this->snapshotItem($item));

        return $item;
    }

    public function deleteItem(OrganizationChangeItem $item, User $actor): void
    {
        $request = $item->changeRequest;
        $this->assertRequestVisible($request, $actor);

        if ($request->status !== 'draft') {
            throw new OrganizationException(
                'CHANGE_REQUEST_NOT_EDITABLE',
                'Items can only be removed from draft requests.',
                422
            );
        }

        $snapshot = $this->snapshotItem($item);
        DB::transaction(fn () => $item->delete());
        $this->audit($actor, 'CHANGE_REQUEST_ITEM_DELETED', $snapshot, null);
    }

    public function impact(int $requestId, ?User $actor): array
    {
        $request = OrganizationChangeRequest::query()->findOrFail($requestId);
        $this->assertRequestVisible($request, $actor);

        $items = $request->items()->orderBy('sequence')->get();

        $itemImpacts = $items->map(fn (OrganizationChangeItem $item) => [
            'itemId' => (int) $item->id,
            'itemType' => $item->item_type,
            'targetType' => $item->target_type,
            'targetId' => $item->target_id === null ? null : (int) $item->target_id,
            'affected' => $this->itemImpact($item),
        ])->all();

        $totals = [
            'employees' => 0,
            'positions' => 0,
            'childUnits' => 0,
            'reportingRelationships' => 0,
        ];

        foreach ($itemImpacts as $entry) {
            $totals['employees'] += $entry['affected']['employeeCount'] ?? 0;
            $totals['positions'] += $entry['affected']['positionCount'] ?? 0;
            $totals['childUnits'] += $entry['affected']['childUnitCount'] ?? 0;
            $totals['reportingRelationships'] += $entry['affected']['reportingRelationshipCount'] ?? 0;
        }

        return [
            'changeRequestId' => (int) $request->id,
            'status' => $request->status,
            'totals' => $totals,
            'items' => $itemImpacts,
        ];
    }

    private function itemImpact(OrganizationChangeItem $item): array
    {
        $targetId = $item->target_id;

        switch ($item->item_type) {
            case 'delete_unit':
            case 'update_unit':
                if (!$targetId) {
                    return ['employeeCount' => 0, 'positionCount' => 0, 'childUnitCount' => 0];
                }
                return [
                    'employeeCount' => EmployeeOrganizationAssignment::query()
                        ->where('organization_unit_id', $targetId)->where('is_active', true)->count(),
                    'positionCount' => OrganizationPosition::query()
                        ->where('organization_unit_id', $targetId)->count(),
                    'childUnitCount' => OrganizationUnit::query()
                        ->where('parent_id', $targetId)->count(),
                ];

            case 'delete_position':
            case 'update_position':
                if (!$targetId) {
                    return ['employeeCount' => 0];
                }
                return [
                    'employeeCount' => EmployeeOrganizationAssignment::query()
                        ->where('position_id', $targetId)->where('is_active', true)->count(),
                ];

            case 'delete_location':
            case 'update_location':
                if (!$targetId) {
                    return ['employeeCount' => 0];
                }
                return [
                    'employeeCount' => EmployeeOrganizationAssignment::query()
                        ->where('location_id', $targetId)->where('is_active', true)->count(),
                ];

            case 'delete_financial_org':
            case 'update_financial_org':
                if (!$targetId) {
                    return ['employeeCount' => 0, 'positionCount' => 0];
                }
                return [
                    'employeeCount' => EmployeeOrganizationAssignment::query()
                        ->where('cost_center_id', $targetId)->where('is_active', true)->count(),
                ];

            case 'reassign_manager':
                $data = $item->after_values ?? [];
                $count = 0;
                if (!empty($data['managerUserId'])) {
                    $count = EmployeeOrganizationAssignment::query()
                        ->where('manager_user_id', $data['managerUserId'])->where('is_active', true)->count();
                }
                return ['employeeCount' => $count, 'reportingRelationshipCount' => $count > 0 ? $count : 0];

            case 'update_hierarchy':
                if (!$targetId) {
                    return [];
                }
                return [
                    'reportingRelationshipCount' => OrganizationHierarchyNode::query()
                        ->where('organization_hierarchy_id', $targetId)->count(),
                ];

            case 'update_assignment':
                $data = $item->after_values ?? [];
                return [
                    'employeeCount' => 1,
                    'positionCount' => !empty($data['positionId']) ? 1 : 0,
                    'reportingRelationshipCount' => !empty($data['managerUserId']) ? 1 : 0,
                ];

            default:
                return [];
        }
    }

    public function approvals(int $requestId, ?User $actor): array
    {
        $request = OrganizationChangeRequest::query()->findOrFail($requestId);
        $this->assertRequestVisible($request, $actor);

        return $request->approvals()->orderBy('sequence')->get()->map(fn (OrganizationChangeApproval $approval) => $this->presentApproval($approval))->all();
    }

    public function presentApproval(OrganizationChangeApproval $approval): array
    {
        return [
            'id' => (int) $approval->id,
            'changeRequestId' => (int) $approval->change_request_id,
            'sequence' => (int) $approval->sequence,
            'approverRole' => $approval->approver_role,
            'approverUserId' => $approval->approver_user_id === null ? null : (int) $approval->approver_user_id,
            'approverName' => $approval->approver?->name,
            'status' => $approval->status,
            'actedAt' => $approval->acted_at?->toDateString(),
            'comments' => $approval->comments,
            'createdAt' => $approval->created_at,
        ];
    }

    private function applyItem(OrganizationChangeItem $item, User $actor): void
    {
        switch ($item->item_type) {
            case 'create_unit':
                $this->applyCreateUnit($item, $actor);
                break;
            case 'update_unit':
                $this->applyUpdateUnit($item, $actor);
                break;
            case 'delete_unit':
                $this->applyDeleteUnit($item, $actor);
                break;
            case 'create_location':
                $this->applyCreateLocation($item, $actor);
                break;
            case 'update_location':
                $this->applyUpdateLocation($item, $actor);
                break;
            case 'delete_location':
                $this->applyDeleteLocation($item, $actor);
                break;
            case 'create_financial_org':
                $this->applyCreateFinancialOrg($item, $actor);
                break;
            case 'update_financial_org':
                $this->applyUpdateFinancialOrg($item, $actor);
                break;
            case 'delete_financial_org':
                $this->applyDeleteFinancialOrg($item, $actor);
                break;
            case 'create_position':
                $this->applyCreatePosition($item, $actor);
                break;
            case 'update_position':
                $this->applyUpdatePosition($item, $actor);
                break;
            case 'delete_position':
                $this->applyDeletePosition($item, $actor);
                break;
            case 'assign_employee':
                $this->applyAssignEmployee($item, $actor);
                break;
            case 'update_assignment':
                $this->applyUpdateAssignment($item, $actor);
                break;
            case 'reassign_manager':
                $this->applyReassignManager($item, $actor);
                break;
            case 'update_leadership':
                $this->applyUpdateLeadership($item, $actor);
                break;
            case 'update_calendar':
                $this->applyUpdateCalendar($item, $actor);
                break;
            case 'update_hierarchy':
                $this->applyUpdateHierarchy($item, $actor);
                break;
            default:
                throw new OrganizationException(
                    'CHANGE_ITEM_TYPE_UNKNOWN',
                    "Unknown change item type: {$item->item_type}",
                    422
                );
        }
    }

    private function applyCreateUnit(OrganizationChangeItem $item, User $actor): void
    {
        $data = $item->after_values;
        $unitService = app(OrganizationUnitService::class);
        $unitService->create($data, $actor);
    }

    private function applyUpdateUnit(OrganizationChangeItem $item, User $actor): void
    {
        $unit = OrganizationUnit::query()->findOrFail($item->target_id);
        $unitService = app(OrganizationUnitService::class);
        $unitService->update($unit, $item->after_values, $actor);
    }

    private function applyDeleteUnit(OrganizationChangeItem $item, User $actor): void
    {
        $unit = OrganizationUnit::query()->findOrFail($item->target_id);
        $unitService = app(OrganizationUnitService::class);
        $unitService->delete($unit, $actor);
    }

    private function applyCreateLocation(OrganizationChangeItem $item, User $actor): void
    {
        $data = $item->after_values;
        $locationService = app(OrganizationLocationService::class);
        $locationService->create($data, $actor);
    }

    private function applyUpdateLocation(OrganizationChangeItem $item, User $actor): void
    {
        $location = OrganizationLocation::query()->findOrFail($item->target_id);
        $locationService = app(OrganizationLocationService::class);
        $locationService->update($location, $item->after_values, $actor);
    }

    private function applyDeleteLocation(OrganizationChangeItem $item, User $actor): void
    {
        $location = OrganizationLocation::query()->findOrFail($item->target_id);
        $locationService = app(OrganizationLocationService::class);
        $locationService->delete($location, $actor);
    }

    private function applyCreateFinancialOrg(OrganizationChangeItem $item, User $actor): void
    {
        $data = $item->after_values;
        $financialService = app(FinancialOrganizationService::class);
        $financialService->create($data, $actor);
    }

    private function applyUpdateFinancialOrg(OrganizationChangeItem $item, User $actor): void
    {
        $org = FinancialOrganization::query()->findOrFail($item->target_id);
        $financialService = app(FinancialOrganizationService::class);
        $financialService->update($org, $item->after_values, $actor);
    }

    private function applyDeleteFinancialOrg(OrganizationChangeItem $item, User $actor): void
    {
        $org = FinancialOrganization::query()->findOrFail($item->target_id);
        $financialService = app(FinancialOrganizationService::class);
        $financialService->delete($org, $actor);
    }

    private function applyCreatePosition(OrganizationChangeItem $item, User $actor): void
    {
        $data = $item->after_values;
        $unitService = app(OrganizationUnitService::class);
        $unitService->createPosition((int) $data['organizationUnitId'], $data, $actor);
    }

    private function applyUpdatePosition(OrganizationChangeItem $item, User $actor): void
    {
        $position = OrganizationPosition::query()->findOrFail($item->target_id);
        $unitService = app(OrganizationUnitService::class);
        $unitService->updatePosition($position, $item->after_values, $actor);
    }

    private function applyDeletePosition(OrganizationChangeItem $item, User $actor): void
    {
        $position = OrganizationPosition::query()->findOrFail($item->target_id);
        $unitService = app(OrganizationUnitService::class);
        $unitService->deletePosition($position, $actor);
    }

    private function applyAssignEmployee(OrganizationChangeItem $item, User $actor): void
    {
        $data = $item->after_values;
        $unitService = app(OrganizationUnitService::class);
        $unitService->createAssignment($data, $actor);
    }

    private function applyUpdateAssignment(OrganizationChangeItem $item, User $actor): void
    {
        $unitService = app(OrganizationUnitService::class);
        $unitService->applyPromotionTransfer($item->target_id, $item->after_values ?? [], $actor);
    }

    private function applyReassignManager(OrganizationChangeItem $item, User $actor): void
    {
        $data = $item->after_values;
        $reportingService = app(ReportingStructureService::class);
        
        if (isset($data['relationshipId'])) {
            $rel = \App\Models\ReportingRelationship::query()->findOrFail((int) $data['relationshipId']);
            $reportingService->update($rel, $data, $actor);
        } else {
            $reportingService->create($data, $actor);
        }
    }

    private function applyUpdateLeadership(OrganizationChangeItem $item, User $actor): void
    {
        $data = $item->after_values;
        $reportingService = app(ReportingStructureService::class);
        
        if (isset($data['leadershipId'])) {
            $leadership = OrganizationLeadershipAssignment::query()->findOrFail((int) $data['leadershipId']);
            $reportingService->updateLeadershipAssignment($leadership, $data, $actor);
        } else {
            $reportingService->createLeadershipAssignment($data, $actor);
        }
    }

    private function applyUpdateCalendar(OrganizationChangeItem $item, User $actor): void
    {
        $calendar = Calendar::query()->findOrFail($item->target_id);
        $calendarService = app(CalendarService::class);
        $calendarService->update($calendar, $item->after_values, $actor);
    }

    private function applyUpdateHierarchy(OrganizationChangeItem $item, User $actor): void
    {
        $hierarchy = OrganizationHierarchy::query()->findOrFail($item->target_id);
        $hierarchyService = app(OrganizationHierarchyService::class);
        $hierarchyService->update($hierarchy, $item->after_values, $actor);
    }

    private function revalidateRequest(OrganizationChangeRequest $request): void
    {
        // Revalidate all items before application
        foreach ($request->items as $item) {
            // Check if target still exists for updates/deletes
            if (in_array($item->item_type, ['update_unit', 'delete_unit']) && $item->target_id) {
                if (!OrganizationUnit::query()->find($item->target_id)) {
                    throw new OrganizationException(
                        'CHANGE_ITEM_TARGET_MISSING',
                        "Target unit {$item->target_id} no longer exists.",
                        422
                    );
                }
            }
            // Add similar checks for other target types
        }
    }

    private function invalidateCaches(OrganizationChangeRequest $request): void
    {
        // Invalidate authorization cache for affected companies
        if ($request->company_id) {
            $company = Company::query()->find($request->company_id);
            if ($company) {
                app(\App\Services\Authorization\AuthorizationCache::class)->invalidate($company->code);
            }
        }
    }

    private function assertCodeFree(?int $enterpriseId, ?int $companyId, string $code, ?int $ignoreId): void
    {
        $exists = OrganizationChangeRequest::query()
            ->where('enterprise_id', $enterpriseId)
            ->where('company_id', $companyId)
            ->where('code', $code)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new OrganizationException(
                'CHANGE_REQUEST_CODE_TAKEN',
                'That scope already has a change request with this code.',
                422
            );
        }
    }

    private function assertRequestVisible(OrganizationChangeRequest $request, ?User $actor): void
    {
        if ($request->enterprise_id) {
            $this->assertEnterpriseVisible($request->enterprise, $actor);
        }
        if ($request->company_id) {
            $this->assertCompanyVisible($request->company, $actor);
        }
    }

    private function assertEnterpriseVisible(Enterprise $enterprise, ?User $actor): void
    {
        if (!$this->hasGlobalCompanyScope($actor)) {
            $codes = $this->authorizedCompanyCodes($actor);
            $companyIds = Company::query()->whereIn('code', $codes)->pluck('id')->all();
            
            $hasAccess = $enterprise->companies()
                ->wherePivot('is_active', true)
                ->whereIn('companies.id', $companyIds)
                ->exists();
            
            if (!$hasAccess) {
                throw new OrganizationException(
                    'ENTERPRISE_NOT_VISIBLE',
                    'You do not have access to this enterprise.',
                    403
                );
            }
        }
    }

    private function blankToNull(mixed $value): ?string
    {
        if ($value === null || (is_string($value) && trim($value) === '')) {
            return null;
        }
        return trim((string) $value);
    }

    private function snapshot(OrganizationChangeRequest $request): array
    {
        return [
            'id' => (int) $request->id,
            'code' => $request->code,
            'name' => $request->name,
            'changeType' => $request->change_type,
            'status' => $request->status,
        ];
    }

    private function snapshotItem(OrganizationChangeItem $item): array
    {
        return [
            'id' => (int) $item->id,
            'changeRequestId' => (int) $item->change_request_id,
            'sequence' => (int) $item->sequence,
            'itemType' => $item->item_type,
            'targetType' => $item->target_type,
            'targetId' => $item->target_id === null ? null : (int) $item->target_id,
        ];
    }

    private function audit(User $actor, string $changeType, ?array $old, ?array $new): void
    {
        $request = request();
        if ($request) {
            AuditLogger::log($request, $changeType, self::MODULE, $old, $new);
        }
    }
}