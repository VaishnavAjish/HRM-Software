<?php

namespace Tests\Feature;

use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Behaviour of the shift master resource.
 *
 * This file also covered the branch and approval-level endpoints, pinning a
 * validation defect in BaseResourceController. Those routes, their controllers
 * and that base class were removed with the Access Control console, so the
 * tests went with them; shifts stayed because they belong to Attendance.
 *
 * What is pinned here is the exact JSON shape of a shift's time columns, which
 * the React client renders directly. Postgres returns `time` values as strings;
 * a port that hands back a Date would serialise as an ISO timestamp instead.
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
