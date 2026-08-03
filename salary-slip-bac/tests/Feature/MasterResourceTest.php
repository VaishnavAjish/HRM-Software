<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Behaviour of the small RBAC master resources, captured before porting them.
 *
 * Two things are being pinned here:
 *
 *  1. BaseResourceController uses one $rules array for both store() and
 *     update(). BranchController's includes 'unique:branches,code' with no
 *     Rule::unique()->ignore($id), so an update that keeps the record's own
 *     code is validated against itself.
 *
 *  2. The exact JSON shape of a shift's time columns, which the React client
 *     renders directly. Postgres returns `time` values as strings; a port that
 *     hands back a Date would serialise as an ISO timestamp instead.
 */
class MasterResourceTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::create([
            'name' => 'Admin', 'email' => 'master-admin@test.local',
            'password' => 'x', 'role' => 0, 'company_code' => 'nidhi-impex',
            'status' => 0, 'is_deleted' => 0,
        ]);
    }

    private function actingAsAdmin()
    {
        return $this->withToken(auth('api')->login($this->admin()));
    }

    public function test_a_branch_can_be_created(): void
    {
        $this->actingAsAdmin()
            ->postJson('/api/rbac/branches/store', ['name' => 'Head Office', 'code' => 'HO'])
            ->assertOk();

        $this->assertDatabaseHas('branches', ['code' => 'HO']);
    }

    public function test_a_duplicate_branch_code_is_refused(): void
    {
        Branch::create(['name' => 'Head Office', 'code' => 'HO']);

        $this->actingAsAdmin()
            ->postJson('/api/rbac/branches/store', ['name' => 'Another', 'code' => 'HO'])
            ->assertStatus(422);
    }

    /**
     * Renaming a branch while keeping its own code.
     *
     * This is the ordinary edit — open the row, change the name, save — and it
     * is rejected, because the unique rule compares the code against every row
     * including this one.
     */
    public function test_renaming_a_branch_keeping_its_code(): void
    {
        $branch = Branch::create(['name' => 'Head Office', 'code' => 'HO']);

        $response = $this->actingAsAdmin()
            ->putJson("/api/rbac/branches/update/{$branch->id}", [
                'name' => 'Head Office (Renamed)',
                'code' => 'HO',
            ]);

        // Documented as-is: change this assertion only alongside a fix.
        $response->assertStatus(422);
        $this->assertSame('Head Office', $branch->fresh()->name);
    }

    public function test_a_branch_can_be_updated_if_the_code_also_changes(): void
    {
        $branch = Branch::create(['name' => 'Head Office', 'code' => 'HO']);

        $this->actingAsAdmin()
            ->putJson("/api/rbac/branches/update/{$branch->id}", [
                'name' => 'Head Office (Renamed)',
                'code' => 'HO2',
            ])->assertOk();

        $this->assertSame('Head Office (Renamed)', $branch->fresh()->name);
    }

    public function test_updating_a_missing_branch_is_a_404(): void
    {
        $this->actingAsAdmin()
            ->putJson('/api/rbac/branches/update/999999', ['name' => 'X', 'code' => 'X1'])
            ->assertStatus(404);
    }

    public function test_a_branch_can_be_deleted(): void
    {
        $branch = Branch::create(['name' => 'Head Office', 'code' => 'HO']);

        $this->actingAsAdmin()
            ->deleteJson("/api/rbac/branches/delete/{$branch->id}")
            ->assertOk();

        $this->assertDatabaseMissing('branches', ['id' => $branch->id]);
    }

    public function test_an_approval_level_type_is_restricted(): void
    {
        // The column also carries a CHECK constraint, so an unvalidated write
        // would surface as a raw database error rather than a 422.
        $this->actingAsAdmin()
            ->postJson('/api/rbac/approval-levels/store', [
                'name' => 'Bad', 'level' => 1, 'type' => 'Something Else',
            ])->assertStatus(422);
    }

    public function test_shift_times_are_returned_as_strings(): void
    {
        Shift::create([
            'name' => 'General', 'company_code' => 'nidhi-impex',
            'start_time' => '09:00', 'end_time' => '18:00', 'grace_minutes' => 10,
        ]);

        $response = $this->actingAsAdmin()->getJson('/api/shifts/get?company_code=nidhi-impex');
        $response->assertOk();

        $shift = $response->json('data.0');

        // The client renders these directly. A Date here would serialise as an
        // ISO timestamp and display as a date.
        $this->assertIsString($shift['start_time'], 'start_time was not a string');
        $this->assertMatchesRegularExpression('/^\d{2}:\d{2}(:\d{2})?$/', $shift['start_time']);
        $this->assertIsInt($shift['employees_count'] ?? null, 'withCount did not produce employees_count');
    }

    public function test_deleting_a_shift_unassigns_its_employees(): void
    {
        $shift = Shift::create([
            'name' => 'General', 'company_code' => 'nidhi-impex',
            'start_time' => '09:00', 'end_time' => '18:00',
        ]);

        $employee = User::create([
            'name' => 'Worker', 'email' => 'shift-worker@test.local', 'password' => 'x',
            'role' => 3, 'company_code' => 'nidhi-impex', 'emp_code' => 'S9',
            'shift_id' => $shift->id, 'status' => 0, 'is_deleted' => 0,
        ]);

        $this->actingAsAdmin()->deleteJson("/api/shifts/delete/{$shift->id}")->assertOk();

        // Employees are unassigned rather than the delete being blocked.
        $this->assertNull($employee->fresh()->shift_id);
    }
}
