<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\FeatureFlags;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * A permission granted in the matrix has to reach the user who was granted it.
 *
 * It did not. The reported symptom was that a super administrator would grant a
 * permission, the affected employee would sign in, and the grant would not be
 * there — then appear on its own a few minutes later, which made it look
 * intermittent rather than broken.
 *
 * Two independent defects, either of which alone produces that:
 *
 * 1. AuthorizationCache::invalidate() was inert. It bumped the version with
 *    Cache::increment(), which on the database and file stores is an UPDATE
 *    against an existing row — and the version key was never written, because
 *    version() read it with a DEFAULT of 1 rather than storing one. increment()
 *    returned false, created nothing, and the version stayed 1 forever. Every
 *    invalidate() call in the codebase was doing nothing at all.
 *
 * 2. Even with a working bump, a role edit invalidates $role->tenant_id, which
 *    is NULL on every role here, so it bumped only the "global" counter. User
 *    snapshots are cached under the user's own company_code, whose counter is
 *    separate and was never touched. A role's permissions are global data; the
 *    tenant version has to move with the global one.
 *
 * The 300-second TTL is why it eventually corrected itself.
 */
class AuthorizationCacheInvalidationTest extends TestCase
{
    use RefreshDatabase;

    private function cache(): AuthorizationCache
    {
        return app(AuthorizationCache::class);
    }

    /* ------------------------------------------------- the version counter */

    public function test_invalidating_actually_moves_the_version(): void
    {
        $cache = $this->cache();
        $before = $cache->version(null);

        $cache->invalidate(null);

        $this->assertGreaterThan(
            $before,
            $cache->version(null),
            'invalidate() did not move the version, so nothing cached under it is ever busted.',
        );
    }

    public function test_the_version_moves_on_a_store_where_increment_cannot_create_the_key(): void
    {
        /*
         * Run against the database store deliberately.
         *
         * phpunit.xml sets CACHE_STORE=array, and the array store's increment()
         * happily creates a missing key — so the whole defect is invisible under
         * the test configuration and every existing test passed while production
         * never invalidated anything. Production resolves to the database store,
         * where increment() is an UPDATE and returns false when there is no row.
         */
        config(['cache.default' => 'database']);
        Cache::clearResolvedInstances();

        Cache::forget('authz:version:global');
        Cache::forget('authz:version:nidhi-impex');

        $this->assertFalse(
            Cache::increment('authz:version:global'),
            'Precondition: on this store increment() cannot create the key.',
        );

        $cache = $this->cache();
        $before = $cache->version('nidhi-impex');

        $cache->invalidate('nidhi-impex');

        $this->assertGreaterThan($before, $cache->version('nidhi-impex'));
    }

    public function test_a_global_change_busts_every_tenant(): void
    {
        /*
         * Role permissions are not tenant data. A role edit invalidates the null
         * tenant, and that has to reach snapshots cached under a company code —
         * otherwise the grant lands in the database and the user keeps reading a
         * snapshot that predates it.
         */
        $cache = $this->cache();

        $before = [
            'nidhi-impex' => $cache->version('nidhi-impex'),
            'silver-star' => $cache->version('silver-star'),
        ];

        $cache->invalidate(null);

        foreach ($before as $tenant => $version) {
            $this->assertGreaterThan(
                $version,
                $cache->version($tenant),
                "A global invalidation left {$tenant} on its old version.",
            );
        }
    }

    public function test_a_remembered_value_is_actually_dropped(): void
    {
        $cache = $this->cache();

        $first = $cache->remember('probe', 'nidhi-impex', fn () => 'original', 300);
        $this->assertSame('original', $first);

        // Still cached, so the resolver must not run again.
        $this->assertSame('original', $cache->remember('probe', 'nidhi-impex', fn () => 'rebuilt', 300));

        $cache->invalidate(null);

        $this->assertSame('rebuilt', $cache->remember('probe', 'nidhi-impex', fn () => 'rebuilt', 300));
    }

    /* --------------------------------------------------- end to end, via API */

    public function test_a_matrix_grant_reaches_the_users_next_snapshot(): void
    {
        $this->seed(RbacSeeder::class);
        // The ui.* registry codes the matrix works in are written by the
        // catalogue sync, not by RbacSeeder.
        $this->seed(\Database\Seeders\PermissionRegistrySeeder::class);

        DB::table('authorization_feature_flags')->updateOrInsert(
            ['tenant_id' => '*', 'key' => 'authorization_shadow_mode'],
            ['enabled' => false, 'created_at' => now(), 'updated_at' => now()]
        );
        app(FeatureFlags::class)->forget('authorization_shadow_mode', null);
        app(FeatureFlags::class)->forget('authorization_shadow_mode', 'nidhi-impex');

        $superAdmin = User::create([
            'name' => 'Root', 'email' => 'root@cachefix.local', 'password' => 'secret1234',
            'emp_code' => 'C-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
        $superAdmin->roles()->sync([Role::query()->where('code', 'super_administrator')->value('id')]);

        $employeeRole = Role::query()->where('code', 'employee')->firstOrFail();

        $employee = User::create([
            'name' => 'Asha', 'email' => 'asha@cachefix.local', 'password' => 'secret1234',
            'emp_code' => 'C-EMP', 'role' => 3, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
        $employee->roles()->sync([$employeeRole->id]);

        // A registry code: the matrix validates changes against the canonical
        // registry, not against legacy permission names.
        $code = 'ui.hr.assets.export';

        $granted = Permission::query()->where('name', $code)->orWhere('code', $code)->firstOrFail();

        DB::table('role_permissions')
            ->where('role_id', $employeeRole->id)
            ->where('permission_id', $granted->id)
            ->delete();

        $holds = function () use ($employee, $code): bool {
            $snapshot = $this->withToken(auth('api')->login($employee))
                ->getJson('/api/v1/authorization/me')->assertOk()->json('data');

            return (bool) ($snapshot['permissions'][$code]['allowed'] ?? false);
        };

        // Signing in first is what made this reproducible: it populates the
        // per-user snapshot that the grant then has to displace.
        $this->assertFalse($holds(), 'Precondition: the employee does not hold it yet.');

        /*
         * The whole chain, because a leaf under an unassigned ancestor resolves
         * to an effective DENY by design — see
         * test_a_leaf_granted_under_an_unassigned_parent_stays_denied below.
         * Granting only the leaf would test the parent rule, not the cache.
         */
        $this->withToken(auth('api')->login($superAdmin))
            ->putJson('/api/v1/roles/' . $employeeRole->id . '/matrix', [
                'changes' => [
                    ['permissionCode' => 'ui.hr', 'state' => 'ALLOW'],
                    ['permissionCode' => 'ui.hr.assets', 'state' => 'ALLOW'],
                    ['permissionCode' => $code, 'state' => 'ALLOW'],
                ],
                'businessReason' => 'Granting asset export.',
            ])->assertOk();

        $this->assertTrue(
            $holds(),
            'The grant is in the database but the user still reads a snapshot that predates it.',
        );
    }

    public function test_a_leaf_granted_under_an_unassigned_parent_stays_denied(): void
    {
        /*
         * Not a bug, and the second reason a grant can appear not to take.
         *
         * A child never bypasses an ancestor: granting "export assets" while the
         * Assets page itself is unassigned resolves to an effective DENY. The
         * configured ALLOW is kept — re-enabling the parent restores the child
         * rather than requiring every descendant to be set again — so the
         * database genuinely holds ALLOW while the engine answers DENY.
         *
         * The matrix shows this inline on each row, but an administrator who
         * ticks one action and saves will see exactly the reported symptom.
         */
        $this->seed(RbacSeeder::class);
        $this->seed(\Database\Seeders\PermissionRegistrySeeder::class);

        DB::table('authorization_feature_flags')->updateOrInsert(
            ['tenant_id' => '*', 'key' => 'authorization_shadow_mode'],
            ['enabled' => false, 'created_at' => now(), 'updated_at' => now()]
        );
        app(FeatureFlags::class)->forget('authorization_shadow_mode', null);
        app(FeatureFlags::class)->forget('authorization_shadow_mode', 'nidhi-impex');

        $superAdmin = User::create([
            'name' => 'Root', 'email' => 'root@parent.local', 'password' => 'secret1234',
            'emp_code' => 'P-ROOT2', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
        $superAdmin->roles()->sync([Role::query()->where('code', 'super_administrator')->value('id')]);

        $employeeRole = Role::query()->where('code', 'employee')->firstOrFail();

        $employee = User::create([
            'name' => 'Asha', 'email' => 'asha@parent.local', 'password' => 'secret1234',
            'emp_code' => 'P-EMP2', 'role' => 3, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
        $employee->roles()->sync([$employeeRole->id]);

        $code = 'ui.hr.assets.export';

        $this->withToken(auth('api')->login($superAdmin))
            ->putJson('/api/v1/roles/' . $employeeRole->id . '/matrix', [
                'changes' => [['permissionCode' => $code, 'state' => 'ALLOW']],
                'businessReason' => 'Leaf only.',
            ])->assertOk();

        // Stored...
        $this->assertDatabaseHas('role_permissions', [
            'role_id' => $employeeRole->id,
            'permission_id' => Permission::query()->where('name', $code)->value('id'),
            'effect' => 'ALLOW',
        ]);

        // ...and still denied, because its ancestors grant nothing.
        $snapshot = $this->withToken(auth('api')->login($employee))
            ->getJson('/api/v1/authorization/me')->assertOk()->json('data');

        $this->assertFalse($snapshot['permissions'][$code]['allowed']);
        $this->assertSame(['ui.hr.assets', 'ui.hr'], $snapshot['requires'][$code]);
    }
}
