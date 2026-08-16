<?php

namespace App\Services\Organization;

use App\Models\ReportingRelationship;
use App\Models\OrganizationLeadershipAssignment;
use App\Models\OrganizationUnit;
use App\Models\User;
use App\Models\Company;
use App\Models\Department;
use App\Models\Enterprise;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * DOMAIN 02.07 — Reporting Structure Service.
 *
 * Extends the existing reporting_relationships foundation.
 */
class ReportingStructureService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'organization-reporting';

    public const RELATIONSHIP_TYPES = [
        'primary',
        'secondary',
        'functional',
        'project',
        'matrix',
    ];

    public const LEADERSHIP_TYPES = [
        'department_head',
        'business_unit_head',
        'hr_business_partner',
    ];

    public function relationships(array $filters, ?User $actor): array
    {
        $query = ReportingRelationship::query()
            ->with(['employee', 'manager', 'company'])
            ->orderBy('effective_from', 'desc');

        if (!empty($filters['companyIds'])) {
            $query->whereIn('company_id', array_map('intval', (array) $filters['companyIds']));
        } elseif (!$this->hasGlobalCompanyScope($actor)) {
            $codes = $this->authorizedCompanyCodes($actor);
            $query->whereIn('company_id', Company::query()->whereIn('code', $codes)->pluck('id'));
        }

        if (!empty($filters['employeeId'])) {
            $query->where('employee_id', (int) $filters['employeeId']);
        }

        if (!empty($filters['managerId'])) {
            $query->where('manager_id', (int) $filters['managerId']);
        }

        if (($type = (string) ($filters['relationshipType'] ?? '')) !== '' && $type !== 'ALL') {
            $query->where('relationship_type', $type);
        }

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('is_active', $status === 'ACTIVE');
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

        return $query->get()->map(fn (ReportingRelationship $rel) => $this->present($rel))->all();
    }

    public function present(ReportingRelationship $rel): array
    {
        return [
            'id' => (int) $rel->id,
            'employeeId' => (int) $rel->employee_id,
            'employeeName' => $rel->employee?->name,
            'employeeEmpCode' => $rel->employee?->emp_code,
            'managerId' => (int) $rel->manager_id,
            'managerName' => $rel->manager?->name,
            'managerEmpCode' => $rel->manager?->emp_code,
            'companyId' => $rel->company_id === null ? null : (int) $rel->company_id,
            'companyName' => $rel->company?->name,
            'relationshipType' => $rel->relationship_type,
            'effectiveFrom' => $rel->effective_from?->toDateString(),
            'effectiveTo' => $rel->effective_to?->toDateString(),
            'isActive' => (bool) $rel->is_active,
            'notes' => $rel->notes,
            'createdAt' => $rel->created_at,
        ];
    }

    public function create(array $data, User $actor): ReportingRelationship
    {
        $employee = User::query()->findOrFail((int) $data['employeeId']);
        $manager = User::query()->findOrFail((int) $data['managerId']);
        $companyId = isset($data['companyId']) && $data['companyId'] !== '' ? (int) $data['companyId'] : null;

        if ($employee->id === $manager->id) {
            throw new OrganizationException(
                'REPORTING_SELF_MANAGER',
                'An employee cannot be their own manager.',
                422
            );
        }

        if ($companyId) {
            $company = Company::query()->findOrFail($companyId);
            $this->assertCompanyVisible($company, $actor);
        }

        $relationshipType = $data['relationshipType'] ?? 'primary';

        // Validate one active primary manager per employee
        if ($relationshipType === 'primary') {
            $existingPrimary = ReportingRelationship::query()
                ->where('employee_id', $employee->id)
                ->where('relationship_type', 'primary')
                ->where('is_active', true)
                ->where(function ($q) use ($data) {
                    $q->where('effective_to', '>=', $data['effectiveFrom'])
                        ->orWhereNull('effective_to');
                })
                ->exists();

            if ($existingPrimary) {
                throw new OrganizationException(
                    'REPORTING_PRIMARY_EXISTS',
                    'This employee already has an active primary manager for the given period.',
                    422
                );
            }
        }

        // Validate no duplicate non-primary of same type
        if ($relationshipType !== 'primary') {
            $existing = ReportingRelationship::query()
                ->where('employee_id', $employee->id)
                ->where('relationship_type', $relationshipType)
                ->where('is_active', true)
                ->where(function ($q) use ($data) {
                    $q->where('effective_to', '>=', $data['effectiveFrom'])
                        ->orWhereNull('effective_to');
                })
                ->exists();

            if ($existing) {
                throw new OrganizationException(
                    'REPORTING_DUPLICATE_TYPE',
                    "This employee already has an active {$relationshipType} manager for the given period.",
                    422
                );
            }
        }

        // Validate cross-scope
        if ($companyId && $employee->company_code && $manager->company_code) {
            $employeeCompanies = explode(',', $employee->company_code);
            $managerCompanies = explode(',', $manager->company_code);
            $intersection = array_intersect($employeeCompanies, $managerCompanies);
            
            if (empty($intersection)) {
                throw new OrganizationException(
                    'REPORTING_CROSS_SCOPE',
                    'The employee and manager must share at least one company scope.',
                    422
                );
            }
        }

        $rel = DB::transaction(function () use ($employee, $manager, $companyId, $relationshipType, $data) {
            return ReportingRelationship::query()->create([
                'employee_id' => $employee->id,
                'manager_id' => $manager->id,
                'company_id' => $companyId,
                'relationship_type' => $relationshipType,
                'effective_from' => $data['effectiveFrom'],
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
                'is_active' => (bool) ($data['isActive'] ?? true),
                'notes' => $this->blankToNull($data['notes'] ?? null),
            ]);
        });

        // Update legacy compatibility field
        if ($relationshipType === 'primary') {
            $employee->manager_name = $manager->name;
            $employee->save();
        }

        $this->audit($actor, 'REPORTING_RELATIONSHIP_CREATED', null, $this->snapshot($rel));

        return $rel;
    }

    public function update(ReportingRelationship $rel, array $data, User $actor): ReportingRelationship
    {
        $this->assertRelationshipVisible($rel, $actor);
        $before = $this->snapshot($rel);

        if (array_key_exists('managerId', $data)) {
            $manager = User::query()->findOrFail((int) $data['managerId']);
            if ($rel->employee_id === $manager->id) {
                throw new OrganizationException(
                    'REPORTING_SELF_MANAGER',
                    'An employee cannot be their own manager.',
                    422
                );
            }
            $rel->manager_id = $manager->id;
        }

        if (array_key_exists('relationshipType', $data)) {
            $newType = $data['relationshipType'];
            $oldType = $rel->relationship_type;

            if ($newType !== $oldType) {
                // Check for conflicts
                if ($newType === 'primary') {
                    $existingPrimary = ReportingRelationship::query()
                        ->where('employee_id', $rel->employee_id)
                        ->where('relationship_type', 'primary')
                        ->where('is_active', true)
                        ->where('id', '!=', $rel->id)
                        ->where(function ($q) use ($rel) {
                            $q->where('effective_to', '>=', $rel->effective_from)
                                ->orWhereNull('effective_to');
                        })
                        ->exists();

                    if ($existingPrimary) {
                        throw new OrganizationException(
                            'REPORTING_PRIMARY_EXISTS',
                            'This employee already has an active primary manager for the given period.',
                            422
                        );
                    }
                } else {
                    $existing = ReportingRelationship::query()
                        ->where('employee_id', $rel->employee_id)
                        ->where('relationship_type', $newType)
                        ->where('is_active', true)
                        ->where('id', '!=', $rel->id)
                        ->where(function ($q) use ($rel) {
                            $q->where('effective_to', '>=', $rel->effective_from)
                                ->orWhereNull('effective_to');
                        })
                        ->exists();

                    if ($existing) {
                        throw new OrganizationException(
                            'REPORTING_DUPLICATE_TYPE',
                            "This employee already has an active {$newType} manager for the given period.",
                            422
                        );
                    }
                }

                $rel->relationship_type = $newType;
            }
        }

        if (array_key_exists('effectiveFrom', $data)) {
            $rel->effective_from = $data['effectiveFrom'];
        }

        if (array_key_exists('effectiveTo', $data)) {
            $rel->effective_to = $this->blankToNull($data['effectiveTo']);
        }

        if (array_key_exists('isActive', $data)) {
            $rel->is_active = (bool) $data['isActive'];
        }

        if (array_key_exists('notes', $data)) {
            $rel->notes = $this->blankToNull($data['notes']);
        }

        DB::transaction(fn () => $rel->save());

        // Update legacy compatibility field
        if ($rel->relationship_type === 'primary') {
            $employee = User::query()->find($rel->employee_id);
            $manager = User::query()->find($rel->manager_id);
            if ($employee && $manager) {
                $employee->manager_name = $manager->name;
                $employee->save();
            }
        }

        $this->audit($actor, 'REPORTING_RELATIONSHIP_UPDATED', $before, $this->snapshot($rel));

        return $rel;
    }

    public function delete(ReportingRelationship $rel, User $actor): void
    {
        $this->assertRelationshipVisible($rel, $actor);
        $snapshot = $this->snapshot($rel);
        DB::transaction(fn () => $rel->delete());
        $this->audit($actor, 'REPORTING_RELATIONSHIP_DELETED', $snapshot, null);
    }

    // Reporting Chain
    public function chain(int $employeeId, ?string $asOf, ?User $actor): array
    {
        $employee = User::query()->findOrFail($employeeId);
        
        if (!$this->hasGlobalCompanyScope($actor)) {
            $codes = $this->authorizedCompanyCodes($actor);
            if ($employee->company_code) {
                $employeeCompanies = explode(',', $employee->company_code);
                $intersection = array_intersect($employeeCompanies, $codes);
                if (empty($intersection)) {
                    throw new OrganizationException(
                        'REPORTING_CHAIN_NOT_AUTHORIZED',
                        'You do not have access to this employee\'s reporting chain.',
                        403
                    );
                }
            }
        }

        $date = $asOf ?? now()->toDateString();

        $chain = [];
        $currentEmployeeId = $employeeId;
        $depth = 0;

        while ($depth < 20) {
            $rel = ReportingRelationship::query()
                ->where('employee_id', $currentEmployeeId)
                ->where('relationship_type', 'primary')
                ->where('is_active', true)
                ->where('effective_from', '<=', $date)
                ->where(function ($q) use ($date) {
                    $q->where('effective_to', '>=', $date)
                        ->orWhereNull('effective_to');
                })
                ->with('manager')
                ->first();

            if (!$rel || !$rel->manager) {
                break;
            }

            $chain[] = [
                'level' => $depth + 1,
                'managerId' => (int) $rel->manager_id,
                'managerName' => $rel->manager->name,
                'managerEmpCode' => $rel->manager->emp_code,
                'relationshipType' => $rel->relationship_type,
                'effectiveFrom' => $rel->effective_from?->toDateString(),
                'effectiveTo' => $rel->effective_to?->toDateString(),
            ];

            $currentEmployeeId = $rel->manager_id;
            $depth++;
        }

        return $chain;
    }

    // Leadership Assignments
    public function leadershipAssignments(array $filters, ?User $actor): array
    {
        $query = OrganizationLeadershipAssignment::query()
            ->with(['user', 'enterprise', 'company'])
            ->orderBy('effective_from', 'desc');

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

        if (!empty($filters['userId'])) {
            $query->where('user_id', (int) $filters['userId']);
        }

        if (($type = (string) ($filters['leadershipType'] ?? '')) !== '' && $type !== 'ALL') {
            $query->where('leadership_type', $type);
        }

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('is_active', $status === 'ACTIVE');
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

        return $query->get()->map(fn (OrganizationLeadershipAssignment $assignment) => $this->presentLeadership($assignment))->all();
    }

    public function presentLeadership(OrganizationLeadershipAssignment $assignment): array
    {
        return [
            'id' => (int) $assignment->id,
            'enterpriseId' => $assignment->enterprise_id === null ? null : (int) $assignment->enterprise_id,
            'enterpriseName' => $assignment->enterprise?->name,
            'companyId' => $assignment->company_id === null ? null : (int) $assignment->company_id,
            'companyName' => $assignment->company?->name,
            'userId' => (int) $assignment->user_id,
            'userName' => $assignment->user?->name,
            'userEmpCode' => $assignment->user?->emp_code,
            'leadershipType' => $assignment->leadership_type,
            'scopeId' => (int) $assignment->scope_id,
            'scopeType' => $assignment->scope_type,
            'effectiveFrom' => $assignment->effective_from->toDateString(),
            'effectiveTo' => $assignment->effective_to?->toDateString(),
            'isActive' => (bool) $assignment->is_active,
            'notes' => $assignment->notes,
            'createdAt' => $assignment->created_at,
        ];
    }

    public function createLeadershipAssignment(array $data, User $actor): OrganizationLeadershipAssignment
    {
        $user = User::query()->findOrFail((int) $data['userId']);
        $enterpriseId = isset($data['enterpriseId']) && $data['enterpriseId'] !== '' ? (int) $data['enterpriseId'] : null;
        $companyId = isset($data['companyId']) && $data['companyId'] !== '' ? (int) $data['companyId'] : null;
        $scopeId = (int) $data['scopeId'];
        $scopeType = $data['scopeType'];

        if ($enterpriseId) {
            $enterprise = Enterprise::query()->findOrFail($enterpriseId);
            $this->assertEnterpriseVisible($enterprise, $actor);
        }

        if ($companyId) {
            $company = Company::query()->findOrFail($companyId);
            $this->assertCompanyVisible($company, $actor);
        }

        // Validate scope record exists
        $this->validateLeadershipScope($scopeType, $scopeId, $enterpriseId, $companyId);

        $assignment = DB::transaction(function () use ($user, $enterpriseId, $companyId, $scopeId, $scopeType, $data) {
            return OrganizationLeadershipAssignment::query()->create([
                'enterprise_id' => $enterpriseId,
                'company_id' => $companyId,
                'user_id' => $user->id,
                'leadership_type' => $data['leadershipType'],
                'scope_id' => $scopeId,
                'scope_type' => $scopeType,
                'effective_from' => $data['effectiveFrom'],
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
                'is_active' => (bool) ($data['isActive'] ?? true),
                'notes' => $this->blankToNull($data['notes'] ?? null),
            ]);
        });

        $this->audit($actor, 'LEADERSHIP_ASSIGNMENT_CREATED', null, $this->snapshotLeadership($assignment));

        return $assignment;
    }

    public function updateLeadershipAssignment(OrganizationLeadershipAssignment $assignment, array $data, User $actor): OrganizationLeadershipAssignment
    {
        $this->assertLeadershipVisible($assignment, $actor);
        $before = $this->snapshotLeadership($assignment);

        if (array_key_exists('leadershipType', $data)) {
            $assignment->leadership_type = $data['leadershipType'];
        }

        if (array_key_exists('scopeId', $data)) {
            $scopeId = (int) $data['scopeId'];
            $this->validateLeadershipScope($assignment->scope_type, $scopeId, $assignment->enterprise_id, $assignment->company_id);
            $assignment->scope_id = $scopeId;
        }

        if (array_key_exists('scopeType', $data)) {
            $this->validateLeadershipScope($data['scopeType'], $assignment->scope_id, $assignment->enterprise_id, $assignment->company_id);
            $assignment->scope_type = $data['scopeType'];
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

        $this->audit($actor, 'LEADERSHIP_ASSIGNMENT_UPDATED', $before, $this->snapshotLeadership($assignment));

        return $assignment;
    }

    public function deleteLeadershipAssignment(OrganizationLeadershipAssignment $assignment, User $actor): void
    {
        $this->assertLeadershipVisible($assignment, $actor);
        $snapshot = $this->snapshotLeadership($assignment);
        DB::transaction(fn () => $assignment->delete());
        $this->audit($actor, 'LEADERSHIP_ASSIGNMENT_DELETED', $snapshot, null);
    }

    private function validateLeadershipScope(string $scopeType, int $scopeId, ?int $enterpriseId, ?int $companyId): void
    {
        $modelClass = match ($scopeType) {
            'department' => Department::class,
            'organization_unit' => OrganizationUnit::class,
            'organization_location' => OrganizationLocation::class,
            'financial_organization' => FinancialOrganization::class,
            default => null,
        };

        if (!$modelClass) {
            throw new OrganizationException(
                'LEADERSHIP_INVALID_SCOPE_TYPE',
                "Invalid leadership scope type: {$scopeType}",
                422
            );
        }

        $record = $modelClass::query()->find($scopeId);

        if (!$record) {
            throw new OrganizationException(
                'LEADERSHIP_SCOPE_NOT_FOUND',
                "The referenced {$scopeType} record does not exist.",
                422
            );
        }

        if ($enterpriseId && $record->enterprise_id && $record->enterprise_id !== $enterpriseId) {
            throw new OrganizationException(
                'LEADERSHIP_SCOPE_MISMATCH',
                "The referenced record does not belong to the assignment's enterprise.",
                422
            );
        }

        if ($companyId && $record->company_id && $record->company_id !== $companyId) {
            throw new OrganizationException(
                'LEADERSHIP_SCOPE_MISMATCH',
                "The referenced record does not belong to the assignment's company.",
                422
            );
        }
    }

    private function assertRelationshipVisible(ReportingRelationship $rel, ?User $actor): void
    {
        if (!$rel->company_id) {
            return;
        }

        $company = Company::query()->find($rel->company_id);

        if ($company) {
            $this->assertCompanyVisible($company, $actor);
        }
    }

    private function assertLeadershipVisible(OrganizationLeadershipAssignment $assignment, ?User $actor): void
    {
        if ($assignment->enterprise_id) {
            $enterprise = Enterprise::query()->find($assignment->enterprise_id);
            if ($enterprise) {
                $this->assertEnterpriseVisible($enterprise, $actor);
            }
        }

        if ($assignment->company_id) {
            $company = Company::query()->find($assignment->company_id);
            if ($company) {
                $this->assertCompanyVisible($company, $actor);
            }
        }
    }

    private function assertEnterpriseVisible(Enterprise $enterprise, ?User $actor): void
    {
        if ($this->hasGlobalCompanyScope($actor)) {
            return;
        }

        $codes = $this->authorizedCompanyCodes($actor);
        $companyIds = Company::query()->whereIn('code', $codes)->pluck('id')->all();

        $hasAccess = $enterprise->companies()
            ->wherePivot('is_active', true)
            ->whereIn('companies.id', $companyIds)
            ->exists();

        if (! $hasAccess) {
            throw new OrganizationException(
                'ENTERPRISE_NOT_VISIBLE',
                'You do not have access to this enterprise.',
                403
            );
        }
    }

    private function blankToNull(mixed $value): ?string
    {
        if ($value === null || (is_string($value) && trim($value) === '')) {
            return null;
        }
        return trim((string) $value);
    }

    private function snapshot(ReportingRelationship $rel): array
    {
        return [
            'id' => (int) $rel->id,
            'employeeId' => (int) $rel->employee_id,
            'managerId' => (int) $rel->manager_id,
            'relationshipType' => $rel->relationship_type,
            'effectiveFrom' => $rel->effective_from?->toDateString(),
            'isActive' => (bool) $rel->is_active,
        ];
    }

    private function snapshotLeadership(OrganizationLeadershipAssignment $assignment): array
    {
        return [
            'id' => (int) $assignment->id,
            'userId' => (int) $assignment->user_id,
            'leadershipType' => $assignment->leadership_type,
            'scopeId' => (int) $assignment->scope_id,
            'scopeType' => $assignment->scope_type,
            'effectiveFrom' => $assignment->effective_from->toDateString(),
            'isActive' => (bool) $assignment->is_active,
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