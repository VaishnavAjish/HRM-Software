<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * A trial form may describe a person. It may not configure an account.
 *
 * The endpoint accepted `$request->all()` into User::create, and
 * User::$fillable is shared with real account creation — so `password`,
 * `status`, `is_deleted`, `emp_code` and `processed` were all reachable from the
 * request body. A trial record is a `users` row with role 3, and the login
 * endpoint does not filter on `type`, so a submitter who could set the password
 * could mint themselves a working employee login that no administrator created.
 *
 * The endpoint requires an authenticated agent or admin, which bounds who could
 * do it — not whether it worked.
 */
class TrialFormMassAssignmentTest extends TestCase
{
    use RefreshDatabase;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RbacSeeder::class);

        $this->agent = User::create([
            'name' => 'Agent', 'email' => 'agent@trial.local', 'password' => 'secret1234',
            'emp_code' => 'T-AGENT', 'role' => 4, 'type' => 'agent',
            'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->grantTrialCreate();
    }

    /** The route is gated on recruitment.trial_form.create. */
    private function grantTrialCreate(): void
    {
        $permissionId = DB::table('permissions')->where('name', 'recruitment.trial_form.create')->value('id')
            ?: DB::table('permissions')->where('code', 'recruitment.trial_form.create')->value('id');

        if (! $permissionId) {
            $this->markTestSkipped('recruitment.trial_form.create is not present in this catalogue.');
        }

        $role = Role::query()->create([
            'name' => 'Trial Agent', 'code' => 'trial_agent', 'type' => 'Custom',
            'role_type' => 'BUSINESS', 'is_active' => true, 'is_system' => false,
            'is_assignable' => true, 'is_sensitive' => false, 'requires_approval' => false,
            'default_scope_type' => 'TENANT', 'status' => 'ACTIVE',
        ]);

        DB::table('role_permissions')->insert([
            'role_id' => $role->id, 'permission_id' => $permissionId, 'effect' => 'ALLOW',
            'inherit_to_children' => true,
        ]);

        $this->agent->roles()->syncWithoutDetaching([$role->id]);
    }

    private function asAgent(): static
    {
        return $this->withToken(auth('api')->login($this->agent));
    }

    private const HOSTILE = [
        'name' => 'Candidate',
        'mobile_number' => '9812345678',
        'company_code' => 'nidhi-impex',
        // Everything below is server-owned and must be ignored.
        'password' => 'attacker-chosen-password',
        'status' => 1,
        'is_deleted' => '1',
        'role' => 1,
        'roleId' => 999,
        'type' => 'admin',
        'processed' => 1,
        'added_by' => 99999,
    ];

    public function test_a_supplied_password_is_never_used(): void
    {
        $this->asAgent()->postJson('/api/trial-form/store', self::HOSTILE)->assertOk();

        $trial = User::query()->where('name', 'Candidate')->firstOrFail();

        $this->assertFalse(
            Hash::check('attacker-chosen-password', $trial->password),
            'A trial submission must not be able to choose the credential on the row it creates.',
        );
    }

    public function test_lifecycle_state_comes_from_the_server(): void
    {
        $this->asAgent()->postJson('/api/trial-form/store', self::HOSTILE)->assertOk();

        $trial = User::query()->where('name', 'Candidate')->firstOrFail();

        $this->assertSame(0, (int) $trial->status);
        $this->assertSame('0', (string) $trial->is_deleted);
        $this->assertSame(0, (int) $trial->processed, 'A submission must not pre-mark itself processed.');
    }

    public function test_identity_fields_cannot_be_set_from_the_body(): void
    {
        $this->asAgent()->postJson('/api/trial-form/store', self::HOSTILE)->assertOk();

        $trial = User::query()->where('name', 'Candidate')->firstOrFail();

        $this->assertSame(3, (int) $trial->role, 'role must stay the employee tier whatever was sent.');
        $this->assertSame('trial', $trial->type);
    }

    public function test_added_by_is_the_authenticated_actor_not_the_body(): void
    {
        // added_by scopes an agent's list to their own submissions, so a request
        // naming someone else is a request to file under their identity.
        $this->asAgent()->postJson('/api/trial-form/store', self::HOSTILE)->assertOk();

        $trial = User::query()->where('name', 'Candidate')->firstOrFail();

        $this->assertSame((int) $this->agent->id, (int) $trial->added_by);
    }

    public function test_the_canonical_employee_role_is_still_assigned(): void
    {
        // The hardening must not cost the provisioning it was built alongside.
        $this->asAgent()->postJson('/api/trial-form/store', self::HOSTILE)->assertOk();

        $trial = User::query()->where('name', 'Candidate')->firstOrFail();
        $employeeRoleId = Role::query()->where('code', 'employee')->value('id');

        $this->assertDatabaseHas('user_roles', [
            'user_id' => $trial->id, 'role_id' => $employeeRoleId,
        ]);
    }

    public function test_a_role_id_in_the_body_grants_nothing(): void
    {
        $adminRoleId = Role::query()->where('code', 'tenant_administrator')->value('id');

        $this->asAgent()->postJson('/api/trial-form/store', array_merge(self::HOSTILE, [
            'roleIds' => [$adminRoleId],
        ]))->assertOk();

        $trial = User::query()->where('name', 'Candidate')->firstOrFail();

        $this->assertDatabaseMissing('user_roles', [
            'user_id' => $trial->id, 'role_id' => $adminRoleId,
        ]);
    }

    /* ------------------------------------------------------- company scope */

    public function test_a_company_the_actor_does_not_administer_is_refused(): void
    {
        /*
         * The tenant is an authorization decision, not a fact about the
         * candidate. company_code travelled straight from the body into
         * users.company_code, and every later scope check honoured it — so an
         * agent scoped to one company could file a candidate into another by
         * editing the request.
         */
        $this->asAgent()->postJson('/api/trial-form/store', [
            'name' => 'Cross Tenant',
            'company_code' => 'silver-star',
        ])->assertStatus(403);

        $this->assertDatabaseMissing('users', ['name' => 'Cross Tenant']);
    }

    public function test_a_company_id_outside_the_actors_scope_is_refused(): void
    {
        $silverStarId = DB::table('companies')->where('code', 'silver-star')->value('id');

        $this->asAgent()->postJson('/api/trial-form/store', [
            'name' => 'Cross Tenant By Id',
            'companyId' => $silverStarId,
        ])->assertStatus(403);

        $this->assertDatabaseMissing('users', ['name' => 'Cross Tenant By Id']);
    }

    public function test_the_actors_own_company_is_accepted_by_id_and_by_code(): void
    {
        $nidhiId = DB::table('companies')->where('code', 'nidhi-impex')->value('id');

        $this->asAgent()->postJson('/api/trial-form/store', [
            'name' => 'By Id', 'companyId' => $nidhiId,
        ])->assertOk();

        $this->asAgent()->postJson('/api/trial-form/store', [
            'name' => 'By Code', 'company_code' => 'nidhi-impex',
        ])->assertOk();

        $this->assertSame('nidhi-impex', User::query()->where('name', 'By Id')->value('company_code'));
        $this->assertSame('nidhi-impex', User::query()->where('name', 'By Code')->value('company_code'));
    }

    public function test_an_actor_with_a_single_company_need_not_name_it(): void
    {
        $this->asAgent()->postJson('/api/trial-form/store', ['name' => 'Implicit'])->assertOk();

        $this->assertSame('nidhi-impex', User::query()->where('name', 'Implicit')->value('company_code'));
    }

    public function test_a_unit_outside_the_resolved_company_is_refused(): void
    {
        $silverStarUnit = DB::table('units')
            ->join('companies', 'companies.id', '=', 'units.company_id')
            ->where('companies.code', 'silver-star')
            ->value('units.id');

        $this->asAgent()->postJson('/api/trial-form/store', [
            'name' => 'Wrong Unit', 'unitId' => $silverStarUnit,
        ])->assertStatus(422)->assertJsonPath('error.code', 'UNIT_OUTSIDE_COMPANY');

        $this->assertDatabaseMissing('users', ['name' => 'Wrong Unit']);
    }

    public function test_a_canonical_unit_inside_the_company_is_stored_by_name(): void
    {
        $unit = DB::table('units')
            ->join('companies', 'companies.id', '=', 'units.company_id')
            ->where('companies.code', 'nidhi-impex')
            ->where('units.name', 'Shreeji')
            ->first(['units.id', 'units.name']);

        $this->asAgent()->postJson('/api/trial-form/store', [
            'name' => 'Right Unit', 'unitId' => $unit->id,
        ])->assertOk();

        // users.unit stays the home-unit name every legacy consumer reads.
        $this->assertSame('Shreeji', User::query()->where('name', 'Right Unit')->value('unit'));
    }

    public function test_no_user_row_survives_a_rejected_company(): void
    {
        // Validation happens before the insert, so there is no window in which
        // the row exists without its tenant.
        $before = User::query()->count();

        $this->asAgent()->postJson('/api/trial-form/store', [
            'name' => 'Rolled Back', 'company_code' => 'silver-star',
        ])->assertStatus(403);

        $this->assertSame($before, User::query()->count());
    }

    public function test_a_legacy_free_text_unit_is_still_accepted(): void
    {
        // The historical strings have no confirmed company ownership, so
        // rejecting them would break the form for the units people actually
        // use — and mapping them would be the guess the migration is gated on.
        $this->asAgent()->postJson('/api/trial-form/store', [
            'name' => 'Legacy Unit', 'unit' => 'Some Old Place',
        ])->assertOk();

        $this->assertSame('Some Old Place', User::query()->where('name', 'Legacy Unit')->value('unit'));
    }

    public function test_the_legitimate_form_fields_are_still_recorded(): void
    {
        // An allowlist that drops real data is not a fix.
        $this->asAgent()->postJson('/api/trial-form/store', [
            'name' => 'Real Candidate',
            'mobile_number' => '9812345670',
            'company_code' => 'nidhi-impex',
            'unit' => 'Shreeji',
            'department' => 'Polish',
            'designation' => 'Worker',
            'form_no' => 'TF-1001',
            'experience' => '2 years',
            'last_company_name' => 'Previous Co',
            'gender' => 'MALE',
        ])->assertOk();

        $trial = User::query()->where('name', 'Real Candidate')->firstOrFail();

        $this->assertSame('Shreeji', $trial->unit);
        $this->assertSame('Polish', $trial->department);
        $this->assertSame('Worker', $trial->designation);
        $this->assertSame('TF-1001', $trial->form_no);
        $this->assertSame('2 years', $trial->experience);
        $this->assertSame('Previous Co', $trial->last_company_name);
        // form_no still seeds punching_no when the form omits it.
        $this->assertSame('TF-1001', $trial->punching_no);
    }
}
