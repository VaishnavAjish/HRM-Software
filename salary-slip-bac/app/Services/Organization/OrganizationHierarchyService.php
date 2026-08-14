<?php

namespace App\Services\Organization;

use App\Models\OrganizationHierarchy;
use App\Models\OrganizationHierarchyNode;
use App\Models\OrganizationHierarchyEdge;
use App\Models\Enterprise;
use App\Models\Company;
use App\Models\User;
use App\Models\FinancialOrganization;
use App\Models\LegalEntityProfile;
use App\Models\OrganizationLocation;
use App\Models\OrganizationPosition;
use App\Models\OrganizationUnit;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * DOMAIN 02.06 — Organization Hierarchy Service.
 */
class OrganizationHierarchyService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'organization-hierarchies';

    public const TYPES = [
        'enterprise',
        'legal_entity',
        'business_unit',
        'division',
        'department',
        'location',
        'cost_center',
        'functional',
        'project',
        'matrix',
        'dotted_line',
    ];

    public const EDGE_TYPES = [
        'primary',
        'secondary',
        'dotted',
        'matrix',
    ];

    public function hierarchies(array $filters, ?User $actor): array
    {
        $query = OrganizationHierarchy::query()
            ->with(['enterprise', 'company'])
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

        return $query->get()->map(fn (OrganizationHierarchy $hierarchy) => $this->present($hierarchy))->all();
    }

    public function present(OrganizationHierarchy $hierarchy): array
    {
        return [
            'id' => (int) $hierarchy->id,
            'enterpriseId' => $hierarchy->enterprise_id === null ? null : (int) $hierarchy->enterprise_id,
            'enterpriseName' => $hierarchy->enterprise?->name,
            'companyId' => $hierarchy->company_id === null ? null : (int) $hierarchy->company_id,
            'companyName' => $hierarchy->company?->name,
            'code' => $hierarchy->code,
            'name' => $hierarchy->name,
            'type' => $hierarchy->type,
            'status' => $hierarchy->status,
            'description' => $hierarchy->description,
            'effectiveFrom' => $hierarchy->effective_from?->toDateString(),
            'effectiveTo' => $hierarchy->effective_to?->toDateString(),
            'isActive' => (bool) $hierarchy->is_active,
            'nodeCount' => $hierarchy->nodes()->where('is_active', true)->count(),
            'edgeCount' => $hierarchy->edges()->where('is_active', true)->count(),
            'createdAt' => $hierarchy->created_at,
        ];
    }

    public function create(array $data, User $actor): OrganizationHierarchy
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

        $hierarchy = DB::transaction(function () use ($data, $enterpriseId, $companyId, $actor) {
            return OrganizationHierarchy::query()->create([
                'enterprise_id' => $enterpriseId,
                'company_id' => $companyId,
                'code' => trim((string) ($data['code'] ?: $data['name'])),
                'name' => trim((string) $data['name']),
                'type' => $data['type'] ?? 'functional',
                'status' => $data['status'] ?? 'draft',
                'description' => $this->blankToNull($data['description'] ?? null),
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
                'is_active' => (bool) ($data['isActive'] ?? true),
            ]);
        });

        $this->audit($actor, 'ORGANIZATION_HIERARCHY_CREATED', null, $this->snapshot($hierarchy));

        return $hierarchy;
    }

    public function update(OrganizationHierarchy $hierarchy, array $data, User $actor): OrganizationHierarchy
    {
        $this->assertHierarchyVisible($hierarchy, $actor);
        $before = $this->snapshot($hierarchy);

        if (array_key_exists('enterpriseId', $data)) {
            $enterpriseId = $data['enterpriseId'] === '' || $data['enterpriseId'] === null ? null : (int) $data['enterpriseId'];
            if ($enterpriseId !== $hierarchy->enterprise_id) {
                if ($enterpriseId) {
                    $enterprise = Enterprise::query()->findOrFail($enterpriseId);
                    $this->assertEnterpriseVisible($enterprise, $actor);
                }
                $hierarchy->enterprise_id = $enterpriseId;
            }
        }

        if (array_key_exists('companyId', $data)) {
            $companyId = $data['companyId'] === '' || $data['companyId'] === null ? null : (int) $data['companyId'];
            if ($companyId !== $hierarchy->company_id) {
                if ($companyId) {
                    $company = Company::query()->findOrFail($companyId);
                    $this->assertCompanyVisible($company, $actor);
                }
                $hierarchy->company_id = $companyId;
            }
        }

        if (array_key_exists('code', $data)) {
            $code = trim((string) $data['code']);
            $this->assertCodeFree($hierarchy->enterprise_id, $hierarchy->company_id, $code, $hierarchy->id);
            $hierarchy->code = $code;
        }

        if (array_key_exists('name', $data)) {
            $hierarchy->name = trim((string) $data['name']);
        }

        if (array_key_exists('type', $data)) {
            $hierarchy->type = $data['type'];
        }

        if (array_key_exists('status', $data)) {
            $hierarchy->status = $data['status'];
        }

        if (array_key_exists('description', $data)) {
            $hierarchy->description = $this->blankToNull($data['description']);
        }

        if (array_key_exists('effectiveFrom', $data)) {
            $hierarchy->effective_from = $this->blankToNull($data['effectiveFrom']);
        }

        if (array_key_exists('effectiveTo', $data)) {
            $hierarchy->effective_to = $this->blankToNull($data['effectiveTo']);
        }

        if (array_key_exists('isActive', $data)) {
            $hierarchy->is_active = (bool) $data['isActive'];
        }

        DB::transaction(fn () => $hierarchy->save());

        $this->audit($actor, 'ORGANIZATION_HIERARCHY_UPDATED', $before, $this->snapshot($hierarchy));

        return $hierarchy;
    }

    public function setStatus(OrganizationHierarchy $hierarchy, string $status, User $actor): OrganizationHierarchy
    {
        $this->assertHierarchyVisible($hierarchy, $actor);
        $before = $this->snapshot($hierarchy);
        $hierarchy->status = $status;
        $hierarchy->save();

        $this->audit($actor, 'ORGANIZATION_HIERARCHY_STATUS_CHANGED', $before, $this->snapshot($hierarchy));

        return $hierarchy;
    }

    public function delete(OrganizationHierarchy $hierarchy, User $actor): void
    {
        $this->assertHierarchyVisible($hierarchy, $actor);

        if ($hierarchy->nodes()->where('is_active', true)->exists()) {
            throw new OrganizationException(
                'ORGANIZATION_HIERARCHY_HAS_NODES',
                'Cannot delete this hierarchy while it has active nodes. Remove them first.',
                422
            );
        }

        $snapshot = $this->snapshot($hierarchy);

        DB::transaction(fn () => $hierarchy->delete());

        $this->audit($actor, 'ORGANIZATION_HIERARCHY_DELETED', $snapshot, null);
    }

    // Nodes
    public function nodes(int $hierarchyId, array $filters, ?User $actor): array
    {
        $hierarchy = OrganizationHierarchy::query()->findOrFail($hierarchyId);
        $this->assertHierarchyVisible($hierarchy, $actor);

        $query = $hierarchy->nodes()->where('is_active', true);

        if (($nodeType = (string) ($filters['nodeType'] ?? '')) !== '' && $nodeType !== 'ALL') {
            $query->where('node_type', $nodeType);
        }

        return $query->get()->map(fn (OrganizationHierarchyNode $node) => $this->presentNode($node))->all();
    }

    public function presentNode(OrganizationHierarchyNode $node): array
    {
        return [
            'id' => (int) $node->id,
            'hierarchyId' => (int) $node->hierarchy_id,
            'nodeType' => $node->node_type,
            'nodeId' => (int) $node->node_id,
            'code' => $node->code,
            'name' => $node->name,
            'metadata' => $node->metadata,
            'isActive' => (bool) $node->is_active,
            'parentCount' => $node->parentEdges()->where('is_active', true)->count(),
            'childCount' => $node->childEdges()->where('is_active', true)->count(),
            'createdAt' => $node->created_at,
        ];
    }

    public function createNode(int $hierarchyId, array $data, User $actor): OrganizationHierarchyNode
    {
        $hierarchy = OrganizationHierarchy::query()->findOrFail($hierarchyId);
        $this->assertHierarchyVisible($hierarchy, $actor);

        $nodeType = $data['nodeType'];
        $nodeId = (int) $data['nodeId'];

        // Validate the referenced record exists and is in scope
        $this->validateNodeReference($hierarchy, $nodeType, $nodeId, $actor);

        $node = DB::transaction(function () use ($hierarchyId, $nodeType, $nodeId, $data) {
            return OrganizationHierarchyNode::query()->create([
                'hierarchy_id' => $hierarchyId,
                'node_type' => $nodeType,
                'node_id' => $nodeId,
                'code' => $this->blankToNull($data['code'] ?? null),
                'name' => trim((string) $data['name']),
                'metadata' => $data['metadata'] ?? null,
                'is_active' => (bool) ($data['isActive'] ?? true),
            ]);
        });

        $this->audit($actor, 'ORGANIZATION_HIERARCHY_NODE_CREATED', null, $this->snapshotNode($node));

        return $node;
    }

    public function updateNode(OrganizationHierarchyNode $node, array $data, User $actor): OrganizationHierarchyNode
    {
        $this->assertHierarchyVisible($node->hierarchy, $actor);
        $before = $this->snapshotNode($node);

        if (array_key_exists('code', $data)) {
            $node->code = $this->blankToNull($data['code']);
        }

        if (array_key_exists('name', $data)) {
            $node->name = trim((string) $data['name']);
        }

        if (array_key_exists('metadata', $data)) {
            $node->metadata = $data['metadata'];
        }

        if (array_key_exists('isActive', $data)) {
            $node->is_active = (bool) $data['isActive'];
        }

        DB::transaction(fn () => $node->save());

        $this->audit($actor, 'ORGANIZATION_HIERARCHY_NODE_UPDATED', $before, $this->snapshotNode($node));

        return $node;
    }

    public function deleteNode(OrganizationHierarchyNode $node, User $actor): void
    {
        $this->assertHierarchyVisible($node->hierarchy, $actor);

        if ($node->parentEdges()->where('is_active', true)->exists() || $node->childEdges()->where('is_active', true)->exists()) {
            throw new OrganizationException(
                'ORGANIZATION_HIERARCHY_NODE_HAS_EDGES',
                'Cannot delete this node while it has active edges. Remove edges first.',
                422
            );
        }

        $snapshot = $this->snapshotNode($node);

        DB::transaction(fn () => $node->delete());

        $this->audit($actor, 'ORGANIZATION_HIERARCHY_NODE_DELETED', $snapshot, null);
    }

    // Edges
    public function edges(int $hierarchyId, array $filters, ?User $actor): array
    {
        $hierarchy = OrganizationHierarchy::query()->findOrFail($hierarchyId);
        $this->assertHierarchyVisible($hierarchy, $actor);

        $query = $hierarchy->edges()
            ->with(['parentNode', 'childNode'])
            ->where('is_active', true);

        if (($edgeType = (string) ($filters['edgeType'] ?? '')) !== '' && $edgeType !== 'ALL') {
            $query->where('edge_type', $edgeType);
        }

        return $query->get()->map(fn (OrganizationHierarchyEdge $edge) => $this->presentEdge($edge))->all();
    }

    public function presentEdge(OrganizationHierarchyEdge $edge): array
    {
        return [
            'id' => (int) $edge->id,
            'hierarchyId' => (int) $edge->hierarchy_id,
            'parentNodeId' => (int) $edge->parent_node_id,
            'parentNodeName' => $edge->parentNode?->name,
            'childNodeId' => (int) $edge->child_node_id,
            'childNodeName' => $edge->childNode?->name,
            'edgeType' => $edge->edge_type,
            'isActive' => (bool) $edge->is_active,
            'effectiveFrom' => $edge->effective_from?->toDateString(),
            'effectiveTo' => $edge->effective_to?->toDateString(),
            'createdAt' => $edge->created_at,
        ];
    }

    public function createEdge(int $hierarchyId, array $data, User $actor): OrganizationHierarchyEdge
    {
        $hierarchy = OrganizationHierarchy::query()->findOrFail($hierarchyId);
        $this->assertHierarchyVisible($hierarchy, $actor);

        $parentNodeId = (int) $data['parentNodeId'];
        $childNodeId = (int) $data['childNodeId'];
        $edgeType = $data['edgeType'] ?? 'primary';

        $parentNode = OrganizationHierarchyNode::query()->findOrFail($parentNodeId);
        $childNode = OrganizationHierarchyNode::query()->findOrFail($childNodeId);

        if ($parentNode->hierarchy_id !== $hierarchyId || $childNode->hierarchy_id !== $hierarchyId) {
            throw new OrganizationException(
                'ORGANIZATION_HIERARCHY_NODE_MISMATCH',
                'Both nodes must belong to the same hierarchy.',
                422
            );
        }

        if ($parentNodeId === $childNodeId) {
            throw new OrganizationException(
                'ORGANIZATION_HIERARCHY_SELF_PARENT',
                'A node cannot be its own parent.',
                422
            );
        }

        // Check for cycles
        if ($this->wouldCreateCycle($hierarchyId, $parentNodeId, $childNodeId)) {
            throw new OrganizationException(
                'ORGANIZATION_HIERARCHY_CYCLE_DETECTED',
                'This edge would create a cycle in the hierarchy.',
                422
            );
        }

        // Validate multi-parent rules
        $this->validateMultiParentRules($hierarchy, $childNodeId, $edgeType);

        $edge = DB::transaction(function () use ($hierarchyId, $parentNodeId, $childNodeId, $edgeType, $data) {
            return OrganizationHierarchyEdge::query()->create([
                'hierarchy_id' => $hierarchyId,
                'parent_node_id' => $parentNodeId,
                'child_node_id' => $childNodeId,
                'edge_type' => $edgeType,
                'is_active' => (bool) ($data['isActive'] ?? true),
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);
        });

        $this->audit($actor, 'ORGANIZATION_HIERARCHY_EDGE_CREATED', null, $this->snapshotEdge($edge));

        return $edge;
    }

    public function updateEdge(OrganizationHierarchyEdge $edge, array $data, User $actor): OrganizationHierarchyEdge
    {
        $this->assertHierarchyVisible($edge->hierarchy, $actor);
        $before = $this->snapshotEdge($edge);

        if (array_key_exists('edgeType', $data)) {
            $edge->edge_type = $data['edgeType'];
        }

        if (array_key_exists('isActive', $data)) {
            $edge->is_active = (bool) $data['isActive'];
        }

        if (array_key_exists('effectiveFrom', $data)) {
            $edge->effective_from = $this->blankToNull($data['effectiveFrom']);
        }

        if (array_key_exists('effectiveTo', $data)) {
            $edge->effective_to = $this->blankToNull($data['effectiveTo']);
        }

        DB::transaction(fn () => $edge->save());

        $this->audit($actor, 'ORGANIZATION_HIERARCHY_EDGE_UPDATED', $before, $this->snapshotEdge($edge));

        return $edge;
    }

    public function deleteEdge(OrganizationHierarchyEdge $edge, User $actor): void
    {
        $this->assertHierarchyVisible($edge->hierarchy, $actor);
        $snapshot = $this->snapshotEdge($edge);
        DB::transaction(fn () => $edge->delete());
        $this->audit($actor, 'ORGANIZATION_HIERARCHY_EDGE_DELETED', $snapshot, null);
    }

    // Validation
    public function validate(int $hierarchyId, array $data, User $actor): array
    {
        $hierarchy = OrganizationHierarchy::query()->findOrFail($hierarchyId);
        $this->assertHierarchyVisible($hierarchy, $actor);

        $errors = [];

        // Check for self-parenting
        if (isset($data['parentNodeId'], $data['childNodeId']) && $data['parentNodeId'] === $data['childNodeId']) {
            $errors[] = 'A node cannot be its own parent.';
        }

        // Check for cycles
        if (isset($data['parentNodeId'], $data['childNodeId']) && $this->wouldCreateCycle($hierarchyId, $data['parentNodeId'], $data['childNodeId'])) {
            $errors[] = 'This edge would create a cycle in the hierarchy.';
        }

        // Check multi-parent rules
        if (isset($data['childNodeId'], $data['edgeType'])) {
            $multiParentErrors = $this->validateMultiParentRules($hierarchy, $data['childNodeId'], $data['edgeType']);
            $errors = array_merge($errors, $multiParentErrors);
        }

        // Check duplicate edges
        if (isset($data['parentNodeId'], $data['childNodeId'], $data['edgeType'])) {
            $exists = OrganizationHierarchyEdge::query()
                ->where('hierarchy_id', $hierarchyId)
                ->where('parent_node_id', $data['parentNodeId'])
                ->where('child_node_id', $data['childNodeId'])
                ->where('edge_type', $data['edgeType'])
                ->where('is_active', true)
                ->exists();

            if ($exists) {
                $errors[] = 'An active edge of this type already exists between these nodes.';
            }
        }

        // Check scope
        if (isset($data['parentNodeId'], $data['childNodeId'])) {
            $parentNode = OrganizationHierarchyNode::query()->find($data['parentNodeId']);
            $childNode = OrganizationHierarchyNode::query()->find($data['childNodeId']);

            if ($parentNode && $childNode && ($parentNode->hierarchy_id !== $hierarchyId || $childNode->hierarchy_id !== $hierarchyId)) {
                $errors[] = 'Both nodes must belong to the same hierarchy.';
            }
        }

        return [
            'valid' => empty($errors),
            'errors' => $errors,
        ];
    }

    private function validateNodeReference(OrganizationHierarchy $hierarchy, string $nodeType, int $nodeId, ?User $actor): void
    {
        $modelClass = $this->nodeTypeToModel($nodeType);
        
        if (!$modelClass) {
            throw new OrganizationException(
                'ORGANIZATION_HIERARCHY_INVALID_NODE_TYPE',
                "Invalid node type: {$nodeType}",
                422
            );
        }

        $record = $modelClass::query()->find($nodeId);

        if (!$record) {
            throw new OrganizationException(
                'ORGANIZATION_HIERARCHY_NODE_NOT_FOUND',
                "The referenced {$nodeType} record does not exist.",
                422
            );
        }

        // Check scope
        if ($hierarchy->enterprise_id && $record->enterprise_id && $record->enterprise_id !== $hierarchy->enterprise_id) {
            throw new OrganizationException(
                'ORGANIZATION_HIERARCHY_NODE_SCOPE_MISMATCH',
                "The referenced record does not belong to the hierarchy's enterprise.",
                422
            );
        }

        if ($hierarchy->company_id && $record->company_id && $record->company_id !== $hierarchy->company_id) {
            throw new OrganizationException(
                'ORGANIZATION_HIERARCHY_NODE_SCOPE_MISMATCH',
                "The referenced record does not belong to the hierarchy's company.",
                422
            );
        }
    }

    private function nodeTypeToModel(string $nodeType): ?string
    {
        return match ($nodeType) {
            'enterprise' => Enterprise::class,
            'company' => Company::class,
            'legal_entity' => LegalEntityProfile::class,
            'organization_unit' => OrganizationUnit::class,
            'organization_location' => OrganizationLocation::class,
            'financial_organization' => FinancialOrganization::class,
            'position' => OrganizationPosition::class,
            'user' => User::class,
            default => null,
        };
    }

    private function wouldCreateCycle(int $hierarchyId, int $parentNodeId, int $childNodeId): bool
    {
        // Walk up from parent to see if we reach child
        $cursor = $parentNodeId;
        $visited = [];

        for ($i = 0; $i < 100 && $cursor !== null; $i++) {
            if ($cursor === $childNodeId) {
                return true;
            }

            if (in_array($cursor, $visited)) {
                return true; // cycle detected in existing structure
            }

            $visited[] = $cursor;

            $edge = OrganizationHierarchyEdge::query()
                ->where('hierarchy_id', $hierarchyId)
                ->where('child_node_id', $cursor)
                ->where('is_active', true)
                ->first();

            $cursor = $edge?->parent_node_id;
        }

        return false;
    }

    private function validateMultiParentRules(OrganizationHierarchy $hierarchy, int $childNodeId, string $edgeType): array
    {
        $errors = [];

        $activeParents = OrganizationHierarchyEdge::query()
            ->where('hierarchy_id', $hierarchy->id)
            ->where('child_node_id', $childNodeId)
            ->where('is_active', true)
            ->get();

        $primaryParents = $activeParents->where('edge_type', 'primary')->count();
        $hasMatrixOrDotted = $activeParents->whereIn('edge_type', ['matrix', 'dotted'])->isNotEmpty();

        if ($edgeType === 'primary' && $primaryParents > 0) {
            $errors[] = 'A node can have only one active primary parent in ordinary hierarchies.';
        }

        if (in_array($hierarchy->type, ['matrix', 'dotted_line'])) {
            // Multiple parents allowed for matrix and dotted-line
        } elseif ($edgeType !== 'primary' && !$hasMatrixOrDotted) {
            // For non-primary edges in non-matrix hierarchies, check if there's already a primary parent
            if ($primaryParents === 0) {
                $errors[] = 'A non-primary edge requires an existing primary parent.';
            }
        }

        return $errors;
    }

    private function assertCodeFree(?int $enterpriseId, ?int $companyId, string $code, ?int $ignoreId): void
    {
        $exists = OrganizationHierarchy::query()
            ->where('enterprise_id', $enterpriseId)
            ->where('company_id', $companyId)
            ->where('code', $code)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new OrganizationException(
                'ORGANIZATION_HIERARCHY_CODE_TAKEN',
                'That scope already has a hierarchy with this code.',
                422
            );
        }
    }

    private function assertHierarchyVisible(OrganizationHierarchy $hierarchy, ?User $actor): void
    {
        if ($hierarchy->enterprise_id) {
            $this->assertEnterpriseVisible($hierarchy->enterprise, $actor);
        }
        if ($hierarchy->company_id) {
            $this->assertCompanyVisible($hierarchy->company, $actor);
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

    private function snapshot(OrganizationHierarchy $hierarchy): array
    {
        return [
            'id' => (int) $hierarchy->id,
            'enterpriseId' => $hierarchy->enterprise_id === null ? null : (int) $hierarchy->enterprise_id,
            'companyId' => $hierarchy->company_id === null ? null : (int) $hierarchy->company_id,
            'code' => $hierarchy->code,
            'name' => $hierarchy->name,
            'type' => $hierarchy->type,
            'status' => $hierarchy->status,
        ];
    }

    private function snapshotNode(OrganizationHierarchyNode $node): array
    {
        return [
            'id' => (int) $node->id,
            'hierarchyId' => (int) $node->hierarchy_id,
            'nodeType' => $node->node_type,
            'nodeId' => (int) $node->node_id,
            'name' => $node->name,
        ];
    }

    private function snapshotEdge(OrganizationHierarchyEdge $edge): array
    {
        return [
            'id' => (int) $edge->id,
            'hierarchyId' => (int) $edge->hierarchy_id,
            'parentNodeId' => (int) $edge->parent_node_id,
            'childNodeId' => (int) $edge->child_node_id,
            'edgeType' => $edge->edge_type,
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