<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Permission;
use App\Models\PermissionDimension;
use App\Models\Role;
use App\Models\User;
use App\Support\AadhaarAccess;
use Database\Seeders\AadhaarRevealPermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Registration of appointments.view_full_aadhaar.
 *
 * The permission has to be discoverable by name in the RBAC screens, granted to
 * Super Admins by default, and given to nobody else automatically. It also has
 * to survive being re-seeded on every deploy without resurrecting a grant an
 * administrator has deliberately removed.
 */
class AadhaarRevealPermissionSeederTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private function makeUser(int $role): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Actor {$n}", 'email' => "seed-actor-{$n}@test.local",
            'password' => 'x', 'role' => $role, 'company_code' => 'nidhi-impex',
            'status' => 0, 'is_deleted' => 0,
        ]);
    }

    private function runSeeder(): void
    {
        $this->seed(AadhaarRevealPermissionSeeder::class);
    }

    private function dimensionFor(User $actor): ?PermissionDimension
    {
        $role = Role::where('name', 'User_'.$actor->id.'_Permissions')->first();

        if (! $role) {
            return null;
        }

        return PermissionDimension::where('role_id', $role->id)
            ->where('key_name', AadhaarAccess::PERMISSION)
            ->first();
    }

    public function test_it_registers_the_permission_with_discoverable_metadata(): void
    {
        $this->runSeeder();

        $permission = Permission::where('name', AadhaarAccess::PERMISSION)->first();

        $this->assertNotNull($permission);
        $this->assertStringContainsString('HIGH RISK', $permission->description);
        $this->assertStringContainsString('audited', $permission->description);
        $this->assertSame('Appointments', $permission->group->name);
    }

    public function test_running_it_twice_creates_no_duplicates(): void
    {
        $this->makeUser(0);

        $this->runSeeder();
        $this->runSeeder();

        $this->assertSame(1, Permission::where('name', AadhaarAccess::PERMISSION)->count());
        $this->assertSame(
            1,
            PermissionDimension::where('key_name', AadhaarAccess::PERMISSION)->count(),
        );
    }

    public function test_a_super_admin_receives_the_grant(): void
    {
        $superAdmin = $this->makeUser(0);

        $this->runSeeder();

        $entry = $this->dimensionFor($superAdmin);
        $this->assertNotNull($entry);
        $this->assertSame('view_only', $entry->value);
        $this->assertSame('page', $entry->dimension);
    }

    public function test_no_other_role_receives_it_automatically(): void
    {
        $admin = $this->makeUser(1);
        $manager = $this->makeUser(2);
        $employee = $this->makeUser(3);
        $agent = $this->makeUser(4);

        $this->runSeeder();

        foreach ([$admin, $manager, $employee, $agent] as $actor) {
            $this->assertNull($this->dimensionFor($actor), "role {$actor->role} must not be granted");
            $this->assertFalse(AadhaarAccess::allows($actor->fresh()));
        }
    }

    public function test_reseeding_does_not_resurrect_a_deliberate_revocation(): void
    {
        $superAdmin = $this->makeUser(0);
        $this->runSeeder();

        // An administrator turns it off.
        $this->dimensionFor($superAdmin)->update(['value' => 'no_access']);

        $this->runSeeder();

        // The decision stands rather than being undone by the next deploy.
        $this->assertSame('no_access', $this->dimensionFor($superAdmin)->value);
    }

    public function test_an_assigned_non_super_admin_can_reveal(): void
    {
        $hr = $this->makeUser(1);
        $this->runSeeder();

        $this->assertFalse(AadhaarAccess::allows($hr->fresh()));

        $role = Role::firstOrCreate(
            ['name' => 'User_'.$hr->id.'_Permissions'],
            ['type' => 'Custom']
        );
        PermissionDimension::create([
            'dimension' => 'page', 'role_id' => $role->id,
            'key_name' => AadhaarAccess::PERMISSION, 'value' => 'view_only',
        ]);

        $this->assertTrue(AadhaarAccess::allows($hr->fresh()));
    }

    public function test_revoking_the_grant_removes_access_again(): void
    {
        $hr = $this->makeUser(1);
        $role = Role::create(['name' => 'User_'.$hr->id.'_Permissions', 'type' => 'Custom']);
        $entry = PermissionDimension::create([
            'dimension' => 'page', 'role_id' => $role->id,
            'key_name' => AadhaarAccess::PERMISSION, 'value' => 'read_write',
        ]);

        $this->assertTrue(AadhaarAccess::allows($hr->fresh()));

        $entry->update(['value' => 'no_access']);
        $this->assertFalse(AadhaarAccess::allows($hr->fresh()));

        $entry->delete();
        $this->assertFalse(AadhaarAccess::allows($hr->fresh()));
    }

    public function test_granting_the_permission_through_the_api_is_audited(): void
    {
        $superAdmin = $this->makeUser(0);
        $hr = $this->makeUser(1);
        $role = Role::create(['name' => 'User_'.$hr->id.'_Permissions', 'type' => 'Custom']);

        $this->withToken(auth('api')->login($superAdmin))
            ->postJson('/api/rbac/permission-dimensions/page', [
                'role_id' => $role->id,
                'key_name' => AadhaarAccess::PERMISSION,
                'value' => 'view_only',
            ])
            ->assertOk();

        $entry = AuditLog::where('action', 'ASSIGN')->latest('id')->first();

        $this->assertNotNull($entry);
        $this->assertSame($superAdmin->id, $entry->user_id);
        $this->assertSame(AadhaarAccess::PERMISSION, $entry->new_value['key_name']);
        $this->assertNotNull($entry->ip_address);
    }

    public function test_revoking_the_permission_through_the_api_is_audited(): void
    {
        $superAdmin = $this->makeUser(0);
        $hr = $this->makeUser(1);
        $role = Role::create(['name' => 'User_'.$hr->id.'_Permissions', 'type' => 'Custom']);
        $entry = PermissionDimension::create([
            'dimension' => 'page', 'role_id' => $role->id,
            'key_name' => AadhaarAccess::PERMISSION, 'value' => 'view_only',
        ]);

        $this->withToken(auth('api')->login($superAdmin))
            ->deleteJson("/api/rbac/permission-dimensions/page/{$entry->id}")
            ->assertOk();

        $log = AuditLog::where('action', 'REVOKE')->latest('id')->first();

        $this->assertNotNull($log);
        $this->assertSame(AadhaarAccess::PERMISSION, $log->old_value['key_name']);
    }

    public function test_permission_audit_entries_carry_no_aadhaar_value(): void
    {
        $superAdmin = $this->makeUser(0);
        $hr = $this->makeUser(1);
        $hr->forceFill(['aadhar_card_no' => '123456788793'])->save();
        $role = Role::create(['name' => 'User_'.$hr->id.'_Permissions', 'type' => 'Custom']);

        $this->withToken(auth('api')->login($superAdmin))
            ->postJson('/api/rbac/permission-dimensions/page', [
                'role_id' => $role->id,
                'key_name' => AadhaarAccess::PERMISSION,
                'value' => 'view_only',
            ])
            ->assertOk();

        // Permission management records a key and a value, never identity data.
        $serialised = json_encode(AuditLog::all()->toArray());
        $this->assertStringNotContainsString('123456788793', $serialised);
    }
}
