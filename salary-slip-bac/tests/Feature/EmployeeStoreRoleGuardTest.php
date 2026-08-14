<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionRegistrySeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * S2: the legacy /employee/store endpoint onboards standard tier-3 employees
 * only. It rejects any attempt to mint roles 0/1/2/4 or set an account type;
 * privileged creation belongs to /v1/admin/users.
 *
 * Runs on the disposable database only (see phpunit.disposable.xml).
 */
class EmployeeStoreRoleGuardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RbacSeeder::class);
        $this->seed(PermissionRegistrySeeder::class);
        config([
            'authorization.enforcement.default_mode' => 'enforced',
            'authorization.enforcement.enforced_prefixes' => ['hr.', 'ui.', 'self.'],
        ]);
    }

    /** A creator that legitimately holds hr.employee.create. */
    private function creator(int $tier): User
    {
        $user = User::create([
            'name' => 'C' . Str::random(5),
            'email' => Str::lower(Str::random(10)) . '@empstore.test',
            'password' => 'x',
            'role' => $tier,
            'company_code' => 'nidhi-impex',
            'emp_code' => strtoupper(Str::random(8)),
            'status' => 0,
            'is_deleted' => 0,
        ]);

        $role = Role::create([
            'name' => 'Creator' . Str::random(4),
            'code' => 'creator_' . Str::lower(Str::random(6)),
            'is_active' => true,
            'status' => 'ACTIVE',
        ]);
        $perm = Permission::where('code', 'hr.employee.create')->first();
        DB::table('role_permissions')->updateOrInsert(
            ['role_id' => $role->id, 'permission_id' => $perm->id],
            ['effect' => 'ALLOW', 'inherit_to_children' => true]
        );
        $user->roles()->syncWithoutDetaching([$role->id]);

        return $user;
    }

    private function basePayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'New Hire',
            'company_code' => 'nidhi-impex',
            'unit' => 'unit-a',
            'emp_code' => strtoupper(Str::random(8)),
        ], $overrides);
    }

    public static function forbiddenRoleProvider(): array
    {
        return [
            'super admin (0)' => ['0'],
            'master (1)' => ['1'],
            'unit admin (2)' => ['2'],
            'agent (4)' => ['4'],
        ];
    }

    #[DataProvider('forbiddenRoleProvider')]
    public function test_tenant_admin_cannot_mint_privileged_role(string $role): void
    {
        $actor = $this->creator(2);
        $empCode = strtoupper(Str::random(8));

        $this->withToken(auth('api')->login($actor))
            ->postJson('/api/employee/store', $this->basePayload(['role' => $role, 'emp_code' => $empCode]))
            ->assertStatus(403);

        $this->assertDatabaseMissing('users', ['emp_code' => $empCode]);
    }

    #[DataProvider('forbiddenRoleProvider')]
    public function test_custom_employee_creator_cannot_mint_privileged_role(string $role): void
    {
        $actor = $this->creator(3); // a non-admin holder of hr.employee.create

        $this->withToken(auth('api')->login($actor))
            ->postJson('/api/employee/store', $this->basePayload(['role' => $role]))
            ->assertStatus(403);
    }

    public function test_cannot_set_account_type_agent(): void
    {
        $actor = $this->creator(2);

        $this->withToken(auth('api')->login($actor))
            ->postJson('/api/employee/store', $this->basePayload(['type' => 'agent']))
            ->assertStatus(403);
    }

    public function test_can_create_a_normal_employee(): void
    {
        $actor = $this->creator(2);
        $empCode = strtoupper(Str::random(8));

        $this->withToken(auth('api')->login($actor))
            ->postJson('/api/employee/store', $this->basePayload(['emp_code' => $empCode]))
            ->assertOk()
            ->assertJsonPath('status', true);

        $created = User::where('emp_code', $empCode)->first();
        $this->assertNotNull($created);
        $this->assertSame(3, (int) $created->role, 'A standard hire must be tier 3.');
        $this->assertNull($created->type, 'A standard hire must have a null account type.');
    }

    public function test_role_3_is_forced_even_when_omitted(): void
    {
        $actor = $this->creator(2);
        $empCode = strtoupper(Str::random(8));

        $this->withToken(auth('api')->login($actor))
            ->postJson('/api/employee/store', $this->basePayload(['emp_code' => $empCode]))
            ->assertOk();

        $this->assertSame(3, (int) User::where('emp_code', $empCode)->value('role'));
    }
}
