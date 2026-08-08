<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\TicketSlaRule;
use App\Models\User;
use App\Support\HelpdeskSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class TicketSlaAndSettingsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $employee;

    private TicketCategory $category;

    protected function setUp(): void
    {
        parent::setUp();

        HelpdeskSettings::flush();

        $this->admin = $this->makeUser(['role' => 1, 'company_code' => 'nidhi-impex']);
        $this->employee = $this->makeUser([
            'role' => 3, 'company_code' => 'nidhi-impex', 'unit' => 'Shreeji', 'department' => 'Payroll',
        ]);

        $this->category = TicketCategory::create([
            'name' => 'Salary', 'slug' => 'salary-sla-test',
            'default_department' => 'Payroll', 'is_active' => true, 'sort_order' => 10,
        ]);
    }

    protected function tearDown(): void
    {
        HelpdeskSettings::flush();
        parent::tearDown();
    }

    private function makeUser(array $attributes): User
    {
        return User::create(array_merge([
            'name' => 'SLA Test User',
            'email' => uniqid('sla-', true).'@example.test',
            'password' => 'password',
            'emp_code' => strtoupper(substr(uniqid(), -8)),
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'status' => 0,
            'is_deleted' => 0,
        ], $attributes));
    }

    private function raiseTicket(string $priority = 'high'): Ticket
    {
        $this->withToken(auth('api')->login($this->employee))
            ->postJson('/api/tickets/store', [
                'category_id' => $this->category->id,
                'subject' => 'Salary not credited',
                'description' => 'July salary missing.',
                'priority' => $priority,
            ])->assertCreated();

        return Ticket::latest('id')->firstOrFail();
    }

    // ---------------------------------------------------------------
    // Department SLA rules
    // ---------------------------------------------------------------

    /** The whole point of the department dimension. */
    #[Test]
    public function a_department_override_beats_the_global_rule(): void
    {
        // Global 'high' seeds at 8 hours; Payroll gets 2.
        TicketSlaRule::create([
            'department' => 'Payroll', 'priority' => 'high',
            'response_hours' => 1, 'resolution_hours' => 2,
            'auto_escalate' => true, 'escalate_after_hours' => 1,
        ]);

        $ticket = $this->raiseTicket('high');

        $this->assertSame(2, (int) round($ticket->created_at->diffInHours($ticket->sla_due_at)));
    }

    #[Test]
    public function a_department_without_an_override_still_follows_the_global_rule(): void
    {
        TicketSlaRule::create([
            'department' => 'IT', 'priority' => 'high',
            'response_hours' => 1, 'resolution_hours' => 2,
            'auto_escalate' => false, 'escalate_after_hours' => 1,
        ]);

        // The employee is in Payroll, so the IT override must not apply.
        $ticket = $this->raiseTicket('high');

        $this->assertSame(8, (int) round($ticket->created_at->diffInHours($ticket->sla_due_at)));
    }

    #[Test]
    public function sla_rules_are_returned_grouped_with_the_departments_that_can_be_configured(): void
    {
        $this->raiseTicket();

        TicketSlaRule::create([
            'department' => 'Payroll', 'priority' => 'low',
            'response_hours' => 2, 'resolution_hours' => 6,
            'auto_escalate' => false, 'escalate_after_hours' => 3,
        ]);

        $data = $this->withToken(auth('api')->login($this->admin))
            ->getJson('/api/tickets/sla-rules')
            ->assertOk()
            ->json('data');

        $this->assertCount(4, $data['global']);
        $this->assertArrayHasKey('Payroll', $data['overrides']);
        $this->assertContains('Payroll', $data['departments']);
    }

    #[Test]
    public function saving_a_department_override_persists_it(): void
    {
        $this->withToken(auth('api')->login($this->admin))
            ->putJson('/api/tickets/sla-rules', [
                'rules' => [[
                    'department' => 'Payroll', 'priority' => 'urgent',
                    'response_hours' => 1, 'resolution_hours' => 2,
                    'auto_escalate' => true, 'escalate_after_hours' => 1,
                ]],
            ])->assertOk();

        $this->assertDatabaseHas('ticket_sla_rules', [
            'department' => 'Payroll', 'priority' => 'urgent', 'resolution_hours' => 2,
        ]);
        // The global rule for the same priority is untouched.
        $this->assertDatabaseHas('ticket_sla_rules', [
            'department' => '', 'priority' => 'urgent', 'resolution_hours' => 4,
        ]);
    }

    /** A typo that would otherwise be silently "corrected" and look saved. */
    #[Test]
    public function a_response_target_later_than_resolution_is_rejected(): void
    {
        $this->withToken(auth('api')->login($this->admin))
            ->putJson('/api/tickets/sla-rules', [
                'rules' => [[
                    'department' => '', 'priority' => 'high',
                    'response_hours' => 40, 'resolution_hours' => 8,
                    'auto_escalate' => false, 'escalate_after_hours' => 4,
                ]],
            ])->assertStatus(422);

        $this->assertDatabaseHas('ticket_sla_rules', ['department' => '', 'priority' => 'high', 'response_hours' => 2]);
    }

    #[Test]
    public function removing_an_override_falls_back_to_the_global_rules(): void
    {
        TicketSlaRule::create([
            'department' => 'Payroll', 'priority' => 'high',
            'response_hours' => 1, 'resolution_hours' => 2,
            'auto_escalate' => false, 'escalate_after_hours' => 1,
        ]);

        $this->withToken(auth('api')->login($this->admin))
            ->deleteJson('/api/tickets/sla-rules/Payroll')
            ->assertOk();

        $this->assertDatabaseMissing('ticket_sla_rules', ['department' => 'Payroll']);
        $this->assertSame(8, TicketSlaRule::resolve('high', 'Payroll')->resolution_hours);
    }

    /**
     * Every ticket falls back to the global set, so it must survive.
     *
     * An empty path segment cannot reach the route at all (that is a 405 on the
     * collection URL), so the case worth covering is a department name that
     * *trims* to empty — which the controller refuses explicitly.
     */
    #[Test]
    public function the_global_rules_cannot_be_deleted(): void
    {
        $this->withToken(auth('api')->login($this->admin))
            ->deleteJson('/api/tickets/sla-rules/'.rawurlencode('   '))
            ->assertStatus(422);

        $this->assertSame(4, TicketSlaRule::where('department', '')->count());
    }

    #[Test]
    public function deleting_an_override_that_does_not_exist_is_a_404(): void
    {
        $this->withToken(auth('api')->login($this->admin))
            ->deleteJson('/api/tickets/sla-rules/NoSuchDepartment')
            ->assertNotFound();
    }

    // ---------------------------------------------------------------
    // Helpdesk settings
    // ---------------------------------------------------------------

    #[Test]
    public function settings_return_defaults_before_anything_is_saved(): void
    {
        $settings = $this->withToken(auth('api')->login($this->admin))
            ->getJson('/api/tickets/settings')
            ->assertOk()
            ->json('data.settings');

        $this->assertSame('7', $settings['helpdesk.reopen_window_days']);
        $this->assertSame('0', $settings['helpdesk.auto_close_resolved_days']);
    }

    /** The reopen window is configuration now, not a constant. */
    #[Test]
    public function changing_the_reopen_window_changes_what_can_be_reopened(): void
    {
        $ticket = $this->raiseTicket();
        $ticket->forceFill([
            'status' => Ticket::STATUS_RESOLVED,
            'resolved_at' => now()->subDays(10),
        ])->save();

        // Default is 7 days, so ten days out is refused.
        $this->withToken(auth('api')->login($this->employee))
            ->postJson("/api/tickets/{$ticket->id}/reopen", ['reason' => 'Still broken'])
            ->assertStatus(422);

        Setting::updateOrCreate(
            ['key' => 'helpdesk.reopen_window_days'],
            ['value' => '30', 'group' => HelpdeskSettings::GROUP]
        );
        HelpdeskSettings::flush();

        $this->withToken(auth('api')->login($this->employee))
            ->postJson("/api/tickets/{$ticket->id}/reopen", ['reason' => 'Still broken'])
            ->assertOk();

        $this->assertSame(Ticket::STATUS_REOPENED, $ticket->fresh()->status);
    }

    #[Test]
    public function settings_can_be_saved_and_are_validated(): void
    {
        $this->withToken(auth('api')->login($this->admin))
            ->putJson('/api/tickets/settings', [
                'reopen_window_days' => 14,
                'auto_close_resolved_days' => 3,
                'default_priority' => 'high',
                'allow_manager_assignment' => false,
            ])->assertOk();

        $this->assertDatabaseHas('settings', ['key' => 'helpdesk.reopen_window_days', 'value' => '14']);

        $this->withToken(auth('api')->login($this->admin))
            ->putJson('/api/tickets/settings', [
                'reopen_window_days' => 0, // below the minimum
                'auto_close_resolved_days' => 3,
                'default_priority' => 'high',
                'allow_manager_assignment' => false,
            ])->assertStatus(422);
    }

    // ---------------------------------------------------------------
    // Categories
    // ---------------------------------------------------------------

    #[Test]
    public function a_category_can_be_created_updated_and_deleted_when_unused(): void
    {
        $created = $this->withToken(auth('api')->login($this->admin))
            ->postJson('/api/tickets/categories', [
                'name' => 'Travel Desk',
                'description' => 'Travel bookings',
                'default_department' => 'Administration',
            ])->assertCreated()->json('data');

        $this->assertSame('travel-desk', $created['slug']);

        $this->withToken(auth('api')->login($this->admin))
            ->putJson("/api/tickets/categories/{$created['id']}", ['name' => 'Travel & Visa'])
            ->assertOk();

        $this->assertDatabaseHas('ticket_categories', ['id' => $created['id'], 'name' => 'Travel & Visa']);

        $this->withToken(auth('api')->login($this->admin))
            ->deleteJson("/api/tickets/categories/{$created['id']}")
            ->assertOk();

        $this->assertDatabaseMissing('ticket_categories', ['id' => $created['id']]);
    }

    /** Deleting a used category would rewrite the history of its tickets. */
    #[Test]
    public function a_category_with_tickets_is_deactivated_rather_than_deleted(): void
    {
        $this->raiseTicket();

        $this->withToken(auth('api')->login($this->admin))
            ->deleteJson("/api/tickets/categories/{$this->category->id}")
            ->assertOk();

        $this->assertDatabaseHas('ticket_categories', [
            'id' => $this->category->id,
            'is_active' => false,
        ]);
        // The ticket keeps its category.
        $this->assertSame($this->category->id, Ticket::firstOrFail()->category_id);
    }

    #[Test]
    public function a_deactivated_category_disappears_from_the_raise_form(): void
    {
        $this->category->update(['is_active' => false]);

        $categories = $this->withToken(auth('api')->login($this->employee))
            ->getJson('/api/tickets/categories')
            ->assertOk()
            ->json('data');

        $this->assertNotContains($this->category->id, array_column($categories, 'id'));
    }

    #[Test]
    public function duplicate_category_names_get_distinct_slugs(): void
    {
        foreach (['Travel Desk', 'Travel Desk'] as $name) {
            $this->withToken(auth('api')->login($this->admin))
                ->postJson('/api/tickets/categories', ['name' => $name])
                ->assertCreated();
        }

        $this->assertDatabaseHas('ticket_categories', ['slug' => 'travel-desk']);
        $this->assertDatabaseHas('ticket_categories', ['slug' => 'travel-desk-2']);
    }

    #[Test]
    public function an_employee_cannot_manage_categories_or_settings(): void
    {
        $this->withToken(auth('api')->login($this->employee))
            ->postJson('/api/tickets/categories', ['name' => 'Sneaky'])
            ->assertForbidden();

        $this->withToken(auth('api')->login($this->employee))
            ->putJson('/api/tickets/settings', [
                'reopen_window_days' => 90,
                'auto_close_resolved_days' => 0,
                'default_priority' => 'low',
                'allow_manager_assignment' => true,
            ])->assertForbidden();
    }

    // ---------------------------------------------------------------
    // Auto escalation
    // ---------------------------------------------------------------

    /** The toggle that previously did nothing. */
    #[Test]
    public function the_sweep_escalates_a_ticket_left_past_its_escalation_window(): void
    {
        $ticket = $this->raiseTicket('high'); // global high: escalate after 4h
        $ticket->forceFill(['last_activity_at' => now()->subHours(9)])->save();

        $this->artisan('tickets:escalate-overdue')->assertSuccessful();

        $fresh = $ticket->fresh();
        $this->assertSame(Ticket::STATUS_ESCALATED, $fresh->status);
        $this->assertSame(1, $fresh->escalation_level);
        $this->assertDatabaseHas('ticket_activity_logs', [
            'ticket_id' => $ticket->id,
            'action' => 'ESCALATED',
            // Attributed to the scheduler, not a person.
            'performed_by' => null,
        ]);
    }

    #[Test]
    public function the_sweep_leaves_recently_active_tickets_alone(): void
    {
        $ticket = $this->raiseTicket('high');
        $ticket->forceFill(['last_activity_at' => now()->subMinutes(30)])->save();

        $this->artisan('tickets:escalate-overdue')->assertSuccessful();

        $this->assertSame(Ticket::STATUS_OPEN, $ticket->fresh()->status);
    }

    #[Test]
    public function the_sweep_ignores_priorities_with_auto_escalate_switched_off(): void
    {
        // 'low' seeds with auto_escalate false.
        $ticket = $this->raiseTicket('low');
        $ticket->forceFill(['last_activity_at' => now()->subDays(5)])->save();

        $this->artisan('tickets:escalate-overdue')->assertSuccessful();

        $this->assertSame(Ticket::STATUS_OPEN, $ticket->fresh()->status);
    }

    /** Running twice in the same window must not climb two levels. */
    #[Test]
    public function the_sweep_is_safe_to_run_repeatedly(): void
    {
        $ticket = $this->raiseTicket('high');
        $ticket->forceFill(['last_activity_at' => now()->subHours(9)])->save();

        $this->artisan('tickets:escalate-overdue')->assertSuccessful();
        $this->artisan('tickets:escalate-overdue')->assertSuccessful();

        $this->assertSame(1, $ticket->fresh()->escalation_level);
    }

    #[Test]
    public function a_department_override_governs_the_sweep_for_that_department(): void
    {
        TicketSlaRule::create([
            'department' => 'Payroll', 'priority' => 'high',
            'response_hours' => 1, 'resolution_hours' => 2,
            'auto_escalate' => false, 'escalate_after_hours' => 1,
        ]);

        // Payroll says do not auto-escalate, so the global rule must not apply.
        $ticket = $this->raiseTicket('high');
        $ticket->forceFill(['last_activity_at' => now()->subHours(9)])->save();

        $this->artisan('tickets:escalate-overdue')->assertSuccessful();

        $this->assertSame(Ticket::STATUS_OPEN, $ticket->fresh()->status);
    }

    #[Test]
    public function auto_close_is_off_by_default_and_works_when_enabled(): void
    {
        $ticket = $this->raiseTicket();
        $ticket->forceFill([
            'status' => Ticket::STATUS_RESOLVED,
            'resolved_at' => now()->subDays(5),
            'last_activity_at' => now()->subDays(5),
        ])->save();

        $this->artisan('tickets:escalate-overdue')->assertSuccessful();
        $this->assertSame(Ticket::STATUS_RESOLVED, $ticket->fresh()->status);

        Setting::updateOrCreate(
            ['key' => 'helpdesk.auto_close_resolved_days'],
            ['value' => '3', 'group' => HelpdeskSettings::GROUP]
        );
        HelpdeskSettings::flush();

        $this->artisan('tickets:escalate-overdue')->assertSuccessful();
        $this->assertSame(Ticket::STATUS_CLOSED, $ticket->fresh()->status);
    }

    #[Test]
    public function a_dry_run_reports_without_changing_anything(): void
    {
        $ticket = $this->raiseTicket('high');
        $ticket->forceFill(['last_activity_at' => now()->subHours(9)])->save();

        $this->artisan('tickets:escalate-overdue --dry-run')->assertSuccessful();

        $this->assertSame(Ticket::STATUS_OPEN, $ticket->fresh()->status);
    }
}
