<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\AuthorizationEngine;
use App\Services\Authorization\Matrix\EffectiveStateResolver;
use App\Services\Authorization\Matrix\RoleMatrixWriter;
use App\Services\Authorization\RoleManagementService;
use App\Support\PermissionRegistry;
use Database\Seeders\PermissionRegistrySeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

/**
 * Saving a grant in the Permission Matrix must leave it effective: the engine's
 * ancestor gate refuses any code whose registry ancestors are not held, so the
 * writer now grants missing ancestors with the save (audited as ANCESTOR) and
 * refuses saves whose required ancestor carries an explicit DENY.
 *
 * Disposable database only (phpunit.disposable.xml).
 */
class RoleMatrixAncestorNormalizationTest extends TestCase
{
    use RefreshDatabase;

    private const CHILD = 'ui.access_control.users';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RbacSeeder::class);
        $this->seed(PermissionRegistrySeeder::class);
    }

    private function makeRole(): Role
    {
        return app(RoleManagementService::class)->create(['name' => 'Matrix Test ' . Str::random(6)]);
    }

    private function requiredAncestors(string $code): array
    {
        return array_values(array_filter(
            PermissionRegistry::requiredCodesFor($code),
            fn ($ancestor) => $ancestor !== $code
                && (PermissionRegistry::node($ancestor)['permission'] ?? null) !== null
        ));
    }

    private function heldCodes(Role $role): array
    {
        return DB::table('role_permissions')
            ->join('permissions', 'permissions.id', '=', 'role_permissions.permission_id')
            ->where('role_permissions.role_id', $role->id)
            ->where('role_permissions.effect', 'ALLOW')
            ->pluck('permissions.code')
            ->all();
    }

    public function test_granting_a_child_grants_its_missing_registry_ancestors(): void
    {
        $ancestors = $this->requiredAncestors(self::CHILD);
        $this->assertNotEmpty($ancestors, 'test premise: the child must have ancestor permission nodes');

        $role = $this->makeRole();

        $result = app(RoleMatrixWriter::class)->apply(
            $role,
            [['permissionCode' => self::CHILD, 'state' => EffectiveStateResolver::ALLOW]],
            'test',
            null,
            1,
        );

        $held = $this->heldCodes($role);
        $this->assertContains(self::CHILD, $held);

        foreach ($ancestors as $ancestor) {
            $this->assertContains($ancestor, $held, "ancestor {$ancestor} should be auto-granted");
        }

        $this->assertGreaterThan(0, $result['ancestorsGranted']);

        $auditRows = DB::table('authorization_permission_audit_logs')
            ->where('subject_id', (string) $role->id)
            ->where('change_type', 'ANCESTOR')
            ->pluck('permission_code')
            ->all();

        $this->assertNotEmpty($auditRows, 'ancestor grants must be audited as ANCESTOR changes');
    }

    public function test_granted_child_is_effective_for_an_assigned_user(): void
    {
        $role = $this->makeRole();

        app(RoleMatrixWriter::class)->apply(
            $role,
            [['permissionCode' => self::CHILD, 'state' => EffectiveStateResolver::ALLOW]],
            'test',
            null,
            1,
        );

        $user = User::create([
            'name' => 'AN' . Str::random(4),
            'email' => Str::lower(Str::random(10)) . '@ancestor.test',
            'password' => 'x',
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'emp_code' => strtoupper(Str::random(8)),
            'status' => 0,
            'is_deleted' => 0,
        ]);
        $user->roles()->sync([$role->id]);

        $decision = app(AuthorizationEngine::class)->decide($user, self::CHILD, [], ['audit' => false]);

        $this->assertTrue($decision->allowed, 'granted child must be effective, not PARENT_DENIED (' . $decision->reasonCode . ')');
    }

    public function test_save_is_refused_when_a_required_ancestor_is_explicitly_denied(): void
    {
        $ancestors = $this->requiredAncestors(self::CHILD);
        $role = $this->makeRole();
        $writer = app(RoleMatrixWriter::class);

        $writer->apply(
            $role,
            [['permissionCode' => $ancestors[0], 'state' => EffectiveStateResolver::DENY]],
            'test',
            null,
            1,
        );

        try {
            $writer->apply(
                $role,
                [['permissionCode' => self::CHILD, 'state' => EffectiveStateResolver::ALLOW]],
                'test',
                null,
                1,
            );
            $this->fail('expected PARENT_EXPLICIT_DENY');
        } catch (RuntimeException $exception) {
            $this->assertStringStartsWith('PARENT_EXPLICIT_DENY:', $exception->getMessage());
            $this->assertStringContainsString($ancestors[0], $exception->getMessage());
        }

        $this->assertNotContains(self::CHILD, $this->heldCodes($role), 'refused save must roll back the child grant');
    }

    public function test_deny_and_unassign_changes_do_not_pull_in_ancestors(): void
    {
        $role = $this->makeRole();
        $before = $this->heldCodes($role);

        app(RoleMatrixWriter::class)->apply(
            $role,
            [['permissionCode' => self::CHILD, 'state' => EffectiveStateResolver::DENY]],
            'test',
            null,
            1,
        );

        $after = $this->heldCodes($role);
        sort($before);
        sort($after);
        $this->assertSame($before, $after, 'a DENY save must not grant any ancestors');
    }
}
