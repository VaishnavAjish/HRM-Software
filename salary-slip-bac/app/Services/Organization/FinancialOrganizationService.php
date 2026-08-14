<?php

namespace App\Services\Organization;

use App\Models\FinancialOrganization;
use App\Models\FinancialGlMapping;
use App\Models\FinancialAllocationRule;
use App\Models\FinancialAllocationLine;
use App\Models\Enterprise;
use App\Models\Company;
use App\Models\User;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * DOMAIN 02.05 — Financial Organization Service.
 */
class FinancialOrganizationService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'organization-financial';

    public const TYPES = [
        'cost_center',
        'profit_center',
        'budget_center',
        'payroll_area',
        'expense_unit',
        'finance_business_unit',
        'project_cost_code',
        'internal_order',
    ];

    public function organizations(array $filters, ?User $actor): array
    {
        $query = FinancialOrganization::query()
            ->with(['enterprise', 'company', 'parent', 'manager'])
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

        return $query->get()->map(fn (FinancialOrganization $org) => $this->present($org))->all();
    }

    public function treeOptions(array $filters, ?User $actor, ?int $excludeId = null): array
    {
        $orgs = $this->organizations($filters, $actor);
        $byId = [];

        foreach ($orgs as $org) {
            $byId[$org['id']] = $org;
        }

        $labels = $this->pathLabels($byId);

        return array_map(static function (array $org) use ($labels, $excludeId) {
            return [
                'id' => $org['id'],
                'name' => $org['name'],
                'type' => $org['type'],
                'path' => $labels[$org['id']] ?? $org['name'],
                'excluded' => $excludeId !== null && $this->isSelfOrDescendant($org['id'], $excludeId, $byId),
            ];
        }, array_values($byId));
    }

    public function present(FinancialOrganization $org): array
    {
        return [
            'id' => (int) $org->id,
            'enterpriseId' => $org->enterprise_id === null ? null : (int) $org->enterprise_id,
            'enterpriseName' => $org->enterprise?->name,
            'companyId' => $org->company_id === null ? null : (int) $org->company_id,
            'companyName' => $org->company?->name,
            'parentId' => $org->parent_id === null ? null : (int) $org->parent_id,
            'parentName' => $org->parent?->name,
            'code' => $org->code,
            'name' => $org->name,
            'type' => $org->type,
            'status' => $org->status,
            'description' => $org->description,
            'managerUserId' => $org->manager_user_id === null ? null : (int) $org->manager_user_id,
            'managerName' => $org->manager?->name,
            'legacyCostCenterId' => $org->legacy_cost_center_id === null ? null : (int) $org->legacy_cost_center_id,
            'effectiveFrom' => $org->effective_from?->toDateString(),
            'effectiveTo' => $org->effective_to?->toDateString(),
            'hasChildren' => $org->children()->exists(),
            'glMappingCount' => $org->glMappings()->where('is_active', true)->count(),
            'allocationRuleCount' => $org->allocationRulesAsSource()->where('is_active', true)->count(),
            'createdAt' => $org->created_at,
        ];
    }

    public function create(array $data, User $actor): FinancialOrganization
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
                    'Financial organizations cannot be added to an inactive company.',
                    422
                );
            }
        }

        $this->assertCodeFree($enterpriseId, $companyId, trim((string) ($data['code'] ?: $data['name'])), null);
        $this->resolveParent($enterpriseId, $companyId, $parentId, null);

        $org = DB::transaction(function () use ($data, $enterpriseId, $companyId, $parentId, $actor) {
            return FinancialOrganization::query()->create([
                'enterprise_id' => $enterpriseId,
                'company_id' => $companyId,
                'parent_id' => $parentId,
                'code' => trim((string) ($data['code'] ?: $data['name'])),
                'name' => trim((string) $data['name']),
                'type' => $data['type'] ?? 'cost_center',
                'status' => $data['status'] ?? 'active',
                'description' => $this->blankToNull($data['description'] ?? null),
                'manager_user_id' => isset($data['managerUserId']) && $data['managerUserId'] !== '' ? (int) $data['managerUserId'] : null,
                'legacy_cost_center_id' => isset($data['legacyCostCenterId']) && $data['legacyCostCenterId'] !== '' ? (int) $data['legacyCostCenterId'] : null,
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);
        });

        $this->audit($actor, 'FINANCIAL_ORGANIZATION_CREATED', null, $this->snapshot($org));

        return $org;
    }

    public function update(FinancialOrganization $org, array $data, User $actor): FinancialOrganization
    {
        $this->assertOrgVisible($org, $actor);
        $before = $this->snapshot($org);

        if (array_key_exists('enterpriseId', $data)) {
            $enterpriseId = $data['enterpriseId'] === '' || $data['enterpriseId'] === null ? null : (int) $data['enterpriseId'];
            if ($enterpriseId !== $org->enterprise_id) {
                if ($enterpriseId) {
                    $enterprise = Enterprise::query()->findOrFail($enterpriseId);
                    $this->assertEnterpriseVisible($enterprise, $actor);
                }
                $org->enterprise_id = $enterpriseId;
            }
        }

        if (array_key_exists('companyId', $data)) {
            $companyId = $data['companyId'] === '' || $data['companyId'] === null ? null : (int) $data['companyId'];
            if ($companyId !== $org->company_id) {
                if ($companyId) {
                    $company = Company::query()->findOrFail($companyId);
                    $this->assertCompanyVisible($company, $actor);
                }
                $org->company_id = $companyId;
            }
        }

        if (array_key_exists('code', $data)) {
            $code = trim((string) $data['code']);
            $this->assertCodeFree($org->enterprise_id, $org->company_id, $code, $org->id);
            $org->code = $code;
        }

        if (array_key_exists('name', $data)) {
            $org->name = trim((string) $data['name']);
        }

        if (array_key_exists('type', $data)) {
            $org->type = $data['type'];
        }

        if (array_key_exists('status', $data)) {
            $org->status = $data['status'];
        }

        if (array_key_exists('description', $data)) {
            $org->description = $this->blankToNull($data['description']);
        }

        if (array_key_exists('parentId', $data)) {
            $parentId = $data['parentId'] === '' || $data['parentId'] === null ? null : (int) $data['parentId'];
            $this->resolveParent($org->enterprise_id, $org->company_id, $parentId, $org->id);
            $org->parent_id = $parentId;
        }

        $pairs = [
            'managerUserId' => 'manager_user_id',
            'legacyCostCenterId' => 'legacy_cost_center_id',
            'effectiveFrom' => 'effective_from',
            'effectiveTo' => 'effective_to',
        ];

        foreach ($pairs as $key => $column) {
            if (array_key_exists($key, $data)) {
                $org->{$column} = $data[$key] === '' || $data[$key] === null ? null : (int) $data[$key];
            }
        }

        DB::transaction(fn () => $org->save());

        $this->audit($actor, 'FINANCIAL_ORGANIZATION_UPDATED', $before, $this->snapshot($org));

        return $org;
    }

    public function setStatus(FinancialOrganization $org, string $status, User $actor): FinancialOrganization
    {
        $this->assertOrgVisible($org, $actor);
        $before = $this->snapshot($org);

        if ($status === 'closed' && $org->children()->where('status', 'active')->exists()) {
            throw new OrganizationException(
                'FINANCIAL_ORGANIZATION_HAS_ACTIVE_CHILDREN',
                'Cannot close this organization while it has active children. Move or close them first.',
                422
            );
        }

        $org->status = $status;
        $org->save();

        $this->audit($actor, 'FINANCIAL_ORGANIZATION_STATUS_CHANGED', $before, $this->snapshot($org));

        return $org;
    }

    public function delete(FinancialOrganization $org, User $actor): void
    {
        $this->assertOrgVisible($org, $actor);

        if ($org->children()->exists()) {
            throw new OrganizationException(
                'FINANCIAL_ORGANIZATION_HAS_CHILDREN',
                'Cannot delete this organization while sub-organizations exist under it. Move them first.',
                422
            );
        }

        if ($org->glMappings()->where('is_active', true)->exists()) {
            throw new OrganizationException(
                'FINANCIAL_ORGANIZATION_HAS_GL_MAPPINGS',
                'Cannot delete this organization while GL mappings exist. Remove them first.',
                422
            );
        }

        if ($org->allocationRulesAsSource()->where('is_active', true)->exists()) {
            throw new OrganizationException(
                'FINANCIAL_ORGANIZATION_HAS_ALLOCATION_RULES',
                'Cannot delete this organization while allocation rules exist. Remove them first.',
                422
            );
        }

        $snapshot = $this->snapshot($org);

        DB::transaction(fn () => $org->delete());

        $this->audit($actor, 'FINANCIAL_ORGANIZATION_DELETED', $snapshot, null);
    }

    // GL Mappings
    public function glMappings(int $orgId, array $filters, ?User $actor): array
    {
        $org = FinancialOrganization::query()->findOrFail($orgId);
        $this->assertOrgVisible($org, $actor);

        $query = $org->glMappings()->orderBy('gl_account_code');

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('is_active', $status === 'ACTIVE');
        }

        return $query->get()->map(fn (FinancialGlMapping $mapping) => $this->presentGlMapping($mapping))->all();
    }

    public function presentGlMapping(FinancialGlMapping $mapping): array
    {
        return [
            'id' => (int) $mapping->id,
            'financialOrganizationId' => (int) $mapping->financial_organization_id,
            'glAccountCode' => $mapping->gl_account_code,
            'glAccountName' => $mapping->gl_account_name,
            'mappingType' => $mapping->mapping_type,
            'isActive' => (bool) $mapping->is_active,
            'effectiveFrom' => $mapping->effective_from?->toDateString(),
            'effectiveTo' => $mapping->effective_to?->toDateString(),
            'createdAt' => $mapping->created_at,
        ];
    }

    public function createGlMapping(int $orgId, array $data, User $actor): FinancialGlMapping
    {
        $org = FinancialOrganization::query()->findOrFail($orgId);
        $this->assertOrgVisible($org, $actor);

        $mapping = DB::transaction(function () use ($org, $data) {
            return FinancialGlMapping::query()->create([
                'financial_organization_id' => $org->id,
                'gl_account_code' => trim((string) $data['glAccountCode']),
                'gl_account_name' => $this->blankToNull($data['glAccountName'] ?? null),
                'mapping_type' => $data['mappingType'] ?? 'both',
                'is_active' => (bool) ($data['isActive'] ?? true),
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);
        });

        $this->audit($actor, 'FINANCIAL_GL_MAPPING_CREATED', null, $this->snapshotGlMapping($mapping));

        return $mapping;
    }

    public function updateGlMapping(FinancialGlMapping $mapping, array $data, User $actor): FinancialGlMapping
    {
        $this->assertOrgVisible($mapping->financialOrganization, $actor);
        $before = $this->snapshotGlMapping($mapping);

        $pairs = [
            'glAccountCode' => 'gl_account_code',
            'glAccountName' => 'gl_account_name',
            'mappingType' => 'mapping_type',
            'isActive' => 'is_active',
            'effectiveFrom' => 'effective_from',
            'effectiveTo' => 'effective_to',
        ];

        foreach ($pairs as $key => $column) {
            if (array_key_exists($key, $data)) {
                $mapping->{$column} = $data[$key] === '' ? null : $data[$key];
            }
        }

        DB::transaction(fn () => $mapping->save());

        $this->audit($actor, 'FINANCIAL_GL_MAPPING_UPDATED', $before, $this->snapshotGlMapping($mapping));

        return $mapping;
    }

    public function deleteGlMapping(FinancialGlMapping $mapping, User $actor): void
    {
        $this->assertOrgVisible($mapping->financialOrganization, $actor);
        $snapshot = $this->snapshotGlMapping($mapping);
        DB::transaction(fn () => $mapping->delete());
        $this->audit($actor, 'FINANCIAL_GL_MAPPING_DELETED', $snapshot, null);
    }

    // Allocation Rules
    public function allocationRules(array $filters, ?User $actor): array
    {
        $query = FinancialAllocationRule::query()
            ->with(['enterprise', 'company', 'sourceFinancialOrganization'])
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

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('status', $status);
        }

        if (($search = trim((string) ($filters['search'] ?? ''))) !== '') {
            $query->where(function ($inner) use ($search) {
                $inner->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%");
            });
        }

        return $query->get()->map(fn (FinancialAllocationRule $rule) => $this->presentAllocationRule($rule))->all();
    }

    public function presentAllocationRule(FinancialAllocationRule $rule): array
    {
        $totalPercentage = $rule->lines()->where('is_active', true)->sum('percentage');

        return [
            'id' => (int) $rule->id,
            'enterpriseId' => $rule->enterprise_id === null ? null : (int) $rule->enterprise_id,
            'enterpriseName' => $rule->enterprise?->name,
            'companyId' => $rule->company_id === null ? null : (int) $rule->company_id,
            'companyName' => $rule->company?->name,
            'code' => $rule->code,
            'name' => $rule->name,
            'description' => $rule->description,
            'status' => $rule->status,
            'sourceFinancialOrganizationId' => (int) $rule->source_financial_organization_id,
            'sourceFinancialOrganizationName' => $rule->sourceFinancialOrganization?->name,
            'effectiveFrom' => $rule->effective_from?->toDateString(),
            'effectiveTo' => $rule->effective_to?->toDateString(),
            'isActive' => (bool) $rule->is_active,
            'totalPercentage' => (float) $totalPercentage,
            'lineCount' => $rule->lines()->where('is_active', true)->count(),
            'createdAt' => $rule->created_at,
        ];
    }

    public function createAllocationRule(array $data, User $actor): FinancialAllocationRule
    {
        $enterpriseId = isset($data['enterpriseId']) && $data['enterpriseId'] !== '' ? (int) $data['enterpriseId'] : null;
        $companyId = isset($data['companyId']) && $data['companyId'] !== '' ? (int) $data['companyId'] : null;
        $sourceOrgId = (int) $data['sourceFinancialOrganizationId'];

        if ($enterpriseId) {
            $enterprise = Enterprise::query()->findOrFail($enterpriseId);
            $this->assertEnterpriseVisible($enterprise, $actor);
        }

        if ($companyId) {
            $company = Company::query()->findOrFail($companyId);
            $this->assertCompanyVisible($company, $actor);
        }

        $sourceOrg = FinancialOrganization::query()->findOrFail($sourceOrgId);
        $this->assertOrgVisible($sourceOrg, $actor);

        // Validate cross-company allocation
        if ($companyId && $sourceOrg->company_id && $sourceOrg->company_id !== $companyId) {
            if ($enterpriseId && $sourceOrg->enterprise_id && $sourceOrg->enterprise_id !== $enterpriseId) {
                throw new OrganizationException(
                    'ALLOCATION_CROSS_ENTERPRISE',
                    'Cross-company allocation is only allowed when all companies belong to the same enterprise.',
                    422
                );
            }
        }

        $this->assertCodeFree($enterpriseId, $companyId, trim((string) ($data['code'] ?: $data['name'])), null);

        $rule = DB::transaction(function () use ($data, $enterpriseId, $companyId, $sourceOrgId, $actor) {
            return FinancialAllocationRule::query()->create([
                'enterprise_id' => $enterpriseId,
                'company_id' => $companyId,
                'code' => trim((string) ($data['code'] ?: $data['name'])),
                'name' => trim((string) $data['name']),
                'description' => $this->blankToNull($data['description'] ?? null),
                'status' => $data['status'] ?? 'draft',
                'source_financial_organization_id' => $sourceOrgId,
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
                'is_active' => (bool) ($data['isActive'] ?? true),
            ]);
        });

        $this->audit($actor, 'FINANCIAL_ALLOCATION_RULE_CREATED', null, $this->snapshotAllocationRule($rule));

        return $rule;
    }

    public function updateAllocationRule(FinancialAllocationRule $rule, array $data, User $actor): FinancialAllocationRule
    {
        $this->assertOrgVisible($rule->sourceFinancialOrganization, $actor);
        $before = $this->snapshotAllocationRule($rule);

        if (array_key_exists('code', $data)) {
            $code = trim((string) $data['code']);
            $this->assertCodeFree($rule->enterprise_id, $rule->company_id, $code, $rule->id);
            $rule->code = $code;
        }

        if (array_key_exists('name', $data)) {
            $rule->name = trim((string) $data['name']);
        }

        if (array_key_exists('description', $data)) {
            $rule->description = $this->blankToNull($data['description']);
        }

        if (array_key_exists('status', $data)) {
            $rule->status = $data['status'];
        }

        if (array_key_exists('effectiveFrom', $data)) {
            $rule->effective_from = $this->blankToNull($data['effectiveFrom']);
        }

        if (array_key_exists('effectiveTo', $data)) {
            $rule->effective_to = $this->blankToNull($data['effectiveTo']);
        }

        if (array_key_exists('isActive', $data)) {
            $rule->is_active = (bool) $data['isActive'];
        }

        DB::transaction(fn () => $rule->save());

        $this->audit($actor, 'FINANCIAL_ALLOCATION_RULE_UPDATED', $before, $this->snapshotAllocationRule($rule));

        return $rule;
    }

    public function deleteAllocationRule(FinancialAllocationRule $rule, User $actor): void
    {
        $this->assertOrgVisible($rule->sourceFinancialOrganization, $actor);
        $snapshot = $this->snapshotAllocationRule($rule);
        DB::transaction(fn () => $rule->delete());
        $this->audit($actor, 'FINANCIAL_ALLOCATION_RULE_DELETED', $snapshot, null);
    }

    // Allocation Lines
    public function allocationLines(int $ruleId, array $filters, ?User $actor): array
    {
        $rule = FinancialAllocationRule::query()->findOrFail($ruleId);
        $this->assertOrgVisible($rule->sourceFinancialOrganization, $actor);

        $query = $rule->lines()->with('targetFinancialOrganization')->orderBy('id');

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('is_active', $status === 'ACTIVE');
        }

        return $query->get()->map(fn (FinancialAllocationLine $line) => $this->presentAllocationLine($line))->all();
    }

    public function presentAllocationLine(FinancialAllocationLine $line): array
    {
        return [
            'id' => (int) $line->id,
            'allocationRuleId' => (int) $line->allocation_rule_id,
            'targetFinancialOrganizationId' => (int) $line->target_financial_organization_id,
            'targetFinancialOrganizationName' => $line->targetFinancialOrganization?->name,
            'targetFinancialOrganizationCode' => $line->targetFinancialOrganization?->code,
            'percentage' => (float) $line->percentage,
            'basis' => $line->basis,
            'isActive' => (bool) $line->is_active,
            'createdAt' => $line->created_at,
        ];
    }

    public function createAllocationLine(int $ruleId, array $data, User $actor): FinancialAllocationLine
    {
        $rule = FinancialAllocationRule::query()->findOrFail($ruleId);
        $this->assertOrgVisible($rule->sourceFinancialOrganization, $actor);

        $targetOrgId = (int) $data['targetFinancialOrganizationId'];
        $targetOrg = FinancialOrganization::query()->findOrFail($targetOrgId);
        $this->assertOrgVisible($targetOrg, $actor);

        // Validate percentage total
        $currentTotal = $rule->lines()->where('is_active', true)->sum('percentage');
        $newPercentage = (float) $data['percentage'];
        if ($currentTotal + $newPercentage > 100) {
            throw new OrganizationException(
                'ALLOCATION_PERCENTAGE_EXCEEDS_100',
                'Total allocation percentage cannot exceed 100%. Current total: ' . $currentTotal . '%, adding: ' . $newPercentage . '%.',
                422
            );
        }

        $line = DB::transaction(function () use ($ruleId, $targetOrgId, $data) {
            return FinancialAllocationLine::query()->create([
                'allocation_rule_id' => $ruleId,
                'target_financial_organization_id' => $targetOrgId,
                'percentage' => (float) $data['percentage'],
                'basis' => $this->blankToNull($data['basis'] ?? null),
                'is_active' => (bool) ($data['isActive'] ?? true),
            ]);
        });

        $this->audit($actor, 'FINANCIAL_ALLOCATION_LINE_CREATED', null, $this->snapshotAllocationLine($line));

        return $line;
    }

    public function updateAllocationLine(FinancialAllocationLine $line, array $data, User $actor): FinancialAllocationLine
    {
        $this->assertOrgVisible($line->allocationRule->sourceFinancialOrganization, $actor);
        $before = $this->snapshotAllocationLine($line);

        if (array_key_exists('percentage', $data)) {
            $newPercentage = (float) $data['percentage'];
            $currentTotal = $line->allocationRule->lines()->where('is_active', true)->where('id', '!=', $line->id)->sum('percentage');
            if ($currentTotal + $newPercentage > 100) {
                throw new OrganizationException(
                    'ALLOCATION_PERCENTAGE_EXCEEDS_100',
                    'Total allocation percentage cannot exceed 100%. Current total (excluding this line): ' . $currentTotal . '%, new value: ' . $newPercentage . '%.',
                    422
                );
            }
            $line->percentage = $newPercentage;
        }

        if (array_key_exists('basis', $data)) {
            $line->basis = $this->blankToNull($data['basis']);
        }

        if (array_key_exists('isActive', $data)) {
            $line->is_active = (bool) $data['isActive'];
        }

        DB::transaction(fn () => $line->save());

        $this->audit($actor, 'FINANCIAL_ALLOCATION_LINE_UPDATED', $before, $this->snapshotAllocationLine($line));

        return $line;
    }

    public function deleteAllocationLine(FinancialAllocationLine $line, User $actor): void
    {
        $this->assertOrgVisible($line->allocationRule->sourceFinancialOrganization, $actor);
        $snapshot = $this->snapshotAllocationLine($line);
        DB::transaction(fn () => $line->delete());
        $this->audit($actor, 'FINANCIAL_ALLOCATION_LINE_DELETED', $snapshot, null);
    }

    private function assertCodeFree(?int $enterpriseId, ?int $companyId, string $code, ?int $ignoreId): void
    {
        $exists = FinancialOrganization::query()
            ->where('enterprise_id', $enterpriseId)
            ->where('company_id', $companyId)
            ->where('code', $code)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new OrganizationException(
                'FINANCIAL_ORGANIZATION_CODE_TAKEN',
                'That scope already has a financial organization with this code.',
                422
            );
        }
    }

    private function resolveParent(?int $enterpriseId, ?int $companyId, ?int $parentId, ?int $ignoreId): void
    {
        if ($parentId === null) {
            return;
        }

        $parent = FinancialOrganization::query()->find($parentId);

        if (!$parent) {
            throw new OrganizationException(
                'FINANCIAL_ORGANIZATION_PARENT_NOT_FOUND',
                'The selected parent organization does not exist.',
                422
            );
        }

        if ($parent->enterprise_id !== $enterpriseId || $parent->company_id !== $companyId) {
            throw new OrganizationException(
                'FINANCIAL_ORGANIZATION_PARENT_SCOPE_MISMATCH',
                'A financial organization can only hang under a parent in the same enterprise and company.',
                422
            );
        }

        // Check for cycles
        $cursor = $parentId;
        for ($i = 0; $i < 100 && $cursor !== null; $i++) {
            if ($cursor === $ignoreId) {
                throw new OrganizationException(
                    'FINANCIAL_ORGANIZATION_CYCLE_DETECTED',
                    'This would create a cycle in the financial organization hierarchy.',
                    422
                );
            }
            $parent = FinancialOrganization::query()->find($cursor);
            $cursor = $parent?->parent_id;
        }
    }

    private function assertOrgVisible(FinancialOrganization $org, ?User $actor): void
    {
        if ($org->enterprise_id) {
            $this->assertEnterpriseVisible($org->enterprise, $actor);
        }
        if ($org->company_id) {
            $this->assertCompanyVisible($org->company, $actor);
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

        foreach ($byId as $id => $org) {
            $chain = [];
            $cursor = $org['id'];

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

    private function snapshot(FinancialOrganization $org): array
    {
        return [
            'id' => (int) $org->id,
            'enterpriseId' => $org->enterprise_id === null ? null : (int) $org->enterprise_id,
            'companyId' => $org->company_id === null ? null : (int) $org->company_id,
            'parentId' => $org->parent_id === null ? null : (int) $org->parent_id,
            'code' => $org->code,
            'name' => $org->name,
            'type' => $org->type,
            'status' => $org->status,
        ];
    }

    private function snapshotGlMapping(FinancialGlMapping $mapping): array
    {
        return [
            'id' => (int) $mapping->id,
            'financialOrganizationId' => (int) $mapping->financial_organization_id,
            'glAccountCode' => $mapping->gl_account_code,
            'mappingType' => $mapping->mapping_type,
            'isActive' => (bool) $mapping->is_active,
        ];
    }

    private function snapshotAllocationRule(FinancialAllocationRule $rule): array
    {
        return [
            'id' => (int) $rule->id,
            'enterpriseId' => $rule->enterprise_id === null ? null : (int) $rule->enterprise_id,
            'companyId' => $rule->company_id === null ? null : (int) $rule->company_id,
            'code' => $rule->code,
            'name' => $rule->name,
            'status' => $rule->status,
            'sourceFinancialOrganizationId' => (int) $rule->source_financial_organization_id,
        ];
    }

    private function snapshotAllocationLine(FinancialAllocationLine $line): array
    {
        return [
            'id' => (int) $line->id,
            'allocationRuleId' => (int) $line->allocation_rule_id,
            'targetFinancialOrganizationId' => (int) $line->target_financial_organization_id,
            'percentage' => (float) $line->percentage,
            'isActive' => (bool) $line->is_active,
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