<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * DOMAIN 02.10 — Calendars and Calendar Assignments.
 *
 * Calendars are company-scoped master data; an assignment attaches a calendar
 * to a scope (department -> location -> company -> enterprise -> country).
 * The resolve endpoint answers "which calendar applies here?" — the guard that
 * matters is that an employee somewhere in the tree shares the calendar of
 * their owner, not a stranger's.
 */
class OrganizationCalendarAssignmentApiTest extends TestCase
{
    use RefreshDatabase;

    private User $root;

    protected function setUp(): void
    {
        parent::setUp();

        $this->root = User::create([
            'name' => 'Root', 'email' => 'root@calendar.test', 'password' => 'secret1234',
            'emp_code' => 'CAL-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
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

    private function calendarId(Company $company, string $name = 'General Working Days'): int
    {
        return $this->asRoot()->postJson('/api/v1/admin/organization/calendars', [
            'companyId' => $company->id, 'name' => $name,
        ])->assertCreated()->assertJsonPath('success', true)->json('data.id');
    }

    #[Test]
    public function a_calendar_hangs_under_its_company(): void
    {
        $company = $this->company();
        $id = $this->calendarId($company);

        $this->assertDatabaseHas('calendars', ['id' => $id, 'company_id' => $company->id]);

        $this->asRoot()->getJson('/api/v1/admin/organization/calendars')
            ->assertOk()->assertJsonPath('data.0.id', $id);
    }

    #[Test]
    public function a_calendar_assignment_attaches_a_calendar_to_a_company_scope(): void
    {
        $company = $this->company();
        $calendarId = $this->calendarId($company);

        $assignment = $this->asRoot()->postJson('/api/v1/admin/organization/calendar-assignments', [
            'calendarId' => $calendarId,
            'scopeType' => 'company',
            'scopeId' => $company->id,
            'calendarKind' => 'working_day',
            'priority' => 10,
        ])->assertCreated()->json('data');

        $this->assertDatabaseHas('organization_calendar_assignments', [
            'id' => $assignment['id'],
            'calendar_id' => $calendarId,
            'scope_type' => 'company',
            'scope_id' => $company->id,
        ]);

        $this->asRoot()->getJson('/api/v1/admin/organization/calendar-assignments')
            ->assertOk()->assertJsonPath('data.0.id', $assignment['id']);
    }

    #[Test]
    public function a_company_scope_resolve_returns_the_assigned_calendar(): void
    {
        $company = $this->company();
        $calendarId = $this->calendarId($company);

        $this->asRoot()->postJson('/api/v1/admin/organization/calendar-assignments', [
            'calendarId' => $calendarId,
            'scopeType' => 'company',
            'scopeId' => $company->id,
            'calendarKind' => 'working_day',
            'effectiveFrom' => '2026-01-01',
        ])->assertCreated();

        $this->asRoot()->getJson("/api/v1/admin/organization/calendar-assignments/resolve?companyId={$company->id}&calendarKind=working_day")
            ->assertOk()
            ->assertJsonPath('data.resolvedCalendar.calendarId', $calendarId)
            ->assertJsonPath('data.resolvedCalendar.scopeType', 'company');
    }

    #[Test]
    public function a_resolve_with_no_scope_returns_no_calendar(): void
    {
        $this->company();

        $this->asRoot()->getJson('/api/v1/admin/organization/calendar-assignments/resolve?calendarKind=working_day')
            ->assertOk()
            ->assertJsonPath('data.resolvedCalendar', null);
    }

    #[Test]
    public function a_missing_calendar_returns_404(): void
    {
        $this->asRoot()->deleteJson('/api/v1/admin/organization/calendars/999999')
            ->assertNotFound()->assertJsonPath('error.code', 'NOT_FOUND');
    }
}