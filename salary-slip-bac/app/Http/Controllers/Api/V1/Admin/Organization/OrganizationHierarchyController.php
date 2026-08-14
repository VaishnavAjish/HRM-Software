<?php

namespace App\Http\Controllers\Api\V1\Admin\Organization;

use App\Http\Controllers\Controller;
use App\Models\OrganizationHierarchy;
use App\Models\OrganizationHierarchyEdge;
use App\Models\OrganizationHierarchyNode;
use App\Services\Organization\OrganizationHierarchyService;
use App\Services\Provisioning\ProvisioningException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 02.06 — Organization Hierarchies.
 *
 * Hierarchy definitions, nodes, edges, and a pre-save validation endpoint.
 * Routes carry permission:org.hierarchy.*; the service owns tenancy,
 * node-type resolution, multi-parent and cycle rules.
 */
class OrganizationHierarchyController extends Controller
{
    public function __construct(
        private readonly OrganizationHierarchyService $service,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->hierarchies([
                'enterpriseId' => $request->query('enterprise_id', $request->query('enterpriseId')),
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'search' => $request->query('search'),
                'type' => $request->query('type'),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->create($data, auth('api')->user())
            ),
        ], 201));
    }

    public function show(int $id): JsonResponse
    {
        $hierarchy = OrganizationHierarchy::query()->find($id);

        if (! $hierarchy) {
            return $this->missing('Hierarchy not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present($hierarchy),
        ]));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $hierarchy = OrganizationHierarchy::query()->find($id);

        if (! $hierarchy) {
            return $this->missing('Hierarchy not found.');
        }

        $data = $request->validate($this->rules(true));

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($hierarchy, $data, auth('api')->user())
            ),
        ]));
    }

    public function setStatus(Request $request, int $id): JsonResponse
    {
        $hierarchy = OrganizationHierarchy::query()->find($id);

        if (! $hierarchy) {
            return $this->missing('Hierarchy not found.');
        }

        $data = $request->validate(['status' => ['required', 'string', Rule::in(OrganizationHierarchy::STATUSES)]]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->setStatus($hierarchy, $data['status'], auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $id): JsonResponse
    {
        $hierarchy = OrganizationHierarchy::query()->find($id);

        if (! $hierarchy) {
            return $this->missing('Hierarchy not found.');
        }

        return $this->guarded(function () use ($hierarchy) {
            $this->service->delete($hierarchy, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $hierarchy->id]]);
        });
    }

    /* ----------------------------------------------------------------- nodes */

    public function nodes(Request $request, int $hierarchyId): JsonResponse
    {
        if (! $this->hierarchyExists($hierarchyId)) {
            return $this->missing('Hierarchy not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->nodes($hierarchyId, [
                'nodeType' => $request->query('node_type', $request->query('nodeType')),
                'search' => $request->query('search'),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]));
    }

    public function storeNode(Request $request, int $hierarchyId): JsonResponse
    {
        if (! $this->hierarchyExists($hierarchyId)) {
            return $this->missing('Hierarchy not found.');
        }

        $data = $request->validate([
            'nodeType' => ['required', 'string', Rule::in(OrganizationHierarchyNode::NODE_TYPES)],
            'nodeId' => ['required', 'integer'],
            'code' => ['sometimes', 'nullable', 'string', 'max:60'],
            'name' => ['required', 'string', 'max:190'],
            'metadata' => ['sometimes', 'nullable', 'array'],
            'isActive' => ['sometimes', 'boolean'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentNode(
                $this->service->createNode($hierarchyId, $data, auth('api')->user())
            ),
        ], 201));
    }

    public function updateNode(Request $request, int $hierarchyId, int $id): JsonResponse
    {
        $node = OrganizationHierarchyNode::query()->find($id);

        if (! $node) {
            return $this->missing('Hierarchy node not found.');
        }

        $data = $request->validate([
            'code' => ['sometimes', 'nullable', 'string', 'max:60'],
            'name' => ['sometimes', 'string', 'max:190'],
            'metadata' => ['sometimes', 'nullable', 'array'],
            'isActive' => ['sometimes', 'boolean'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentNode(
                $this->service->updateNode($node, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroyNode(int $hierarchyId, int $id): JsonResponse
    {
        $node = OrganizationHierarchyNode::query()->find($id);

        if (! $node) {
            return $this->missing('Hierarchy node not found.');
        }

        return $this->guarded(function () use ($node) {
            $this->service->deleteNode($node, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $node->id]]);
        });
    }

    /* ----------------------------------------------------------------- edges */

    public function edges(Request $request, int $hierarchyId): JsonResponse
    {
        if (! $this->hierarchyExists($hierarchyId)) {
            return $this->missing('Hierarchy not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->edges($hierarchyId, [
                'edgeType' => $request->query('edge_type', $request->query('edgeType')),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]));
    }

    public function storeEdge(Request $request, int $hierarchyId): JsonResponse
    {
        if (! $this->hierarchyExists($hierarchyId)) {
            return $this->missing('Hierarchy not found.');
        }

        $data = $request->validate([
            'parentNodeId' => ['required', 'integer'],
            'childNodeId' => ['required', 'integer', 'different:parentNodeId'],
            'edgeType' => ['sometimes', 'string', Rule::in(OrganizationHierarchyEdge::EDGE_TYPES)],
            'isActive' => ['sometimes', 'boolean'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentEdge(
                $this->service->createEdge($hierarchyId, $data, auth('api')->user())
            ),
        ], 201));
    }

    public function updateEdge(Request $request, int $hierarchyId, int $id): JsonResponse
    {
        $edge = OrganizationHierarchyEdge::query()->find($id);

        if (! $edge) {
            return $this->missing('Hierarchy edge not found.');
        }

        $data = $request->validate([
            'edgeType' => ['sometimes', 'string', Rule::in(OrganizationHierarchyEdge::EDGE_TYPES)],
            'isActive' => ['sometimes', 'boolean'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentEdge(
                $this->service->updateEdge($edge, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroyEdge(int $hierarchyId, int $id): JsonResponse
    {
        $edge = OrganizationHierarchyEdge::query()->find($id);

        if (! $edge) {
            return $this->missing('Hierarchy edge not found.');
        }

        return $this->guarded(function () use ($edge) {
            $this->service->deleteEdge($edge, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $edge->id]]);
        });
    }

    /** Pre-save validation: returns valid + errors, writes nothing. */
    public function validate(Request $request, int $hierarchyId): JsonResponse
    {
        if (! $this->hierarchyExists($hierarchyId)) {
            return $this->missing('Hierarchy not found.');
        }

        $data = $request->validate([
            'parentNodeId' => ['required', 'integer'],
            'childNodeId' => ['required', 'integer', 'different:parentNodeId'],
            'edgeType' => ['sometimes', 'string', Rule::in(OrganizationHierarchyEdge::EDGE_TYPES)],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->validate($hierarchyId, $data, auth('api')->user()),
        ]));
    }

    /* ----------------------------------------------------------------- helpers */

    private function rules(bool $update = false): array
    {
        $rules = [
            'enterpriseId' => ['sometimes', 'nullable', 'integer'],
            'companyId' => ['integer', 'exists:companies,id'],
            'code' => ['sometimes', 'nullable', 'string', 'max:60'],
            'name' => ['string', 'max:190'],
            'type' => ['sometimes', 'string', Rule::in(OrganizationHierarchy::TYPES)],
            'status' => ['sometimes', 'string', Rule::in(OrganizationHierarchy::STATUSES)],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
            'isActive' => ['sometimes', 'boolean'],
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

    private function hierarchyExists(int $id): bool
    {
        return OrganizationHierarchy::query()->whereKey($id)->exists();
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
