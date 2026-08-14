<?php

namespace App\Services\Organization;

use App\Models\OrganizationUnit;
use App\Models\OrganizationPosition;
use App\Models\EmployeeOrganizationAssignment;
use App\Models\Enterprise;
use App\Models\Company;
use App\Models\User;
use App\Models\Department;
use App\Models\Unit;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * DOMAIN 02.03 — Business Structure Service.
 *
 * Manages organization units, positions, and employee assignments.
 */
class OrganizationUnitService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'organization-units';

    public const TYPES = [
        'business_unit',
        'division',
        'function',
        'department',
        'sub_department',
        'section',
        'team',
        'project_org',
        'virtual_org',
        'shared_service_org',
    ];

    public function units(array $filters, ?User $actor): array
    {
        $query = OrganizationUnit::query()
            ->with(['enterprise', 'company', 'parent', 'manager', 'owner'])
            ->orderBy('name');

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

        if (array_key_exists('parentId', $filters) && $filters['parentId'] !== null && $filters['parentId'] !== '' && $filters['parentId'] !== 'ALL') {
            $query->where('parent_id', (int) $filters['parentId']);
        }

        if (($type = (string) ($filters['type'] ?? '')) !== '' && $type !== 'ALL') {
            $query->where('type', $type);
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

        if (($asOf = $filters['asOf'] ?? null) !== null) {
            $query->where(function ($inner) use ($asOf) {
                $inner->where('effective_from', '<=', $asOf)
                    ->orWhereNull('effective_from');
                $inner->where(function ($q) use ($asOf) {
                    $q->where('effective_to', '>=', $asOf)
                        ->orWhereNull('effective_to');
                });
            });
        }

        if (!empty($filters['includeInactive'])) {
            // include all
        } else {
            $query->where('status', 'active');
        }

        return $query->get()->map(fn (OrganizationUnit $unit) => $this->present($unit))->all();
    }

    public function treeOptions(array $filters, ?User $actor, ?int $excludeId = null): array
    {
        $units = $this->units($filters, $actor);
        $byId = [];

        foreach ($units as $unit) {
            $byId[$unit['id']] = $unit;
        }

        $labels = $this->pathLabels($byId);

        return array_map(static function (array $unit) use ($labels, $excludeId) {
            return [
                'id' => $unit['id'],
                'name' => $unit['name'],
                'type' => $unit['type'],
                'path' => $labels[$unit['id']] ?? $unit['name'],
                'excluded' => $excludeId !== null && $this->isSelfOrDescendant($unit['id'], $excludeId, $byId),
            ];
        }, array_values($byId));
    }

    public function present(OrganizationUnit $unit): array
    {
        return [
            'id' => (int) $unit->id,
            'enterpriseId' => $unit->enterprise_id === null ? null : (int) $unit->enterprise_id,
            'enterpriseName' => $unit->enterprise?->name,
            'companyId' => $unit->company_id === null ? null : (int) $unit->company_id,
            'companyName' => $unit->company?->name,
            'parentId' => $unit->parent_id === null ? null : (int) $unit->parent_id,
            'parentName' => $unit->parent?->name,
            'code' => $unit->code,
            'name' => $unit->name,
            'type' => $unit->type,
            'status' => $unit->status,
            'description' => $unit->description,
            'managerUserId' => $unit->manager_user_id === null ? null : (int) $unit->manager_user_id,
            'managerName' => $unit->manager?->name,
            'ownerUserId' => $unit->owner_user_id === null ? null : (int) $unit->owner_user_id,
            'ownerName' => $unit->owner?->name,
            'legacyDepartmentId' => $unit->legacy_department_id === null ? null : (int) $unit->legacy_department_id,
            'legacyUnitId' => $unit->legacy_unit_id === null ? null : (int) $unit->legacy_unit_id,
            'legacyBranchId' => $unit->legacy_branch_id === null ? null : (int) $unit->legacy_branch_id,
            'legacyDesignationId' => $unit->legacy_designation_id === null ? null : (int) $unit->legacy_designation_id,
            'effectiveFrom' => $unit->effective_from?->toDateString(),
            'effectiveTo' => $unit->effective_to?->toDateString(),
            'hasChildren' => $unit->children()->exists(),
            'positionCount' => $unit->positions()->count(),
            'assignmentCount' => $unit->assignments()->where('is_active', true)->count(),
            'createdAt' => $unit->created_at,
        ];
    }

    public function create(array $data, User $actor): OrganizationUnit
    {
        $enterpriseId = isset($data['enterpriseId']) && $data['enterpriseId'] !== '' ? (int) $data['enterpriseId'] : null;
        $companyId = isset($data['companyId']) && $data['companyId'] !== '' ? (int) $data['companyId'] : null;
        $parentId = isset($data['parentId']) && $data['parentId'] !== '' ? (int) $data['parentId'] : null;

        if ($enterpriseId) {
            $enterprise = Enterprise::query()->findOrFail($enterpriseId);
            $this->assertEnterpriseVisible($enterprise, $actor);
        }

        if ($companyId) {
            $company = Company::query()->findOrFail($companyId);
            $this->assertCompanyVisible($company, $actor);

            if (!$company->is_active) {
                throw new OrganizationException(
                    'COMPANY_INACTIVE',
                    'Organization units cannot be added to an inactive company.',
                    422
                );
            }
        }

        $this->assertCodeFree($enterpriseId, $companyId, trim((string) ($data['code'] ?: $data['name'])), null);
        $this->resolveParent($enterpriseId, $companyId, $parentId, null);

        $unit = DB::transaction(function () use ($data, $enterpriseId, $companyId, $parentId, $actor) {
            return OrganizationUnit::query()->create([
                'enterprise_id' => $enterpriseId,
                'company_id' => $companyId,
                'parent_id' => $parentId,
                'code' => trim((string) ($data['code'] ?: $data['name'])),
                'name' => trim((string) $data['name']),
                'type' => $data['type'] ?? 'department',
                'status' => $data['status'] ?? 'active',
                'description' => $this->blankToNull($data['description'] ?? null),
                'manager_user_id' => isset($data['managerUserId']) && $data['managerUserId'] !== '' ? (int) $data['managerUserId'] : null,
                'owner_user_id' => isset($data['ownerUserId']) && $data['ownerUserId'] !== '' ? (int) $data['ownerUserId'] : null,
                'legacy_department_id' => isset($data['legacyDepartmentId']) && $data['legacyDepartmentId'] !== '' ? (int) $data['legacyDepartmentId'] : null,
                'legacy_unit_id' => isset($data['legacyUnitId']) && $data['legacyUnitId'] !== '' ? (int) $data['legacyUnitId'] : null,
                'legacy_branch_id' => isset($data['legacyBranchId']) && $data['legacyBranchId'] !== '' ? (int) $data['legacyBranchId'] : null,
                'legacy_designation_id' => isset($data['legacyDesignationId']) && $data['legacyDesignationId'] !== '' ? (int) $data['legacyDesignationId'] : null,
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);
        });

        $this->audit($actor, 'ORGANIZATION_UNIT_CREATED', null, $this->snapshot($unit));

        return $unit;
    }

    public function update(OrganizationUnit $unit, array $data, User $actor): OrganizationUnit
    {
        $this->assertUnitVisible($unit, $actor);
        $before = $this->snapshot($unit);

        if (array_key_exists('enterpriseId', $data)) {
            $enterpriseId = $data['enterpriseId'] === '' || $data['enterpriseId'] === null ? null : (int) $data['enterpriseId'];
            if ($enterpriseId !== $unit->enterprise_id) {
                if ($enterpriseId) {
                    $enterprise = Enterprise::query()->findOrFail($enterpriseId);
                    $this->assertEnterpriseVisible($enterprise, $actor);
                }
                $unit->enterprise_id = $enterpriseId;
            }
        }

        if (array_key_exists('companyId', $data)) {
            $companyId = $data['companyId'] === '' || $data['companyId'] === null ? null : (int) $data['companyId'];
            if ($companyId !== $unit->company_id) {
                if ($companyId) {
                    $company = Company::query()->findOrFail($companyId);
                    $this->assertCompanyVisible($company, $actor);
                }
                $unit->company_id = $companyId;
            }
        }

        if (array_key_exists('code', $data)) {
            $code = trim((string) $data['code']);
            $this->assertCodeFree($unit->enterprise_id, $unit->company_id, $code, $unit->id);
            $unit->code = $code;
        }

        if (array_key_exists('name', $data)) {
            $unit->name = trim((string) $data['name']);
        }

        if (array_key_exists('type', $data)) {
            $unit->type = $data['type'];
        }

        if (array_key_exists('status', $data)) {
            $unit->status = $data['status'];
        }

        if (array_key_exists('description', $data)) {
            $unit->description = $this->blankToNull($data['description']);
        }

        if (array_key_exists('parentId', $data)) {
            $parentId = $data['parentId'] === '' || $data['parentId'] === null ? null : (int) $data['parentId'];
            $this->resolveParent($unit->enterprise_id, $unit->company_id, $parentId, $unit->id);
            $unit->parent_id = $parentId;
        }

        $pairs = [
            'managerUserId' => 'manager_user_id',
            'ownerUserId' => 'owner_user_id',
            'legacyDepartmentId' => 'legacy_department_id',
            'legacyUnitId' => 'legacy_unit_id',
            'legacyBranchId' => 'legacy_branch_id',
            'legacyDesignationId' => 'legacy_designation_id',
            'effectiveFrom' => 'effective_from',
            'effectiveTo' => 'effective_to',
        ];

        foreach ($pairs as $key => $column) {
            if (array_key_exists($key, $data)) {
                $unit->{$column} = $data[$key] === '' || $data[$key] === null ? null : (int) $data[$key];
            }
        }

        DB::transaction(fn () => $unit->save());

        $this->audit($actor, 'ORGANIZATION_UNIT_UPDATED', $before, $this->snapshot($unit));

        return $unit;
    }

    public function setStatus(OrganizationUnit $unit, string $status, User $actor): OrganizationUnit
    {
        $this->assertUnitVisible($unit, $actor);
        $before = $this->snapshot($unit);

        if ($status === 'closed' && $unit->children()->where('status', 'active')->exists()) {
            throw new OrganizationException(
                'ORGANIZATION_UNIT_HAS_ACTIVE_CHILDREN',
                'Cannot close this unit while it has active children. Move or close them first.',
                422
            );
        }

        $unit->status = $status;
        $unit->save();

        $this->audit($actor, 'ORGANIZATION_UNIT_STATUS_CHANGED', $before, $this->snapshot($unit));

        return $unit;
    }

    public function delete(OrganizationUnit $unit, User $actor): void
    {
        $this->assertUnitVisible($unit, $actor);

        if ($unit->children()->exists()) {
            throw new OrganizationException(
                'ORGANIZATION_UNIT_HAS_CHILDREN',
                'Cannot delete this unit while sub-units exist under it. Move them first.',
                422
            );
        }

        if ($unit->positions()->exists()) {
            throw new OrganizationException(
                'ORGANIZATION_UNIT_HAS_POSITIONS',
                'Cannot delete this unit while positions exist. Remove them first.',
                422
            );
        }

        if ($unit->assignments()->where('is_active', true)->exists()) {
            throw new OrganizationException(
                'ORGANIZATION_UNIT_IN_USE',
                'Cannot delete this unit while employees are assigned to it. Reassign employees before deleting.',
                422
            );
        }

        $snapshot = $this->snapshot($unit);

        DB::transaction(fn () => $unit->delete());

        $this->audit($actor, 'ORGANIZATION_UNIT_DELETED', $snapshot, null);
    }

    // Positions
    public function positions(int $unitId, array $filters, ?User $actor): array
    {
        $unit = OrganizationUnit::query()->findOrFail($unitId);
        $this->assertUnitVisible($unit, $actor);

        $query = $unit->positions()->with(['reportsTo'])->orderBy('title');

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('status', $status);
        }

        return $query->get()->map(fn (OrganizationPosition $pos) => $this->presentPosition($pos))->all();
    }

    public function presentPosition(OrganizationPosition $pos): array
    {
        return [
            'id' => (int) $pos->id,
            'organizationUnitId' => (int) $pos->organization_unit_id,
            'organizationUnitName' => $pos->organizationUnit?->name,
            'code' => $pos->code,
            'title' => $pos->title,
            'description' => $pos->description,
            'approvedHeadcount' => (int) $pos->approved_headcount,
            'currentHeadcount' => (int) $pos->current_headcount,
            'vacancy' => max(0, (int) $pos->approved_headcount - (int) $pos->current_headcount),
            'status' => $pos->status,
            'reportsToPositionId' => $pos->reports_to_position_id === null ? null : (int) $pos->reports_to_position_id,
            'reportsToPositionTitle' => $pos->reportsTo?->title,
            'effectiveFrom' => $pos->effective_from?->toDateString(),
            'effectiveTo' => $pos->effective_to?->toDateString(),
            'createdAt' => $pos->created_at,
        ];
    }

    public function createPosition(int $unitId, array $data, User $actor): OrganizationPosition
    {
        $unit = OrganizationUnit::query()->findOrFail($unitId);
        $this->assertUnitVisible($unit, $actor);

        $reportsToId = isset($data['reportsToPositionId']) && $data['reportsToPositionId'] !== '' ? (int) $data['reportsToPositionId'] : null;

        if ($reportsToId) {
            $reportsTo = OrganizationPosition::query()->findOrFail($reportsToId);
            if ($reportsTo->organization_unit_id !== $unitId) {
                throw new OrganizationException(
                    'POSITION_REPORTS_TO_MISMATCH',
                    'A position can only report to another position in the same organization unit.',
                    422
                );
            }
        }

        $this->assertPositionCodeFree($unitId, trim((string) ($data['code'] ?: $data['title'])), null);

        $pos = DB::transaction(function () use ($unitId, $data, $reportsToId) {
            return OrganizationPosition::query()->create([
                'organization_unit_id' => $unitId,
                'code' => trim((string) ($data['code'] ?: $data['title'])),
                'title' => trim((string) $data['title']),
                'description' => $this->blankToNull($data['description'] ?? null),
                'approved_headcount' => (int) ($data['approvedHeadcount'] ?? 1),
                'current_headcount' => 0,
                'status' => $data['status'] ?? 'active',
                'reports_to_position_id' => $reportsToId,
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);
        });

        $this->audit($actor, 'ORGANIZATION_POSITION_CREATED', null, $this->snapshotPosition($pos));

        return $pos;
    }

    public function updatePosition(OrganizationPosition $pos, array $data, User $actor): OrganizationPosition
    {
        $this->assertUnitVisible($pos->organizationUnit, $actor);
        $before = $this->snapshotPosition($pos);

        if (array_key_exists('code', $data)) {
            $code = trim((string) $data['code']);
            $this->assertPositionCodeFree($pos->organization_unit_id, $code, $pos->id);
            $pos->code = $code;
        }

        if (array_key_exists('title', $data)) {
            $pos->title = trim((string) $data['title']);
        }

        if (array_key_exists('description', $data)) {
            $pos->description = $this->blankToNull($data['description']);
        }

        if (array_key_exists('approvedHeadcount', $data)) {
            $pos->approved_headcount = (int) $data['approvedHeadcount'];
        }

        if (array_key_exists('status', $data)) {
            $pos->status = $data['status'];
        }

        if (array_key_exists('reportsToPositionId', $data)) {
            $reportsToId = $data['reportsToPositionId'] === '' || $data['reportsToPositionId'] === null ? null : (int) $data['reportsToPositionId'];
            if ($reportsToId) {
                $reportsTo = OrganizationPosition::query()->findOrFail($reportsToId);
                if ($reportsTo->organization_unit_id !== $pos->organization_unit_id) {
                    throw new OrganizationException(
                        'POSITION_REPORTS_TO_MISMATCH',
                        'A position can only report to another position in the same organization unit.',
                        422
                    );
                }
            }
            $pos->reports_to_position_id = $reportsToId;
        }

        if (array_key_exists('effectiveFrom', $data)) {
            $pos->effective_from = $this->blankToNull($data['effectiveFrom']);
        }

        if (array_key_exists('effectiveTo', $data)) {
            $pos->effective_to = $this->blankToNull($data['effectiveTo']);
        }

        DB::transaction(fn () => $pos->save());

        $this->audit($actor, 'ORGANIZATION_POSITION_UPDATED', $before, $this->snapshotPosition($pos));

        return $pos;
    }

    public function deletePosition(OrganizationPosition $pos, User $actor): void
    {
        $this->assertUnitVisible($pos->organizationUnit, $actor);

        if ($pos->assignments()->where('is_active', true)->exists()) {
            throw new OrganizationException(
                'POSITION_IN_USE',
                'Cannot delete this position while employees are assigned to it. Reassign employees before deleting.',
                422
            );
        }

        $snapshot = $this->snapshotPosition($pos);

        DB::transaction(fn () => $pos->delete());

        $this->audit($actor, 'ORGANIZATION_POSITION_DELETED', $snapshot, null);
    }

    // Employee Assignments
    public function assignments(array $filters, ?User $actor): array
    {
        $query = EmployeeOrganizationAssignment::query()
            ->with(['user', 'organizationUnit', 'position'])
            ->orderBy('effective_from', 'desc');

        if (!empty($filters['userId'])) {
            $query->where('user_id', (int) $filters['userId']);
        }

        if (!empty($filters['organizationUnitId'])) {
            $query->where('organization_unit_id', (int) $filters['organizationUnitId']);
        }

        if (!empty($filters['positionId'])) {
            $query->where('position_id', (int) $filters['positionId']);
        }

        if (($asOf = $filters['asOf'] ?? null) !== null) {
            $query->where(function ($inner) use ($asOf) {
                $inner->where('effective_from', '<=', $asOf)
                    ->where(function ($q) use ($asOf) {
                        $q->where('effective_to', '>=', $asOf)
                            ->orWhereNull('effective_to');
                    });
            });
        }

        if (!empty($filters['includeInactive'])) {
            // include all
        } else {
            $query->where('is_active', true);
        }

        return $query->get()->map(fn (EmployeeOrganizationAssignment $assignment) => $this->presentAssignment($assignment))->all();
    }

    public function presentAssignment(EmployeeOrganizationAssignment $assignment): array
    {
        return [
            'id' => (int) $assignment->id,
            'userId' => (int) $assignment->user_id,
            'userName' => $assignment->user?->name,
            'userEmpCode' => $assignment->user?->emp_code,
            'organizationUnitId' => (int) $assignment->organization_unit_id,
            'organizationUnitName' => $assignment->organizationUnit?->name,
            'positionId' => $assignment->position_id === null ? null : (int) $assignment->position_id,
            'positionTitle' => $assignment->position?->title,
            'assignmentType' => $assignment->assignment_type,
            'isPrimary' => (bool) $assignment->is_primary,
            'effectiveFrom' => $assignment->effective_from->toDateString(),
            'effectiveTo' => $assignment->effective_to?->toDateString(),
            'isActive' => (bool) $assignment->is_active,
            'notes' => $assignment->notes,
            'createdAt' => $assignment->created_at,
        ];
    }

    public function createAssignment(array $data, User $actor): EmployeeOrganizationAssignment
    {
        $user = User::query()->findOrFail((int) $data['userId']);
        $unit = OrganizationUnit::query()->findOrFail((int) $data['organizationUnitId']);
        $this->assertUnitVisible($unit, $actor);

        $positionId = isset($data['positionId']) && $data['positionId'] !== '' ? (int) $data['positionId'] : null;
        if ($positionId) {
            $position = OrganizationPosition::query()->findOrFail($positionId);
            if ($position->organization_unit_id !== $unit->id) {
                throw new OrganizationException(
                    'POSITION_UNIT_MISMATCH',
                    'The position must belong to the selected organization unit.',
                    422
                );
            }
        }

        $isPrimary = (bool) ($data['isPrimary'] ?? true);
        $assignmentType = $data['assignmentType'] ?? 'primary';

        if ($isPrimary) {
            // Clear other primary assignments for this user
            EmployeeOrganizationAssignment::query()
                ->where('user_id', $user->id)
                ->where('is_primary', true)
                ->where('is_active', true)
                ->update(['is_primary' => false]);
        }

        $assignment = DB::transaction(function () use ($user, $unit, $positionId, $isPrimary, $assignmentType, $data) {
            return EmployeeOrganizationAssignment::query()->create([
                'user_id' => $user->id,
                'organization_unit_id' => $unit->id,
                'position_id' => $positionId,
                'assignment_type' => $assignmentType,
                'is_primary' => $isPrimary,
                'effective_from' => $data['effectiveFrom'],
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
                'is_active' => (bool) ($data['isActive'] ?? true),
                'notes' => $this->blankToNull($data['notes'] ?? null),
            ]);
        });

        // Update legacy compatibility fields
        $this->updateLegacyFields($user, $unit, $positionId);

        $this->audit($actor, 'EMPLOYEE_ORGANIZATION_ASSIGNMENT_CREATED', null, $this->snapshotAssignment($assignment));

        return $assignment;
    }

    public function updateAssignment(EmployeeOrganizationAssignment $assignment, array $data, User $actor): EmployeeOrganizationAssignment
    {
        $this->assertUnitVisible($assignment->organizationUnit, $actor);
        $before = $this->snapshotAssignment($assignment);

        if (array_key_exists('positionId', $data)) {
            $positionId = $data['positionId'] === '' || $data['positionId'] === null ? null : (int) $data['positionId'];
            if ($positionId) {
                $position = OrganizationPosition::query()->findOrFail($positionId);
                if ($position->organization_unit_id !== $assignment->organization_unit_id) {
                    throw new OrganizationException(
                        'POSITION_UNIT_MISMATCH',
                        'The position must belong to the selected organization unit.',
                        422
                    );
                }
            }
            $assignment->position_id = $positionId;
        }

        if (array_key_exists('assignmentType', $data)) {
            $assignment->assignment_type = $data['assignmentType'];
        }

        if (array_key_exists('isPrimary', $data)) {
            $isPrimary = (bool) $data['isPrimary'];
            if ($isPrimary && !$assignment->is_primary) {
                EmployeeOrganizationAssignment::query()
                    ->where('user_id', $assignment->user_id)
                    ->where('is_primary', true)
                    ->where('is_active', true)
                    ->where('id', '!=', $assignment->id)
                    ->update(['is_primary' => false]);
            }
            $assignment->is_primary = $isPrimary;
        }

        if (array_key_exists('effectiveFrom', $data)) {
            $assignment->effective_from = $data['effectiveFrom'];
        }

        if (array_key_exists('effectiveTo', $data)) {
            $assignment->effective_to = $this->blankToNull($data['effectiveTo']);
        }

        if (array_key_exists('isActive', $data)) {
            $assignment->is_active = (bool) $data['isActive'];
        }

        if (array_key_exists('notes', $data)) {
            $assignment->notes = $this->blankToNull($data['notes']);
        }

        DB::transaction(fn () => $assignment->save());

        // Update legacy compatibility fields
        $this->updateLegacyFields($assignment->user, $assignment->organizationUnit, $assignment->position_id);

        $this->audit($actor, 'EMPLOYEE_ORGANIZATION_ASSIGNMENT_UPDATED', $before, $this->snapshotAssignment($assignment));

        return $assignment;
    }

    public function deleteAssignment(EmployeeOrganizationAssignment $assignment, User $actor): void
    {
        $this->assertUnitVisible($assignment->organizationUnit, $actor);
        $snapshot = $this->snapshotAssignment($assignment);
        DB::transaction(fn () => $assignment->delete());
        $this->audit($actor, 'EMPLOYEE_ORGANIZATION_ASSIGNMENT_DELETED', $snapshot, null);
    }

    private function updateLegacyFields(User $user, OrganizationUnit $unit, ?int $positionId): void
    {
        $user->department = $unit->name;
        $user->unit = $unit->code;
        $user->designation = $positionId ? OrganizationPosition::query()->find($positionId)?->title : null;
        $user->save();
    }

    private function assertCodeFree(?int $enterpriseId, ?int $companyId, string $code, ?int $ignoreId): void
    {
        $exists = OrganizationUnit::query()
            ->where('enterprise_id', $enterpriseId)
            ->where('company_id', $companyId)
            ->where('code', $code)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new OrganizationException(
                'ORGANIZATION_UNIT_CODE_TAKEN',
                'That scope already has an organization unit with this code.',
                422
            );
        }
    }

    private function assertPositionCodeFree(int $unitId, string $code, ?int $ignoreId): void
    {
        $exists = OrganizationPosition::query()
            ->where('organization_unit_id', $unitId)
            ->where('code', $code)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new OrganizationException(
                'ORGANIZATION_POSITION_CODE_TAKEN',
                'That unit already has a position with this code.',
                422
            );
        }
    }

    private function resolveParent(?int $enterpriseId, ?int $companyId, ?int $parentId, ?int $ignoreId): void
    {
        if ($parentId === null) {
            return;
        }

        $parent = OrganizationUnit::query()->find($parentId);

        if (!$parent) {
            throw new OrganizationException(
                'ORGANIZATION_UNIT_PARENT_NOT_FOUND',
                'The selected parent unit does not exist.',
                422
            );
        }

        if ($parent->enterprise_id !== $enterpriseId || $parent->company_id !== $companyId) {
            throw new OrganizationException(
                'ORGANIZATION_UNIT_PARENT_SCOPE_MISMATCH',
                'A unit can only hang under a parent in the same enterprise and company.',
                422
            );
        }

        // Check for cycles
        $cursor = $parentId;
        for ($i = 0; $i < 100 && $cursor !== null; $i++) {
            if ($cursor === $ignoreId) {
                throw new OrganizationException(
                    'ORGANIZATION_UNIT_CYCLE_DETECTED',
                    'This would create a cycle in the organization unit hierarchy.',
                    422
                );
            }
            $parent = OrganizationUnit::query()->find($cursor);
            $cursor = $parent?->parent_id;
        }
    }

    private function assertUnitVisible(OrganizationUnit $unit, ?User $actor): void
    {
        if ($unit->enterprise_id) {
            $this->assertEnterpriseVisible($unit->enterprise, $actor);
        }
        if ($unit->company_id) {
            $this->assertCompanyVisible($unit->company, $actor);
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

    /** @param array<int,array{id:int,parentId:?int}> $byId */
    private function pathLabels(array $byId): array
    {
        $labels = [];

        foreach ($byId as $id => $unit) {
            $chain = [];
            $cursor = $unit['id'];

            for ($i = 0; $i < 100 && $cursor !== null; $i++) {
                if (!isset($byId[$cursor])) {
                    break;
                }

                array_unshift($chain, $byId[$cursor]['name']);
                $cursor = $byId[$cursor]['parentId'];
            }

            $labels[$id] = implode(' / ', $chain);
        }

        return $labels;
    }

    /** @param array<int,array{id:int,parentId:?int}> $byId */
    private function isSelfOrDescendant(int $candidateId, int $targetId, array $byId): bool
    {
        if ($candidateId === $targetId) {
            return true;
        }

        $cursor = $candidateId;

        for ($i = 0; $i < 100 && $cursor !== null; $i++) {
            if (!isset($byId[$cursor])) {
                return false;
            }

            if ($cursor === $targetId) {
                return true;
            }

            $cursor = $byId[$cursor]['parentId'];
        }

        return false;
    }

    private function blankToNull(mixed $value): ?string
    {
        if ($value === null || (is_string($value) && trim($value) === '')) {
            return null;
        }
        return trim((string) $value);
    }

    private function snapshot(OrganizationUnit $unit): array
    {
        return [
            'id' => (int) $unit->id,
            'enterpriseId' => $unit->enterprise_id === null ? null : (int) $unit->enterprise_id,
            'companyId' => $unit->company_id === null ? null : (int) $unit->company_id,
            'parentId' => $unit->parent_id === null ? null : (int) $unit->parent_id,
            'code' => $unit->code,
            'name' => $unit->name,
            'type' => $unit->type,
            'status' => $unit->status,
        ];
    }

    private function snapshotPosition(OrganizationPosition $pos): array
    {
        return [
            'id' => (int) $pos->id,
            'organizationUnitId' => (int) $pos->organization_unit_id,
            'code' => $pos->code,
            'title' => $pos->title,
            'approvedHeadcount' => (int) $pos->approved_headcount,
            'status' => $pos->status,
        ];
    }

    private function snapshotAssignment(EmployeeOrganizationAssignment $assignment): array
    {
        return [
            'id' => (int) $assignment->id,
            'userId' => (int) $assignment->user_id,
            'organizationUnitId' => (int) $assignment->organization_unit_id,
            'positionId' => $assignment->position_id === null ? null : (int) $assignment->position_id,
            'isPrimary' => (bool) $assignment->is_primary,
            'effectiveFrom' => $assignment->effective_from->toDateString(),
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