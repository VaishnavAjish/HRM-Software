<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * DOMAIN 02.06 — Organization Hierarchies.
 *
 * A hierarchy definition holds nodes (references to real records) and edges
 * between them. The edge is the unit of danger: a bad parent edge silently
 * reshapes how everyone reads the tree, so cycles and cross-hierarchy links
 * are rejected.
 */
class OrganizationHierarchyApiTest extends TestCase
{
    use RefreshDatabase;

    private User $root;

    protected function setUp(): void
    {
        parent::setUp();

        $this->root = User::create([
            'name' => 'Root', 'email' => 'root@org-hierarchy.test', 'password' => 'secret1234',
            'emp_code' => 'HRY-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
    }

    private function asRoot(): static
    {
        return $this->withToken(auth('api')->login($this->root));
    }

    private function company(string $code = 'nidhi-impex'): Company
    {
        return Company::query()->firstOrCreate(
            ['code' => $code],
            ['name' => ucwords(str_replace('-', ' ', $code)), 'is_active' => true]
        );
    }

    private function hierarchyId(Company $company, string $name = 'Chain of Command'): int
    {
        return $this->asRoot()->postJson('/api/v1/admin/organization/hierarchies', [
            'companyId' => $company->id,
            'code' => strtolower(str_replace(' ', '-', $name)),
            'name' => $name,
        ])->assertCreated()->assertJsonPath('success', true)->json('data.id');
    }

    private function nodeId(int $hierarchyId, Company $company, string $name): int
    {
        $unit = \App\Models\OrganizationUnit::query()->create([
            'company_id' => $company->id,
            'code' => strtolower(str_replace(' ', '-', $name)),
            'name' => $name,
            'type' => 'department',
            'status' => 'active',
        ]);

        return $this->asRoot()->postJson("/api/v1/admin/organization/hierarchies/{$hierarchyId}/nodes", [
            'nodeType' => 'organization_unit', 'nodeId' => $unit->id, 'name' => $name,
        ])->assertCreated()->json('data.id');
    }

    #[Test]
    public function a_hierarchy_hangs_under_its_company(): void
    {
        $company = $this->company();
        $id = $this->hierarchyId($company);

        $this->assertDatabaseHas('organization_hierarchies', ['id' => $id, 'company_id' => $company->id]);

        $this->asRoot()->getJson('/api/v1/admin/organization/hierarchies')
            ->assertOk()->assertJsonPath('data.0.id', $id);
    }

    #[Test]
    public function an_edge_links_two_nodes_of_the_same_hierarchy(): void
    {
        $company = $this->company();
        $hierarchyId = $this->hierarchyId($company);

        $board = $this->nodeId($hierarchyId, $company, 'Board');
        $ops = $this->nodeId($hierarchyId, $company, 'Operations');

        $edge = $this->asRoot()->postJson("/api/v1/admin/organization/hierarchies/{$hierarchyId}/edges", [
            'parentNodeId' => $board, 'childNodeId' => $ops,
        ])->assertCreated()->json('data');

        $this->assertDatabaseHas('organization_hierarchy_edges', [
            'id' => $edge['id'],
            'hierarchy_id' => $hierarchyId,
            'parent_node_id' => $board,
            'child_node_id' => $ops,
        ]);
    }

    #[Test]
    public function an_edge_between_different_hierarchies_is_rejected(): void
    {
        $company = $this->company();
        $firstHierarchy = $this->hierarchyId($company, 'First');
        $secondHierarchy = $this->hierarchyId($company, 'Second');

        $nodeA = $this->nodeId($firstHierarchy, $company, 'A');
        $nodeB = $this->nodeId($secondHierarchy, $company, 'B');

        $this->asRoot()->postJson("/api/v1/admin/organization/hierarchies/{$firstHierarchy}/edges", [
            'parentNodeId' => $nodeA, 'childNodeId' => $nodeB,
        ])->assertStatus(422)->assertJsonPath('error.code', 'ORGANIZATION_HIERARCHY_NODE_MISMATCH');
    }

    #[Test]
    public function an_edge_that_would_create_a_cycle_is_rejected(): void
    {
        $company = $this->company();
        $hierarchyId = $this->hierarchyId($company);

        $a = $this->nodeId($hierarchyId, $company, 'A');
        $b = $this->nodeId($hierarchyId, $company, 'B');
        $c = $this->nodeId($hierarchyId, $company, 'C');

        $this->asRoot()->postJson("/api/v1/admin/organization/hierarchies/{$hierarchyId}/edges", [
            'parentNodeId' => $a, 'childNodeId' => $b,
        ])->assertCreated();

        $this->asRoot()->postJson("/api/v1/admin/organization/hierarchies/{$hierarchyId}/edges", [
            'parentNodeId' => $b, 'childNodeId' => $c,
        ])->assertCreated();

        $this->asRoot()->postJson("/api/v1/admin/organization/hierarchies/{$hierarchyId}/edges", [
            'parentNodeId' => $c, 'childNodeId' => $a,
        ])->assertStatus(422)->assertJsonPath('error.code', 'ORGANIZATION_HIERARCHY_CYCLE_DETECTED');
    }

    #[Test]
    public function a_node_with_active_edges_cannot_be_deleted(): void
    {
        $company = $this->company();
        $hierarchyId = $this->hierarchyId($company);

        $parent = $this->nodeId($hierarchyId, $company, 'Parent');
        $child = $this->nodeId($hierarchyId, $company, 'Child');

        $this->asRoot()->postJson("/api/v1/admin/organization/hierarchies/{$hierarchyId}/edges", [
            'parentNodeId' => $parent, 'childNodeId' => $child,
        ])->assertCreated();

        $this->asRoot()->deleteJson("/api/v1/admin/organization/hierarchies/{$hierarchyId}/nodes/{$parent}")
            ->assertStatus(422)->assertJsonPath('error.code', 'ORGANIZATION_HIERARCHY_NODE_HAS_EDGES');
    }

    #[Test]
    public function a_missing_hierarchy_returns_404(): void
    {
        $this->asRoot()->getJson('/api/v1/admin/organization/hierarchies/999999')
            ->assertNotFound()->assertJsonPath('error.code', 'NOT_FOUND');
    }
}