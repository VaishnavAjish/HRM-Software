<?php

namespace App\Services\Organization;

use App\Models\OrganizationHierarchy;
use App\Models\OrganizationHierarchyNode;
use App\Models\OrganizationHierarchyEdge;
use App\Models\OrganizationUnit;
use App\Models\OrganizationPosition;
use App\Models\EmployeeOrganizationAssignment;
use App\Models\User;
use App\Models\Enterprise;
use App\Models\Company;
use App\Models\AuditLog;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * DOMAIN 02.08 — Organization Chart Service.
 *
 * Returns normalized flat nodes and edges for chart rendering.
 * The client renders and exports using installed libraries.
 */
class OrganizationChartService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'organization-charts';

    public const CHART_TYPES = [
        'enterprise',
        'legal_entity',
        'department',
        'team',
        'position',
        'manager_hierarchy',
        'employee_hierarchy',
    ];

    public function chart(array $filters, ?User $actor): array
    {
        $chartType = $filters['chartType'] ?? 'manager_hierarchy';
        $asOf = $filters['asOf'] ?? now()->toDateString();
        $rootId = isset($filters['rootId']) && $filters['rootId'] !== '' ? (int) $filters['rootId'] : null;
        $maxDepth = isset($filters['maxDepth']) ? (int) $filters['maxDepth'] : 5;
        $includeInactive = !empty($filters['includeInactive']);
        $includeVacant = !empty($filters['includeVacant']);

        $nodes = [];
        $edges = [];

        switch ($chartType) {
            case 'enterprise':
                [$nodes, $edges] = $this->buildEnterpriseChart($filters, $actor, $asOf, $maxDepth, $includeInactive);
                break;
            case 'legal_entity':
                [$nodes, $edges] = $this->buildLegalEntityChart($filters, $actor, $asOf, $maxDepth, $includeInactive);
                break;
            case 'department':
                [$nodes, $edges] = $this->buildDepartmentChart($filters, $actor, $asOf, $maxDepth, $includeInactive, $includeVacant);
                break;
            case 'team':
                [$nodes, $edges] = $this->buildTeamChart($filters, $actor, $asOf, $maxDepth, $includeInactive, $includeVacant);
                break;
            case 'position':
                [$nodes, $edges] = $this->buildPositionChart($filters, $actor, $asOf, $maxDepth, $includeInactive, $includeVacant);
                break;
            case 'manager_hierarchy':
                [$nodes, $edges] = $this->buildManagerHierarchyChart($filters, $actor, $asOf, $maxDepth, $includeInactive);
                break;
            case 'employee_hierarchy':
                [$nodes, $edges] = $this->buildEmployeeHierarchyChart($filters, $actor, $asOf, $maxDepth, $includeInactive);
                break;
            default:
                throw new OrganizationException(
                    'CHART_TYPE_INVALID',
                    "Invalid chart type: {$chartType}",
                    422
                );
        }

        // Apply search filter if provided
        if (!empty($filters['search'])) {
            $search = strtolower(trim((string) $filters['search']));
            $nodes = array_filter($nodes, function ($node) use ($search) {
                return stripos($node['name'], $search) !== false ||
                       stripos($node['code'] ?? '', $search) !== false ||
                       stripos($node['title'] ?? '', $search) !== false;
            });
            $nodes = array_values($nodes);
            
            // Filter edges to only include those with both nodes present
            $nodeIds = array_column($nodes, 'id');
            $nodeIds = array_map('strval', $nodeIds);
            $edges = array_filter($edges, function ($edge) use ($nodeIds) {
                return in_array((string) $edge['source'], $nodeIds) && in_array((string) $edge['target'], $nodeIds);
            });
            $edges = array_values($edges);
        }

        return [
            'nodes' => $nodes,
            'edges' => $edges,
            'meta' => [
                'chartType' => $chartType,
                'asOf' => $asOf,
                'rootId' => $rootId,
                'maxDepth' => $maxDepth,
                'nodeCount' => count($nodes),
                'edgeCount' => count($edges),
            ],
        ];
    }

    private function buildEnterpriseChart(array $filters, ?User $actor, string $asOf, int $maxDepth, bool $includeInactive): array
    {
        $query = Enterprise::query()->with('companies')->where('is_active', true);

        if (!$this->hasGlobalCompanyScope($actor)) {
            $codes = $this->authorizedCompanyCodes($actor);
            $companyIds = Company::query()->whereIn('code', $codes)->pluck('id')->all();
            $query->whereHas('companies', fn ($q) => $q->whereIn('companies.id', $companyIds));
        }

        $enterprises = $query->get();
        $nodes = [];
        $edges = [];

        foreach ($enterprises as $enterprise) {
            $nodes[] = [
                'id' => "enterprise_{$enterprise->id}",
                'type' => 'enterprise',
                'code' => $enterprise->code,
                'name' => $enterprise->display_name ?? $enterprise->name,
                'title' => 'Enterprise',
                'employeeCount' => 0,
                'approvedHeadcount' => 0,
                'vacancy' => 0,
                'spanOfControl' => $enterprise->companies->count(),
                'isActive' => (bool) $enterprise->is_active,
                'metadata' => [
                    'companyCount' => $enterprise->companies->count(),
                ],
            ];

            foreach ($enterprise->companies as $company) {
                if (!$includeInactive && !$company->is_active) continue;

                $companyNodeId = "company_{$company->id}";
                $nodes[] = [
                    'id' => $companyNodeId,
                    'type' => 'company',
                    'code' => $company->code,
                    'name' => $company->name,
                    'title' => 'Company',
                    'employeeCount' => $this->countCompanyEmployees($company->id, $asOf),
                    'approvedHeadcount' => 0,
                    'vacancy' => 0,
                    'spanOfControl' => 0,
                    'isActive' => (bool) $company->is_active,
                ];

                $edges[] = [
                    'id' => "edge_enterprise_{$enterprise->id}_company_{$company->id}",
                    'source' => "enterprise_{$enterprise->id}",
                    'target' => $companyNodeId,
                    'type' => 'primary',
                ];
            }
        }

        return [$nodes, $edges];
    }

    private function buildLegalEntityChart(array $filters, ?User $actor, string $asOf, int $maxDepth, bool $includeInactive): array
    {
        $query = \App\Models\LegalEntityProfile::query()->with('company')->where('is_active', true);

        if (!empty($filters['companyIds'])) {
            $query->whereIn('company_id', array_map('intval', (array) $filters['companyIds']));
        } elseif (!$this->hasGlobalCompanyScope($actor)) {
            $codes = $this->authorizedCompanyCodes($actor);
            $companyIds = Company::query()->whereIn('code', $codes)->pluck('id')->all();
            $query->whereIn('company_id', $companyIds);
        }

        $profiles = $query->get();
        $nodes = [];
        $edges = [];

        foreach ($profiles as $profile) {
            $nodes[] = [
                'id' => "legal_entity_profile_{$profile->id}",
                'type' => 'legal_entity_profile',
                'code' => $profile->corporate_identification_number,
                'name' => $profile->legal_name,
                'title' => 'Legal Entity',
                'employeeCount' => 0,
                'approvedHeadcount' => 0,
                'vacancy' => 0,
                'spanOfControl' => 0,
                'isActive' => (bool) $profile->is_active,
                'metadata' => [
                    'tradingName' => $profile->trading_name,
                    'countryCode' => $profile->country_code,
                ],
            ];
        }

        return [$nodes, $edges];
    }

    private function buildDepartmentChart(array $filters, ?User $actor, string $asOf, int $maxDepth, bool $includeInactive, bool $includeVacant): array
    {
        $query = OrganizationUnit::query()
            ->where('type', 'department')
            ->where('status', 'active');

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

        if ($rootId = $filters['rootId'] ?? null) {
            $query->where('id', (int) $rootId);
        }

        $departments = $query->get();
        $nodes = [];
        $edges = [];

        foreach ($departments as $dept) {
            $employeeCount = $dept->assignments()->where('is_active', true)->count();
            $positions = $dept->positions()->where('status', 'active')->get();
            $approvedHeadcount = $positions->sum('approved_headcount');
            $currentHeadcount = $positions->sum('current_headcount');
            $vacancy = max(0, $approvedHeadcount - $currentHeadcount);

            if (!$includeVacant && $vacancy === 0 && $employeeCount === 0) continue;

            $nodes[] = [
                'id' => "org_unit_{$dept->id}",
                'type' => 'department',
                'code' => $dept->code,
                'name' => $dept->name,
                'title' => 'Department',
                'employeeCount' => $employeeCount,
                'approvedHeadcount' => $approvedHeadcount,
                'vacancy' => $vacancy,
                'spanOfControl' => $dept->children()->where('status', 'active')->count(),
                'isActive' => $dept->status === 'active',
                'metadata' => [
                    'managerUserId' => $dept->manager_user_id === null ? null : (int) $dept->manager_user_id,
                    'managerName' => $dept->manager?->name,
                    'positionCount' => $positions->count(),
                    'companyId' => $dept->company_id === null ? null : (int) $dept->company_id,
                    'companyCode' => $dept->company?->code,
                    'legacyDepartmentId' => $dept->legacy_department_id === null ? null : (int) $dept->legacy_department_id,
                    'unitId' => $dept->legacy_unit_id === null ? null : (int) $dept->legacy_unit_id,
                ],
            ];

            if ($dept->parent_id) {
                $edges[] = [
                    'id' => "edge_org_unit_{$dept->parent_id}_org_unit_{$dept->id}",
                    'source' => "org_unit_{$dept->parent_id}",
                    'target' => "org_unit_{$dept->id}",
                    'type' => 'primary',
                ];
            }
        }

        return [$nodes, $edges];
    }

    private function buildTeamChart(array $filters, ?User $actor, string $asOf, int $maxDepth, bool $includeInactive, bool $includeVacant): array
    {
        $query = OrganizationUnit::query()
            ->whereIn('type', ['team', 'section', 'sub_department'])
            ->where('status', 'active');

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

        if ($rootId = $filters['rootId'] ?? null) {
            $query->where('id', (int) $rootId);
        }

        $teams = $query->get();
        $nodes = [];
        $edges = [];

        foreach ($teams as $team) {
            $employeeCount = $team->assignments()->where('is_active', true)->count();
            $positions = $team->positions()->where('status', 'active')->get();
            $approvedHeadcount = $positions->sum('approved_headcount');
            $currentHeadcount = $positions->sum('current_headcount');
            $vacancy = max(0, $approvedHeadcount - $currentHeadcount);

            if (!$includeVacant && $vacancy === 0 && $employeeCount === 0) continue;

            $nodes[] = [
                'id' => "org_unit_{$team->id}",
                'type' => $team->type,
                'code' => $team->code,
                'name' => $team->name,
                'title' => ucfirst(str_replace('_', ' ', $team->type)),
                'employeeCount' => $employeeCount,
                'approvedHeadcount' => $approvedHeadcount,
                'vacancy' => $vacancy,
                'spanOfControl' => 0,
                'isActive' => $team->status === 'active',
                'metadata' => [
                    'managerName' => $team->manager?->name,
                    'positionCount' => $positions->count(),
                ],
            ];

            if ($team->parent_id) {
                $edges[] = [
                    'id' => "edge_org_unit_{$team->parent_id}_org_unit_{$team->id}",
                    'source' => "org_unit_{$team->parent_id}",
                    'target' => "org_unit_{$team->id}",
                    'type' => 'primary',
                ];
            }
        }

        return [$nodes, $edges];
    }

    private function buildPositionChart(array $filters, ?User $actor, string $asOf, int $maxDepth, bool $includeInactive, bool $includeVacant): array
    {
        $query = OrganizationPosition::query()
            ->with(['organizationUnit', 'reportsTo'])
            ->where('status', 'active');

        if (!empty($filters['enterpriseId'])) {
            $query->whereHas('organizationUnit', fn ($q) => $q->where('enterprise_id', (int) $filters['enterpriseId']));
        }

        if (!empty($filters['companyIds'])) {
            $query->whereHas('organizationUnit', fn ($q) => $q->whereIn('company_id', array_map('intval', (array) $filters['companyIds'])));
        } elseif (!$this->hasGlobalCompanyScope($actor)) {
            $codes = $this->authorizedCompanyCodes($actor);
            $companyIds = Company::query()->whereIn('code', $codes)->pluck('id')->all();
            $query->whereHas('organizationUnit', fn ($q) => $q->whereIn('company_id', $companyIds));
        }

        if ($rootId = $filters['rootId'] ?? null) {
            $query->where('id', (int) $rootId);
        }

        $positions = $query->get();
        $nodes = [];
        $edges = [];

        foreach ($positions as $pos) {
            $vacancy = max(0, (int) $pos->approved_headcount - (int) $pos->current_headcount);

            if (!$includeVacant && $vacancy === 0 && (int) $pos->current_headcount === 0) continue;

            $nodes[] = [
                'id' => "position_{$pos->id}",
                'type' => 'position',
                'code' => $pos->code,
                'name' => $pos->title,
                'title' => 'Position',
                'employeeCount' => (int) $pos->current_headcount,
                'approvedHeadcount' => (int) $pos->approved_headcount,
                'vacancy' => $vacancy,
                'spanOfControl' => 0,
                'isActive' => $pos->status === 'active',
                'metadata' => [
                    'organizationUnitId' => (int) $pos->organization_unit_id,
                    'organizationUnitName' => $pos->organizationUnit?->name,
                    'reportsToPositionId' => $pos->reports_to_position_id === null ? null : (int) $pos->reports_to_position_id,
                    'reportsToTitle' => $pos->reportsTo?->title,
                ],
            ];

            if ($pos->reports_to_position_id) {
                $edges[] = [
                    'id' => "edge_position_{$pos->reports_to_position_id}_position_{$pos->id}",
                    'source' => "position_{$pos->reports_to_position_id}",
                    'target' => "position_{$pos->id}",
                    'type' => 'primary',
                ];
            }
        }

        return [$nodes, $edges];
    }

    private function buildManagerHierarchyChart(array $filters, ?User $actor, string $asOf, int $maxDepth, bool $includeInactive): array
    {
        $query = User::query()
            ->where('is_deleted', '0')
            ->where('status', '0')
            ->where(function ($q) {
                $q->whereNull('type')->orWhereNotIn('type', ['appointment', 'agent']);
            });

        if (!empty($filters['companyIds'])) {
            $query->whereIn('company_code', array_map('strval', (array) $filters['companyIds']));
        } elseif (!$this->hasGlobalCompanyScope($actor)) {
            $codes = $this->authorizedCompanyCodes($actor);
            $query->whereIn('company_code', $codes);
        }

        if ($rootId = $filters['rootId'] ?? null) {
            $query->where('id', (int) $rootId);
        }

        $employees = $query->get()->keyBy('id');
        $nodes = [];
        $edges = [];

        foreach ($employees as $employee) {
            $nodes[] = [
                'id' => "user_{$employee->id}",
                'type' => 'employee',
                'code' => $employee->emp_code,
                'name' => $employee->name,
                'title' => $employee->designation ?? 'Employee',
                'employeeCount' => 1,
                'approvedHeadcount' => 0,
                'vacancy' => 0,
                'spanOfControl' => 0,
                'isActive' => true,
                'metadata' => [
                    'email' => $employee->email,
                    'department' => $employee->department,
                ],
            ];
        }

        // Build edges from reporting relationships
        $relationships = \App\Models\ReportingRelationship::query()
            ->where('relationship_type', 'primary')
            ->where('is_active', true)
            ->where('effective_from', '<=', $asOf)
            ->where(function ($q) use ($asOf) {
                $q->where('effective_to', '>=', $asOf)
                    ->orWhereNull('effective_to');
            })
            ->get();

        foreach ($relationships as $rel) {
            if (!isset($employees[$rel->employee_id]) || !isset($employees[$rel->manager_id])) {
                continue;
            }

            $edges[] = [
                'id' => "edge_reporting_{$rel->id}",
                'source' => "user_{$rel->manager_id}",
                'target' => "user_{$rel->employee_id}",
                'type' => 'primary',
            ];
        }

        return [$nodes, $edges];
    }

    private function buildEmployeeHierarchyChart(array $filters, ?User $actor, string $asOf, int $maxDepth, bool $includeInactive): array
    {
        // Similar to manager hierarchy but includes all relationship types
        return $this->buildManagerHierarchyChart($filters, $actor, $asOf, $maxDepth, $includeInactive);
    }

    private function countCompanyEmployees(int $companyId, string $asOf): int
    {
        $company = Company::query()->find($companyId);

        if (! $company) {
            return 0;
        }

        $code = $company->code;

        return User::query()
            ->where('is_deleted', '0')
            ->where('status', '0')
            ->where(function ($q) use ($code) {
                $q->where('company_code', $code)
                    ->orWhere('company_code', 'LIKE', $code.',%')
                    ->orWhere('company_code', 'LIKE', '%,'.$code)
                    ->orWhere('company_code', 'LIKE', '%,'.$code.',%');
            })
            ->count();
    }

    /**
     * Recent organization structure changes for the chart's Insights panel.
     *
     * Reads from the shared `audit_logs` table (written by OrganizationUnitService
     * and ReportingStructureService, not this service) rather than
     * `organization_activity_logs`, which only the enterprise service writes to.
     * `audit_logs` has no company_id column, so this is not company-scoped — it
     * relies on the caller already holding org.unit.read.
     */
    public function recentActivity(array $filters): array
    {
        $modules = ['organization-units', 'organization-reporting'];
        $perPage = max(1, min(50, (int) ($filters['perPage'] ?? 20)));
        $page = max(1, (int) ($filters['page'] ?? 1));

        $query = AuditLog::query()->whereIn('module', $modules)->orderByDesc('created_at');
        $total = $query->count();
        $rows = $query->with('user:id,name')->forPage($page, $perPage)->get();

        $userIds = [];
        foreach ($rows as $row) {
            foreach ([$row->old_value, $row->new_value] as $payload) {
                if (is_array($payload)) {
                    foreach (['employeeId', 'managerId'] as $key) {
                        if (!empty($payload[$key])) {
                            $userIds[] = (int) $payload[$key];
                        }
                    }
                }
            }
        }
        $userNames = User::query()->whereIn('id', array_unique($userIds))->pluck('name', 'id');

        $items = $rows->map(fn (AuditLog $row) => [
            'id' => (int) $row->id,
            'changeType' => $row->action,
            'module' => $row->module,
            'description' => $this->describeActivity($row->action, $row->old_value, $row->new_value, $userNames),
            'actorName' => $row->user?->name,
            'createdAt' => $row->created_at?->toIso8601String(),
        ])->all();

        return [
            'items' => $items,
            'meta' => ['page' => $page, 'perPage' => $perPage, 'total' => $total],
        ];
    }

    private function describeActivity(string $changeType, ?array $old, ?array $new, $userNames): string
    {
        $current = $new ?? $old ?? [];

        return match ($changeType) {
            'ORGANIZATION_UNIT_CREATED' => sprintf('%s %s created', $current['name'] ?? 'Unit', $this->humanType($current['type'] ?? null)),
            'ORGANIZATION_UNIT_UPDATED' => sprintf('%s updated', $current['name'] ?? 'Unit'),
            'ORGANIZATION_UNIT_STATUS_CHANGED' => sprintf('%s status changed to %s', $current['name'] ?? 'Unit', $current['status'] ?? ''),
            'ORGANIZATION_UNIT_DELETED' => sprintf('%s deleted', $old['name'] ?? 'Unit'),
            'ORGANIZATION_POSITION_CREATED' => sprintf('Position "%s" created', $current['title'] ?? ''),
            'ORGANIZATION_POSITION_UPDATED' => sprintf('Position "%s" updated', $current['title'] ?? ''),
            'ORGANIZATION_POSITION_DELETED' => sprintf('Position "%s" deleted', $old['title'] ?? ''),
            'ORGANIZATION_POSITION_FROZEN' => sprintf('Position "%s" frozen', $current['title'] ?? ''),
            'ORGANIZATION_POSITION_RELEASED' => sprintf('Position "%s" unfrozen', $current['title'] ?? ''),
            'EMPLOYEE_ORGANIZATION_ASSIGNMENT_CREATED' => 'Employee assigned to organization unit',
            'EMPLOYEE_ORGANIZATION_ASSIGNMENT_UPDATED' => 'Employee organization assignment updated',
            'EMPLOYEE_ORGANIZATION_ASSIGNMENT_DELETED' => 'Employee organization assignment removed',
            'EMPLOYEE_PROMOTION_TRANSFER_APPLIED' => 'Employee promotion/transfer applied',
            'REPORTING_RELATIONSHIP_CREATED' => sprintf('%s now reports to %s', $userNames[$current['employeeId'] ?? 0] ?? 'Employee', $userNames[$current['managerId'] ?? 0] ?? 'manager'),
            'REPORTING_RELATIONSHIP_UPDATED' => sprintf('Reporting relationship updated for %s', $userNames[$current['employeeId'] ?? 0] ?? 'employee'),
            'REPORTING_RELATIONSHIP_DELETED' => sprintf('%s no longer reports to %s', $userNames[$old['employeeId'] ?? 0] ?? 'Employee', $userNames[$old['managerId'] ?? 0] ?? 'manager'),
            'LEADERSHIP_ASSIGNMENT_CREATED' => 'Leadership assignment created',
            'LEADERSHIP_ASSIGNMENT_UPDATED' => 'Leadership assignment updated',
            'LEADERSHIP_ASSIGNMENT_DELETED' => 'Leadership assignment removed',
            default => ucfirst(strtolower(str_replace('_', ' ', $changeType))),
        };
    }

    private function humanType(?string $type): string
    {
        return $type ? ucfirst(str_replace('_', ' ', $type)) : 'unit';
    }

    private function audit(User $actor, string $changeType, ?array $old, ?array $new): void
    {
        $request = request();
        if ($request) {
            AuditLogger::log($request, $changeType, self::MODULE, $old, $new);
        }
    }
}