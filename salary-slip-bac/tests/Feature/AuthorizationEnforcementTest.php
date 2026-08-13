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
use Tests\TestCase;

/**
 * F-A1 enforcement contract. Under AUTHZ_MODE=enforced:
 *   - a canonical ALLOW reaches the endpoint,
 *   - a canonical DENY is a real 403 with NO legacy numeric-role allow-through
 *     (the "director/account/agent lock-out" class this whole lane fixed),
 *   - the protected super admin still bypasses.
 *
 * Runs on the disposable database only (see phpunit.disposable.xml).
 */
class AuthorizationEnforcementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RbacSeeder::class);
        $this->seed(PermissionRegistrySeeder::class);
        config([
            'authorization.enforcement.default_mode' => 'enforced',
            'authorization.enforcement.enforced_prefixes' => ['self.', 'ui.', 'hr.', 'payroll.'],
        ]);
    }

    private function makeUser(int $tier, ?string $type = null): User
    {
        return User::create([
            'name' => 'T' . Str::random(5),
            'email' => Str::lower(Str::random(10)) . '@enforce.test',
            'password' => 'x',
            'role' => $tier,
            'company_code' => 'nidhi-impex',
            'emp_code' => strtoupper(Str::random(8)),
            'status' => 0,
            'is_deleted' => 0,
            'type' => $type,
        ]);
    }

    private function roleWith(array $permissionCodes): Role
    {
        $role = Role::create([
            'name' => 'R' . Str::random(5),
            'code' => 'r_' . Str::lower(Str::random(8)),
            'is_active' => true,
            'status' => 'ACTIVE',
        ]);

        foreach ($permissionCodes as $code) {
            $perm = Permission::where('code', $code)->first();
            if ($perm) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $role->id, 'permission_id' => $perm->id],
                    ['effect' => 'ALLOW', 'obligations' => null, 'inherit_to_children' => true]
                );
            }
        }

        return $role;
    }

    public function test_canonical_allow_reaches_profile(): void
    {
        $user = $this->makeUser(3);
        $user->roles()->syncWithoutDetaching([$this->roleWith(['self.profile.read'])->id]);

        $this->withToken(auth('api')->login($user))
            ->getJson('/api/profile')
            ->assertOk();
    }

    public function test_canonical_deny_is_403_with_no_legacy_bypass(): void
    {
        // Legacy tier 1 ("admin") holding a role WITHOUT self.profile.read. Under
        // shadow this numeric role would pass; under enforced it must be denied.
        $user = $this->makeUser(1);
        $user->roles()->syncWithoutDetaching([$this->roleWith(['ui.portals'])->id]);

        $this->withToken(auth('api')->login($user))
            ->getJson('/api/profile')
            ->assertStatus(403);
    }

    public function test_super_admin_bypasses_enforcement(): void
    {
        $superAdmin = $this->makeUser(0);

        $this->withToken(auth('api')->login($superAdmin))
            ->getJson('/api/profile')
            ->assertOk();
    }
}
