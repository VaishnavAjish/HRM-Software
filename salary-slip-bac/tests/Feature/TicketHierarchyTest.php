<?php

namespace Tests\Feature;

use App\Models\ReportingRelationship;
use App\Models\Setting;
use App\Models\Ticket;
use App\Models\TicketAssignmentHistory;
use App\Models\TicketCategory;
use App\Models\TicketEscalationHistory;
use App\Models\TicketSlaRule;
use App\Models\User;
use App\Services\Tickets\ReportingHierarchy;
use App\Services\Tickets\TicketRouter;
use App\Support\HelpdeskSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The reporting chain, ticket routing, and the escalation walk.
 *
 * These cover the rules that are easy to get subtly wrong and impossible to
 * notice in the UI: that the chain always terminates at a Super Admin, that a
 * ticket escalates through the chain frozen at creation rather than today's,
 * and that the employee's own replies do not reset the assignee's clock.
 */
class TicketHierarchyTest extends TestCase
{
    use RefreshDatabase;

    private TicketCategory $category;

    protected function setUp(): void
    {
        parent::setUp();

        $this->category = TicketCategory::create([
            'name' => 'IT Support', 'slug' => 'it-hierarchy-test',
            'default_department' => 'IT', 'is_active' => true, 'sort_order' => 10,
        ]);
    }

    private function makeUser(array $attributes = []): User
    {
        return User::create(array_merge([
            'name' => 'Hierarchy Test User',
            'email' => uniqid('hier-', true).'@example.test',
            'password' => 'password',
            'emp_code' => strtoupper(substr(uniqid(), -8)),
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'department' => 'IT',
            'status' => 0,
            'is_deleted' => 0,
        ], $attributes));
    }

    private function reportsTo(User $employee, User $manager): ReportingRelationship
    {
        return ReportingRelationship::create([
            'employee_user_id' => $employee->id,
            'manager_user_id' => $manager->id,
            'relationship_type' => ReportingRelationship::TYPE_PRIMARY,
            'status' => ReportingRelationship::STATUS_ACTIVE,
            'effective_from' => now()->subMonth(),
        ]);
    }

    private function hierarchy(): ReportingHierarchy
    {
        return app(ReportingHierarchy::class);
    }

    private function raiseTicket(User $employee): Ticket
    {
        $this->withToken(auth('api')->login($employee))
            ->postJson('/api/tickets/store', [
                'category_id' => $this->category->id,
                'subject' => 'Laptop will not boot',
                'description' => 'It powers on and then shuts down after a few seconds.',
                'priority' => 'high',
            ])->assertCreated();

        return Ticket::latest('id')->firstOrFail();
    }

    // -----------------------------------------------------------------
    // Chain resolution
    // -----------------------------------------------------------------

    #[Test]
    public function the_chain_walks_upward_and_terminates_at_a_super_admin(): void
    {
        $superAdmin = $this->makeUser(['role' => 0, 'name' => 'Super Admin']);
        $head = $this->makeUser(['role' => 1, 'name' => 'Department Head']);
        $manager = $this->makeUser(['role' => 2, 'name' => 'Manager']);
        $employee = $this->makeUser(['role' => 3, 'name' => 'Employee']);

        $this->reportsTo($employee, $manager);
        $this->reportsTo($manager, $head);
        $this->reportsTo($head, $superAdmin);

        $chain = array_map(fn (User $u) => $u->name, $this->hierarchy()->chainFor($employee));

        $this->assertSame(['Manager', 'Department Head', 'Super Admin'], $chain);
    }

    #[Test]
    public function a_super_admin_is_appended_when_the_configured_line_stops_short(): void
    {
        $superAdmin = $this->makeUser(['role' => 0, 'name' => 'Super Admin']);
        $manager = $this->makeUser(['role' => 2, 'name' => 'Manager']);
        $employee = $this->makeUser(['role' => 3]);

        $this->reportsTo($employee, $manager);

        $chain = $this->hierarchy()->chainFor($employee);

        // Two links even though only one was configured: escalation must never
        // reach a dead end.
        $this->assertCount(2, $chain);
        $this->assertSame($superAdmin->id, $chain[1]->id);
    }

    #[Test]
    public function a_departed_manager_is_skipped_rather_than_ending_the_chain(): void
    {
        $superAdmin = $this->makeUser(['role' => 0]);
        $employee = $this->makeUser(['role' => 3]);
        $manager = $this->makeUser(['role' => 2, 'is_deleted' => 1]);

        $this->reportsTo($employee, $manager);

        $chain = $this->hierarchy()->chainFor($employee);

        $this->assertCount(1, $chain);
        $this->assertSame($superAdmin->id, $chain[0]->id);
    }

    #[Test]
    public function a_pre_existing_cycle_does_not_hang_the_walk(): void
    {
        $this->makeUser(['role' => 0]);
        $a = $this->makeUser(['role' => 2]);
        $b = $this->makeUser(['role' => 2]);

        // Written directly, bypassing validateAssignment, the way a bad import
        // or a manual database edit would.
        $this->reportsTo($a, $b);
        $this->reportsTo($b, $a);

        $chain = $this->hierarchy()->chainFor($a);

        $this->assertLessThanOrEqual(ReportingHierarchy::MAX_DEPTH, count($chain));
        $this->assertNotEmpty($chain);
    }

    // -----------------------------------------------------------------
    // Assignment guards
    // -----------------------------------------------------------------

    #[Test]
    public function an_employee_cannot_report_to_themselves(): void
    {
        $user = $this->makeUser(['role' => 2]);

        $this->assertStringContainsString(
            'cannot report to themselves',
            (string) $this->hierarchy()->validateAssignment($user, $user)
        );
    }

    #[Test]
    public function an_inactive_manager_is_rejected(): void
    {
        $employee = $this->makeUser();
        $manager = $this->makeUser(['role' => 2, 'is_deleted' => 1]);

        $this->assertStringContainsString(
            'inactive',
            (string) $this->hierarchy()->validateAssignment($employee, $manager)
        );
    }

    #[Test]
    public function a_manager_from_another_company_is_rejected(): void
    {
        $employee = $this->makeUser(['company_code' => 'nidhi-impex']);
        $manager = $this->makeUser(['role' => 2, 'company_code' => 'acme']);

        $this->assertStringContainsString(
            'same company',
            (string) $this->hierarchy()->validateAssignment($employee, $manager)
        );
    }

    #[Test]
    public function a_multi_company_manager_is_accepted_for_either_company(): void
    {
        $employee = $this->makeUser(['company_code' => 'silver-star']);
        $manager = $this->makeUser(['role' => 1, 'company_code' => 'nidhi-impex,silver-star']);

        $this->assertNull($this->hierarchy()->validateAssignment($employee, $manager));
    }

    #[Test]
    public function a_circular_reporting_line_is_rejected(): void
    {
        $top = $this->makeUser(['role' => 1]);
        $middle = $this->makeUser(['role' => 2]);
        $bottom = $this->makeUser(['role' => 2]);

        $this->reportsTo($bottom, $middle);
        $this->reportsTo($middle, $top);

        // top already sits above bottom, so making top report to bottom closes
        // the loop.
        $this->assertStringContainsString(
            'circular',
            (string) $this->hierarchy()->validateAssignment($top, $bottom)
        );
    }

    // -----------------------------------------------------------------
    // Routing
    // -----------------------------------------------------------------

    #[Test]
    public function a_new_ticket_is_routed_to_the_direct_manager(): void
    {
        $this->makeUser(['role' => 0]);
        $manager = $this->makeUser(['role' => 2]);
        $employee = $this->makeUser(['role' => 3]);
        $this->reportsTo($employee, $manager);

        $ticket = $this->raiseTicket($employee);

        $this->assertSame($manager->id, $ticket->assigned_to);
        $this->assertSame(Ticket::STATUS_ASSIGNED, $ticket->status);
        $this->assertSame(0, (int) $ticket->escalation_level);
        $this->assertDatabaseHas('ticket_assignment_history', [
            'ticket_id' => $ticket->id,
            'to_user_id' => $manager->id,
            'method' => TicketAssignmentHistory::METHOD_ROUTING,
        ]);
    }

    #[Test]
    public function an_employee_with_no_manager_is_routed_to_the_final_authority(): void
    {
        $superAdmin = $this->makeUser(['role' => 0]);
        $employee = $this->makeUser(['role' => 3]);

        $ticket = $this->raiseTicket($employee);

        $this->assertSame($superAdmin->id, $ticket->assigned_to);
    }

    #[Test]
    public function the_snapshot_is_frozen_at_creation_and_not_rewritten_later(): void
    {
        $this->makeUser(['role' => 0]);
        $manager = $this->makeUser(['role' => 2, 'name' => 'Original Manager']);
        $employee = $this->makeUser(['role' => 3]);
        $relationship = $this->reportsTo($employee, $manager);

        $ticket = $this->raiseTicket($employee);
        $before = $ticket->hierarchy_snapshot;

        // The employee moves under someone else entirely.
        $relationship->update(['status' => ReportingRelationship::STATUS_ENDED, 'effective_to' => now()]);
        $newManager = $this->makeUser(['role' => 2, 'name' => 'New Manager']);
        $this->reportsTo($employee, $newManager);

        $this->assertSame($before, $ticket->fresh()->hierarchy_snapshot);
        $this->assertSame('Original Manager', $ticket->fresh()->hierarchy_snapshot[0]['name']);
    }

    // -----------------------------------------------------------------
    // Escalation
    // -----------------------------------------------------------------

    #[Test]
    public function escalation_reassigns_up_the_chain_and_preserves_the_previous_holder(): void
    {
        $superAdmin = $this->makeUser(['role' => 0]);
        $head = $this->makeUser(['role' => 1]);
        $manager = $this->makeUser(['role' => 2]);
        $employee = $this->makeUser(['role' => 3]);
        $this->reportsTo($employee, $manager);
        $this->reportsTo($manager, $head);
        $this->reportsTo($head, $superAdmin);

        $ticket = $this->raiseTicket($employee);

        $next = app(TicketRouter::class)->escalate($ticket, TicketEscalationHistory::TRIGGER_INACTIVITY);
        $ticket->refresh();

        $this->assertSame($head->id, $next?->id);
        $this->assertSame($head->id, $ticket->assigned_to);
        $this->assertSame($manager->id, $ticket->previous_assigned_to);
        $this->assertSame(1, (int) $ticket->escalation_level);
        $this->assertSame(Ticket::STATUS_ESCALATED, $ticket->status);
        $this->assertDatabaseHas('ticket_escalation_history', [
            'ticket_id' => $ticket->id,
            'from_level' => 0,
            'to_level' => 1,
            'from_user_id' => $manager->id,
            'to_user_id' => $head->id,
            'trigger' => TicketEscalationHistory::TRIGGER_INACTIVITY,
        ]);
    }

    #[Test]
    public function escalation_stops_at_the_super_admin(): void
    {
        $superAdmin = $this->makeUser(['role' => 0]);
        $manager = $this->makeUser(['role' => 2]);
        $employee = $this->makeUser(['role' => 3]);
        $this->reportsTo($employee, $manager);

        $ticket = $this->raiseTicket($employee);
        $router = app(TicketRouter::class);

        $this->assertSame($superAdmin->id, $router->escalate($ticket)?->id);

        $ticket->refresh();

        $this->assertTrue($router->isAtFinalAuthority($ticket));
        $this->assertNull($router->escalate($ticket));
        // No further movement: the Super Admin keeps it.
        $this->assertSame($superAdmin->id, $ticket->fresh()->assigned_to);
        $this->assertSame(1, (int) $ticket->fresh()->escalation_level);
    }

    #[Test]
    public function escalation_uses_the_snapshot_even_after_the_hierarchy_changes(): void
    {
        $superAdmin = $this->makeUser(['role' => 0]);
        $head = $this->makeUser(['role' => 1, 'name' => 'Head At Creation']);
        $manager = $this->makeUser(['role' => 2]);
        $employee = $this->makeUser(['role' => 3]);
        $this->reportsTo($employee, $manager);
        $managerLine = $this->reportsTo($manager, $head);
        $this->reportsTo($head, $superAdmin);

        $ticket = $this->raiseTicket($employee);

        // The manager is moved under somebody new after the ticket was raised.
        $managerLine->update(['status' => ReportingRelationship::STATUS_ENDED, 'effective_to' => now()]);
        $this->reportsTo($manager, $this->makeUser(['role' => 1, 'name' => 'Head Today']));

        $next = app(TicketRouter::class)->escalate($ticket);

        $this->assertSame('Head At Creation', $next?->name);
    }

    // -----------------------------------------------------------------
    // The scheduled sweep
    // -----------------------------------------------------------------

    private function autoEscalateAfter(int $hours): void
    {
        TicketSlaRule::updateOrCreate(
            ['priority' => 'high', 'department' => TicketSlaRule::GLOBAL_DEPARTMENT],
            [
                'response_minutes' => 60,
                'resolution_minutes' => 480,
                'auto_escalate' => true,
                'escalate_after_hours' => $hours,
            ]
        );
    }

    #[Test]
    public function the_sweep_escalates_a_ticket_the_authority_never_touched(): void
    {
        $this->makeUser(['role' => 0]);
        $head = $this->makeUser(['role' => 1]);
        $manager = $this->makeUser(['role' => 2]);
        $employee = $this->makeUser(['role' => 3]);
        $this->reportsTo($employee, $manager);
        $this->reportsTo($manager, $head);

        $ticket = $this->raiseTicket($employee);
        $ticket->forceFill(['created_at' => now()->subHours(10)])->save();

        $this->autoEscalateAfter(4);

        $this->artisan('tickets:escalate-overdue')->assertSuccessful();

        $this->assertSame($head->id, $ticket->fresh()->assigned_to);
    }

    #[Test]
    public function an_employee_reply_alone_does_not_reset_the_authority_clock(): void
    {
        $this->makeUser(['role' => 0]);
        $head = $this->makeUser(['role' => 1]);
        $manager = $this->makeUser(['role' => 2]);
        $employee = $this->makeUser(['role' => 3]);
        $this->reportsTo($employee, $manager);
        $this->reportsTo($manager, $head);

        $ticket = $this->raiseTicket($employee);
        $ticket->forceFill(['created_at' => now()->subHours(10)])->save();

        // The employee chases it. This moves last_activity_at but must not
        // count as the assignee attending to it.
        $this->withToken(auth('api')->login($employee))
            ->postJson("/api/tickets/{$ticket->id}/reply", ['message' => 'Any update on this please?'])
            ->assertSuccessful();

        $this->autoEscalateAfter(4);

        $this->artisan('tickets:escalate-overdue')->assertSuccessful();

        $this->assertSame($head->id, $ticket->fresh()->assigned_to);
    }

    #[Test]
    public function a_staff_reply_pauses_escalation(): void
    {
        $this->makeUser(['role' => 0]);
        $head = $this->makeUser(['role' => 1]);
        $manager = $this->makeUser(['role' => 2]);
        $employee = $this->makeUser(['role' => 3]);
        $this->reportsTo($employee, $manager);
        $this->reportsTo($manager, $head);

        $ticket = $this->raiseTicket($employee);
        $ticket->forceFill(['created_at' => now()->subHours(10)])->save();

        $this->withToken(auth('api')->login($manager))
            ->postJson("/api/tickets/{$ticket->id}/reply", ['message' => 'Looking into this now.'])
            ->assertSuccessful();

        $this->autoEscalateAfter(4);

        $this->artisan('tickets:escalate-overdue')->assertSuccessful();

        $this->assertSame($manager->id, $ticket->fresh()->assigned_to);
        $this->assertSame(0, (int) $ticket->fresh()->escalation_level);
    }

    #[Test]
    public function waiting_on_the_employee_pauses_escalation(): void
    {
        $this->makeUser(['role' => 0]);
        $head = $this->makeUser(['role' => 1]);
        $manager = $this->makeUser(['role' => 2]);
        $employee = $this->makeUser(['role' => 3]);
        $this->reportsTo($employee, $manager);
        $this->reportsTo($manager, $head);

        $ticket = $this->raiseTicket($employee);
        $ticket->forceFill([
            'created_at' => now()->subHours(10),
            'status' => Ticket::STATUS_WAITING_EMPLOYEE,
        ])->save();

        $this->autoEscalateAfter(4);

        $this->artisan('tickets:escalate-overdue')->assertSuccessful();

        $this->assertSame($manager->id, $ticket->fresh()->assigned_to);
    }

    #[Test]
    public function which_actions_pause_escalation_is_configurable(): void
    {
        $this->makeUser(['role' => 0]);
        $head = $this->makeUser(['role' => 1]);
        $manager = $this->makeUser(['role' => 2]);
        $employee = $this->makeUser(['role' => 3]);
        $this->reportsTo($employee, $manager);
        $this->reportsTo($manager, $head);

        // A site that does not consider "somebody typed a reply" as attending.
        Setting::updateOrCreate(
            ['key' => 'helpdesk.escalation_pausing_actions'],
            ['value' => 'assign,resolve', 'group' => HelpdeskSettings::GROUP]
        );
        HelpdeskSettings::flush();

        $ticket = $this->raiseTicket($employee);
        $ticket->forceFill(['created_at' => now()->subHours(10)])->save();

        $this->withToken(auth('api')->login($manager))
            ->postJson("/api/tickets/{$ticket->id}/reply", ['message' => 'Noted.'])
            ->assertSuccessful();

        $this->autoEscalateAfter(4);

        $this->artisan('tickets:escalate-overdue')->assertSuccessful();

        $this->assertSame($head->id, $ticket->fresh()->assigned_to);
    }

    // -----------------------------------------------------------------
    // Admin API
    // -----------------------------------------------------------------

    #[Test]
    public function an_admin_can_set_and_clear_a_reporting_manager(): void
    {
        $admin = $this->makeUser(['role' => 0]);
        $manager = $this->makeUser(['role' => 2]);
        $employee = $this->makeUser(['role' => 3]);

        $this->withToken(auth('api')->login($admin))
            ->putJson("/api/reporting-hierarchy/{$employee->id}", ['manager_user_id' => $manager->id])
            ->assertSuccessful()
            ->assertJsonPath('data.manager.id', $manager->id);

        $this->assertSame($manager->id, $this->hierarchy()->managerFor($employee->fresh())?->id);

        $this->withToken(auth('api')->login($admin))
            ->deleteJson("/api/reporting-hierarchy/{$employee->id}")
            ->assertSuccessful();

        $this->assertNull($this->hierarchy()->managerFor($employee->fresh()));
    }

    #[Test]
    public function replacing_a_manager_closes_the_previous_line_instead_of_deleting_it(): void
    {
        $admin = $this->makeUser(['role' => 0]);
        $first = $this->makeUser(['role' => 2]);
        $second = $this->makeUser(['role' => 2]);
        $employee = $this->makeUser(['role' => 3]);

        foreach ([$first, $second] as $manager) {
            $this->withToken(auth('api')->login($admin))
                ->putJson("/api/reporting-hierarchy/{$employee->id}", ['manager_user_id' => $manager->id])
                ->assertSuccessful();
        }

        // Both lines survive; only one is active.
        $this->assertSame(2, ReportingRelationship::where('employee_user_id', $employee->id)->count());
        $this->assertSame(1, ReportingRelationship::where('employee_user_id', $employee->id)
            ->where('status', ReportingRelationship::STATUS_ACTIVE)->count());
        $this->assertSame($second->id, $this->hierarchy()->managerFor($employee->fresh())?->id);
    }

    #[Test]
    public function the_admin_api_refuses_an_assignment_the_guards_reject(): void
    {
        $admin = $this->makeUser(['role' => 0]);
        $employee = $this->makeUser(['role' => 3, 'company_code' => 'nidhi-impex']);
        $foreign = $this->makeUser(['role' => 2, 'company_code' => 'acme']);

        $this->withToken(auth('api')->login($admin))
            ->putJson("/api/reporting-hierarchy/{$employee->id}", ['manager_user_id' => $foreign->id])
            ->assertStatus(422);

        $this->withToken(auth('api')->login($admin))
            ->putJson("/api/reporting-hierarchy/{$employee->id}", ['manager_user_id' => $employee->id])
            ->assertStatus(422);
    }

    /**
     * Not just the Super Admin: a plain admin holds support.ticket.assign, and
     * the route gate has to actually let them through. A role-0 caller can pass
     * a permission check by bypass rather than by grant, so testing only that
     * would prove nothing about the permission wiring.
     */
    #[Test]
    public function an_ordinary_admin_can_manage_reporting_lines(): void
    {
        $admin = $this->makeUser(['role' => 1]);
        $manager = $this->makeUser(['role' => 2]);
        $employee = $this->makeUser(['role' => 3]);

        $this->withToken(auth('api')->login($admin))
            ->getJson('/api/reporting-hierarchy/get')
            ->assertSuccessful();

        $this->withToken(auth('api')->login($admin))
            ->getJson("/api/reporting-hierarchy/{$employee->id}/candidates")
            ->assertSuccessful();

        $this->withToken(auth('api')->login($admin))
            ->putJson("/api/reporting-hierarchy/{$employee->id}", ['manager_user_id' => $manager->id])
            ->assertSuccessful();
    }

    /**
     * An admin scoped to one company must not be able to redirect another
     * company's tickets by editing its reporting lines.
     */
    #[Test]
    public function an_admin_cannot_edit_a_reporting_line_outside_their_companies(): void
    {
        $admin = $this->makeUser(['role' => 1, 'company_code' => 'nidhi-impex']);
        $outsider = $this->makeUser(['role' => 3, 'company_code' => 'acme']);
        $manager = $this->makeUser(['role' => 2, 'company_code' => 'acme']);

        $this->withToken(auth('api')->login($admin))
            ->putJson("/api/reporting-hierarchy/{$outsider->id}", ['manager_user_id' => $manager->id])
            ->assertNotFound();
    }

    #[Test]
    public function an_employee_cannot_reach_the_hierarchy_api(): void
    {
        $employee = $this->makeUser(['role' => 3]);
        $manager = $this->makeUser(['role' => 2]);

        $this->withToken(auth('api')->login($employee))
            ->putJson("/api/reporting-hierarchy/{$employee->id}", ['manager_user_id' => $manager->id])
            ->assertForbidden();
    }
}
