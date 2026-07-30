<?php

namespace Tests\Feature;

use App\Models\DocumentAuditLog;
use App\Models\PermissionDimension;
use App\Models\Role;
use App\Models\User;
use App\Support\AadhaarAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Disclosure of a complete Aadhaar on the employee/profile surfaces.
 *
 * The rule is the same everywhere: you always see your own, you see somebody
 * else's only with a grant, and lists never carry it. users.aadhar_card_no stays
 * in User::$hidden throughout — aadhaar_full is added explicitly per response.
 */
class EmployeeAadhaarDisclosureTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private function makeUser(int $role, string $aadhaar = '715115981345'): User
    {
        $n = ++$this->seq;

        $user = User::create([
            'name' => "Person {$n}", 'email' => "disclose-{$n}@test.local",
            'password' => 'x', 'role' => $role, 'emp_code' => "EMP90{$n}",
            'company_code' => 'nidhi-impex', 'unit' => 'Ichapur', 'status' => 0, 'is_deleted' => 0,
        ]);

        if ($aadhaar !== '') {
            $user->forceFill(['aadhar_card_no' => $aadhaar])->save();
        }

        return $user->fresh();
    }

    private function grant(User $actor): void
    {
        $role = Role::firstOrCreate(
            ['name' => 'User_'.$actor->id.'_Permissions'],
            ['type' => 'Custom']
        );

        PermissionDimension::create([
            'dimension' => 'page', 'role_id' => $role->id,
            'key_name' => AadhaarAccess::EMPLOYEE_PERMISSION, 'value' => 'view_only',
        ]);
    }

    public function test_an_employee_sees_their_own_complete_number_on_their_profile(): void
    {
        $employee = $this->makeUser(3);

        $this->withToken(auth('api')->login($employee))
            ->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('user.aadhaar_full', '715115981345')
            ->assertJsonPath('user.aadhaar_masked', 'XXXX XXXX 1345')
            // The raw column never appears, even for the owner.
            ->assertJsonMissingPath('user.aadhar_card_no');
    }

    public function test_self_disclosure_needs_no_permission_grant(): void
    {
        $employee = $this->makeUser(3);

        $this->assertFalse(AadhaarAccess::allows($employee));
        $this->assertTrue(AadhaarAccess::allowsFor($employee, $employee));
        $this->assertSame('SELF', AadhaarAccess::basisFor($employee, $employee));
    }

    public function test_one_employee_cannot_reach_another_employees_record(): void
    {
        $viewer = $this->makeUser(3);
        $other = $this->makeUser(3);

        // Refused at the route middleware, before disclosure is even considered —
        // a plain employee has no business on the employee-details endpoint.
        $response = $this->withToken(auth('api')->login($viewer))
            ->getJson("/api/employee/show/{$other->id}");

        $response->assertStatus(403);
        $this->assertStringNotContainsString('715115981345', $response->getContent());
    }

    public function test_disclosure_itself_refuses_a_non_owner_without_a_grant(): void
    {
        $viewer = $this->makeUser(3);
        $other = $this->makeUser(3);

        // The rule holds independently of the route guard above.
        $this->assertFalse(AadhaarAccess::allowsFor($viewer, $other));
        $this->assertNull(AadhaarAccess::basisFor($viewer, $other));
    }

    public function test_a_super_admin_sees_an_employees_number(): void
    {
        $admin = $this->makeUser(0);
        $employee = $this->makeUser(3);

        $this->withToken(auth('api')->login($admin))
            ->getJson("/api/employee/show/{$employee->id}")
            ->assertOk()
            ->assertJsonPath('data.aadhaar_full', '715115981345');
    }

    public function test_an_explicitly_granted_admin_sees_an_employees_number(): void
    {
        $hr = $this->makeUser(1);
        $employee = $this->makeUser(3);
        $this->grant($hr);

        $this->withToken(auth('api')->login($hr->fresh()))
            ->getJson("/api/employee/show/{$employee->id}")
            ->assertOk()
            ->assertJsonPath('data.aadhaar_full', '715115981345');
    }

    public function test_an_admin_without_the_grant_gets_only_the_mask(): void
    {
        $hr = $this->makeUser(1);
        $employee = $this->makeUser(3);

        $response = $this->withToken(auth('api')->login($hr))
            ->getJson("/api/employee/show/{$employee->id}");

        $response->assertOk()
            ->assertJsonPath('data.aadhaar_masked', 'XXXX XXXX 1345')
            ->assertJsonMissingPath('data.aadhaar_full');
    }

    public function test_a_record_without_an_aadhaar_discloses_nothing(): void
    {
        $admin = $this->makeUser(0);
        $employee = $this->makeUser(3, '');

        $this->withToken(auth('api')->login($admin))
            ->getJson("/api/employee/show/{$employee->id}")
            ->assertOk()
            ->assertJsonMissingPath('data.aadhaar_full');
    }

    public function test_the_employee_list_never_carries_the_full_number(): void
    {
        $this->makeUser(3);
        $admin = $this->makeUser(0);

        $response = $this->withToken(auth('api')->login($admin))
            ->getJson('/api/employee/get');

        $response->assertOk();
        $this->assertStringNotContainsString('aadhaar_full', $response->getContent());
        $this->assertStringNotContainsString('715115981345', $response->getContent());
    }

    public function test_disclosure_is_audited_with_its_basis_and_no_number(): void
    {
        $admin = $this->makeUser(0);
        $employee = $this->makeUser(3);

        $this->withToken(auth('api')->login($admin))
            ->getJson("/api/employee/show/{$employee->id}")
            ->assertOk();

        $entry = DocumentAuditLog::where('action', 'EMPLOYEE_FULL_AADHAAR_VIEWED')->latest('id')->first();

        $this->assertNotNull($entry);
        $this->assertSame($admin->id, $entry->actor_user_id);
        $this->assertSame($employee->id, $entry->metadata['target_user_id']);
        $this->assertSame('PERMISSION', $entry->metadata['basis']);
        $this->assertSame('1345', $entry->metadata['aadhaar_last4']);
        $this->assertStringNotContainsString('715115981345', json_encode($entry->toArray()));
    }

    public function test_self_disclosure_is_audited_as_ownership(): void
    {
        $employee = $this->makeUser(3);

        $this->withToken(auth('api')->login($employee))->getJson('/api/profile')->assertOk();

        $entry = DocumentAuditLog::where('action', 'EMPLOYEE_FULL_AADHAAR_VIEWED')->latest('id')->first();

        $this->assertNotNull($entry);
        $this->assertSame('SELF', $entry->metadata['basis']);
        $this->assertSame('OWNERSHIP', $entry->permission);
    }

    public function test_a_masked_only_view_records_no_disclosure(): void
    {
        $hr = $this->makeUser(1);
        $employee = $this->makeUser(3);

        $this->withToken(auth('api')->login($hr))
            ->getJson("/api/employee/show/{$employee->id}")
            ->assertOk();

        $this->assertSame(
            0,
            DocumentAuditLog::where('action', 'EMPLOYEE_FULL_AADHAAR_VIEWED')->count(),
        );
    }

    public function test_a_self_profile_save_cannot_overwrite_the_stored_number(): void
    {
        $employee = $this->makeUser(3);

        // Exactly what the profile form used to post: the displayed value.
        $this->withToken(auth('api')->login($employee))
            ->postJson('/api/profile-update', [
                'name' => 'Renamed Person',
                'aadhar_card_no' => 'XXXX XXXX 1345',
            ])
            ->assertOk();

        $this->assertSame('715115981345', $employee->fresh()->getRawOriginal('aadhar_card_no'));
        $this->assertSame('Renamed Person', $employee->fresh()->name);
    }

    public function test_a_self_profile_save_may_still_set_a_complete_number(): void
    {
        $employee = $this->makeUser(3, '');

        $this->withToken(auth('api')->login($employee))
            ->postJson('/api/profile-update', ['aadhar_card_no' => '9999 8888 7777'])
            ->assertOk();

        $this->assertSame('999988887777', $employee->fresh()->getRawOriginal('aadhar_card_no'));
    }

    public function test_a_cross_company_admin_cannot_reach_the_record_at_all(): void
    {
        $employee = $this->makeUser(3);
        $outsider = User::create([
            'name' => 'Outsider', 'email' => 'outsider@test.local', 'password' => 'x',
            'role' => 1, 'company_code' => 'silver-star', 'status' => 0, 'is_deleted' => 0,
        ]);

        $this->withToken(auth('api')->login($outsider))
            ->getJson("/api/employee/show/{$employee->id}")
            ->assertStatus(404);
    }
}
