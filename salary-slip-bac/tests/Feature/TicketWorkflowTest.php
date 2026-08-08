<?php

namespace Tests\Feature;

use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\User;
use App\Support\TicketNumber;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class TicketWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;

    private User $admin;

    private User $otherCompanyAdmin;

    private TicketCategory $category;

    protected function setUp(): void
    {
        parent::setUp();

        $this->employee = $this->makeUser(['role' => 3, 'company_code' => 'nidhi-impex', 'unit' => 'Shreeji', 'department' => 'IT']);
        $this->admin = $this->makeUser(['role' => 1, 'company_code' => 'nidhi-impex,silver-star']);
        $this->otherCompanyAdmin = $this->makeUser(['role' => 1, 'company_code' => 'acme']);

        $this->category = TicketCategory::create([
            'name' => 'IT Support', 'slug' => 'it-support-test',
            'default_department' => 'IT', 'is_active' => true, 'sort_order' => 10,
        ]);
    }

    private function makeUser(array $attributes): User
    {
        return User::create(array_merge([
            'name' => 'Ticket Test User',
            'email' => uniqid('ticket-', true).'@example.test',
            'password' => 'password',
            'emp_code' => strtoupper(substr(uniqid(), -8)),
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'status' => 0,
            'is_deleted' => 0,
        ], $attributes));
    }

    private function raiseTicket(?User $as = null): array
    {
        $actor = $as ?: $this->employee;

        return $this->withToken(auth('api')->login($actor))
            ->postJson('/api/tickets/store', [
                'category_id' => $this->category->id,
                'subject' => 'Laptop will not boot',
                'description' => 'It powers on and then shuts down after a few seconds.',
                'priority' => 'high',
            ])->json();
    }

    #[Test]
    public function an_employee_can_raise_a_ticket_and_gets_a_formatted_number(): void
    {
        $response = $this->withToken(auth('api')->login($this->employee))
            ->postJson('/api/tickets/store', [
                'category_id' => $this->category->id,
                'subject' => 'Laptop will not boot',
                'description' => 'It powers on and then shuts down.',
                'priority' => 'high',
            ]);

        $response->assertCreated()->assertJsonPath('status', true);

        $ticket = Ticket::firstOrFail();

        $this->assertMatchesRegularExpression('/^TKT-\d{4}-\d{6}$/', $ticket->ticket_number);
        $this->assertSame(Ticket::STATUS_OPEN, $ticket->status);
        // Tenancy is taken from the signed-in employee, never the payload.
        $this->assertSame('nidhi-impex', $ticket->company_code);
        $this->assertSame('Shreeji', $ticket->unit);
        $this->assertDatabaseHas('ticket_activity_logs', ['ticket_id' => $ticket->id, 'action' => 'CREATED']);
    }

    #[Test]
    public function ticket_numbers_are_unique_under_repeated_allocation(): void
    {
        $numbers = [];
        for ($i = 0; $i < 25; $i++) {
            $numbers[] = DB::transaction(fn () => TicketNumber::next(2026));
        }

        $this->assertCount(25, array_unique($numbers));
        $this->assertSame('TKT-2026-000001', $numbers[0]);
        $this->assertSame('TKT-2026-000025', $numbers[24]);
    }

    #[Test]
    public function an_employee_sees_only_their_own_tickets(): void
    {
        $this->raiseTicket();

        $stranger = $this->makeUser(['role' => 3, 'company_code' => 'nidhi-impex']);
        $this->raiseTicket($stranger);

        $response = $this->withToken(auth('api')->login($this->employee))
            ->getJson('/api/tickets/get');

        $response->assertOk();
        $this->assertCount(1, $response->json('data.data'));
    }

    #[Test]
    public function an_employee_cannot_open_someone_elses_ticket(): void
    {
        $stranger = $this->makeUser(['role' => 3, 'company_code' => 'nidhi-impex']);
        $this->raiseTicket($stranger);
        $ticket = Ticket::firstOrFail();

        $this->withToken(auth('api')->login($this->employee))
            ->getJson("/api/tickets/show/{$ticket->id}")
            ->assertNotFound();
    }

    /**
     * The multi-company case that broke elsewhere in this app: an admin whose
     * company_code is a comma list must see both companies, not zero.
     */
    #[Test]
    public function a_multi_company_admin_sees_tickets_from_every_company_they_hold(): void
    {
        $this->raiseTicket();

        $silverEmployee = $this->makeUser(['role' => 3, 'company_code' => 'silver-star', 'unit' => 'Daduk']);
        $this->raiseTicket($silverEmployee);

        $response = $this->withToken(auth('api')->login($this->admin))
            ->getJson('/api/tickets/get');

        $response->assertOk();
        $this->assertCount(2, $response->json('data.data'));
    }

    #[Test]
    public function an_admin_from_another_company_sees_nothing(): void
    {
        $this->raiseTicket();

        $response = $this->withToken(auth('api')->login($this->otherCompanyAdmin))
            ->getJson('/api/tickets/get');

        $response->assertOk();
        $this->assertCount(0, $response->json('data.data'));
    }

    #[Test]
    public function assigning_moves_an_open_ticket_to_assigned(): void
    {
        $this->raiseTicket();
        $ticket = Ticket::firstOrFail();

        $this->withToken(auth('api')->login($this->admin))
            ->putJson("/api/tickets/{$ticket->id}/assign", ['assigned_to' => $this->admin->id])
            ->assertOk();

        $ticket->refresh();
        $this->assertSame(Ticket::STATUS_ASSIGNED, $ticket->status);
        $this->assertSame($this->admin->id, $ticket->assigned_to);
    }

    #[Test]
    public function a_ticket_cannot_be_assigned_to_an_employee_account(): void
    {
        $this->raiseTicket();
        $ticket = Ticket::firstOrFail();

        $this->withToken(auth('api')->login($this->admin))
            ->putJson("/api/tickets/{$ticket->id}/assign", ['assigned_to' => $this->employee->id])
            ->assertStatus(422);
    }

    #[Test]
    public function an_out_of_order_status_change_is_rejected(): void
    {
        $this->raiseTicket();
        $ticket = Ticket::firstOrFail();

        // open -> closed skips the work entirely.
        $this->withToken(auth('api')->login($this->admin))
            ->putJson("/api/tickets/{$ticket->id}/status", ['status' => Ticket::STATUS_CLOSED])
            ->assertStatus(422);

        $this->assertSame(Ticket::STATUS_OPEN, $ticket->fresh()->status);
    }

    #[Test]
    public function a_closed_ticket_is_read_only(): void
    {
        $this->raiseTicket();
        $ticket = Ticket::firstOrFail();
        $ticket->forceFill(['status' => Ticket::STATUS_CLOSED, 'closed_at' => now()])->save();

        $this->withToken(auth('api')->login($this->employee))
            ->postJson("/api/tickets/{$ticket->id}/reply", ['message' => 'One more thing'])
            ->assertStatus(422);

        $this->withToken(auth('api')->login($this->admin))
            ->putJson("/api/tickets/{$ticket->id}/status", ['status' => Ticket::STATUS_IN_PROGRESS])
            ->assertStatus(422);
    }

    #[Test]
    public function an_employee_can_reopen_a_resolved_ticket_inside_the_window(): void
    {
        $this->raiseTicket();
        $ticket = Ticket::firstOrFail();
        $ticket->forceFill(['status' => Ticket::STATUS_RESOLVED, 'resolved_at' => now()->subDay()])->save();

        $this->withToken(auth('api')->login($this->employee))
            ->postJson("/api/tickets/{$ticket->id}/reopen", ['reason' => 'The problem came back.'])
            ->assertOk();

        $this->assertSame(Ticket::STATUS_REOPENED, $ticket->fresh()->status);
        // The reason joins the conversation, not just the audit trail.
        $this->assertDatabaseHas('ticket_messages', ['ticket_id' => $ticket->id, 'message' => 'The problem came back.']);
    }

    #[Test]
    public function reopening_is_refused_once_the_window_has_passed(): void
    {
        $this->raiseTicket();
        $ticket = Ticket::firstOrFail();
        $ticket->forceFill([
            'status' => Ticket::STATUS_RESOLVED,
            'resolved_at' => now()->subDays(Ticket::REOPEN_WINDOW_DAYS + 3),
        ])->save();

        $this->withToken(auth('api')->login($this->employee))
            ->postJson("/api/tickets/{$ticket->id}/reopen", ['reason' => 'Still broken.'])
            ->assertStatus(422);
    }

    #[Test]
    public function internal_notes_are_never_returned_to_the_employee(): void
    {
        $this->raiseTicket();
        $ticket = Ticket::firstOrFail();

        $this->withToken(auth('api')->login($this->admin))
            ->postJson("/api/tickets/{$ticket->id}/reply", [
                'message' => 'Employee has done this before — check the asset log.',
                'is_internal' => true,
            ])->assertCreated();

        $employeeView = $this->withToken(auth('api')->login($this->employee))
            ->getJson("/api/tickets/show/{$ticket->id}")->json('data.messages');

        $this->assertCount(0, $employeeView);

        $adminView = $this->withToken(auth('api')->login($this->admin))
            ->getJson("/api/tickets/show/{$ticket->id}")->json('data.messages');

        $this->assertCount(1, $adminView);
    }

    #[Test]
    public function a_new_ticket_gets_an_sla_target_from_its_priority_rule(): void
    {
        $this->raiseTicket();
        $ticket = Ticket::firstOrFail();

        // 'high' seeds an 8-hour resolution target.
        $this->assertNotNull($ticket->sla_due_at);
        $this->assertSame(8, (int) round($ticket->created_at->diffInHours($ticket->sla_due_at)));
        $this->assertSame('on_track', $ticket->sla_status);
        $this->assertFalse($ticket->is_overdue);
    }

    #[Test]
    public function a_ticket_past_its_target_reports_as_overdue(): void
    {
        $this->raiseTicket();
        $ticket = Ticket::firstOrFail();
        $ticket->forceFill(['sla_due_at' => now()->subHours(2)])->save();

        $fresh = $ticket->fresh();
        $this->assertSame('breached', $fresh->sla_status);
        $this->assertTrue($fresh->is_overdue);

        $summary = $this->withToken(auth('api')->login($this->admin))
            ->getJson('/api/tickets/dashboard')->json('data.summary');

        $this->assertSame(1, $summary['sla_breached']);
    }

    /**
     * A ticket resolved comfortably inside its window must not drift into
     * looking breached simply because time passed afterwards.
     */
    #[Test]
    public function a_settled_ticket_freezes_its_sla_at_the_moment_it_was_resolved(): void
    {
        $this->raiseTicket();
        $ticket = Ticket::firstOrFail();
        $ticket->forceFill([
            'status' => Ticket::STATUS_RESOLVED,
            'resolved_at' => now()->subDays(10)->addHour(),
            'sla_due_at' => now()->subDays(10)->addHours(8),
            'created_at' => now()->subDays(10),
        ])->save();

        $fresh = $ticket->fresh();
        $this->assertSame('on_track', $fresh->sla_status);
        $this->assertFalse($fresh->is_overdue);
    }

    #[Test]
    public function sla_compliance_is_null_until_something_has_been_resolved(): void
    {
        $this->raiseTicket();

        $summary = $this->withToken(auth('api')->login($this->admin))
            ->getJson('/api/tickets/dashboard')->json('data.summary');

        // Not 100 — there is nothing to judge yet.
        $this->assertNull($summary['sla_compliance']);
        $this->assertNull($summary['avg_resolution_hours']);
    }

    #[Test]
    public function the_dashboard_breaks_tickets_down_by_department_and_branch(): void
    {
        $this->raiseTicket();

        $silverEmployee = $this->makeUser([
            'role' => 3, 'company_code' => 'silver-star', 'unit' => 'Daduk', 'department' => 'Payroll',
        ]);
        $this->raiseTicket($silverEmployee);

        $summary = $this->withToken(auth('api')->login($this->admin))
            ->getJson('/api/tickets/dashboard')->json('data.summary');

        $departments = collect($summary['by_department'])->pluck('count', 'name');
        $branches = collect($summary['by_branch'])->pluck('count', 'name');

        $this->assertSame(1, $departments['IT']);
        $this->assertSame(1, $departments['Payroll']);
        $this->assertSame(1, $branches['Shreeji']);
        $this->assertSame(1, $branches['Daduk']);
    }

    #[Test]
    public function escalating_raises_the_level_and_is_recorded(): void
    {
        $this->raiseTicket();
        $ticket = Ticket::firstOrFail();

        $this->withToken(auth('api')->login($this->admin))
            ->postJson("/api/tickets/{$ticket->id}/escalate", ['remarks' => 'No response from the desk'])
            ->assertOk();

        $fresh = $ticket->fresh();
        $this->assertSame(Ticket::STATUS_ESCALATED, $fresh->status);
        $this->assertSame(1, $fresh->escalation_level);
        $this->assertDatabaseHas('ticket_activity_logs', ['ticket_id' => $ticket->id, 'action' => 'ESCALATED']);
    }

    #[Test]
    public function a_bulk_action_reports_per_ticket_outcomes_instead_of_blanket_success(): void
    {
        $this->raiseTicket();
        $this->raiseTicket();

        $tickets = Ticket::orderBy('id')->get();
        // One is already closed, so it must refuse and say so.
        $tickets[1]->forceFill(['status' => Ticket::STATUS_CLOSED, 'closed_at' => now()])->save();

        $response = $this->withToken(auth('api')->login($this->admin))
            ->postJson('/api/tickets/bulk', [
                'action' => 'escalate',
                'ids' => $tickets->pluck('id')->all(),
            ])->assertOk();

        $this->assertCount(1, $response->json('data.succeeded'));
        $this->assertCount(1, $response->json('data.failed'));
    }

    #[Test]
    public function bulk_actions_cannot_touch_tickets_outside_the_callers_scope(): void
    {
        $this->raiseTicket();
        $ticket = Ticket::firstOrFail();

        $response = $this->withToken(auth('api')->login($this->otherCompanyAdmin))
            ->postJson('/api/tickets/bulk', ['action' => 'escalate', 'ids' => [$ticket->id]])
            ->assertOk();

        $this->assertCount(0, $response->json('data.succeeded'));
        $this->assertSame(1, $response->json('data.not_visible'));
        $this->assertSame(Ticket::STATUS_OPEN, $ticket->fresh()->status);
    }

    #[Test]
    public function sla_rules_can_be_read_and_saved(): void
    {
        $this->withToken(auth('api')->login($this->admin))
            ->getJson('/api/tickets/sla-rules')
            ->assertOk()
            ->assertJsonCount(4, 'data');

        $this->withToken(auth('api')->login($this->admin))
            ->putJson('/api/tickets/sla-rules', [
                'rules' => [[
                    'priority' => 'high', 'response_hours' => 3, 'resolution_hours' => 12,
                    'auto_escalate' => false, 'escalate_after_hours' => 6,
                ]],
            ])->assertOk();

        $this->assertDatabaseHas('ticket_sla_rules', ['priority' => 'high', 'resolution_hours' => 12]);
    }

    #[Test]
    public function a_report_returns_real_rows_scoped_to_the_caller(): void
    {
        $this->raiseTicket();

        $rows = $this->withToken(auth('api')->login($this->admin))
            ->getJson('/api/tickets/reports?type=department_wise')
            ->assertOk()
            ->json('data.rows');

        $this->assertSame('IT', $rows[0]['Department']);
        $this->assertSame(1, $rows[0]['Total']);

        // The other company's admin must not see it in their report.
        $otherRows = $this->withToken(auth('api')->login($this->otherCompanyAdmin))
            ->getJson('/api/tickets/reports?type=department_wise')
            ->assertOk()
            ->json('data.rows');

        $this->assertCount(0, $otherRows);
    }

    #[Test]
    public function a_staff_reply_stamps_first_response_but_an_internal_note_does_not(): void
    {
        $this->raiseTicket();
        $ticket = Ticket::firstOrFail();

        $this->withToken(auth('api')->login($this->admin))
            ->postJson("/api/tickets/{$ticket->id}/reply", ['message' => 'Internal only', 'is_internal' => true])
            ->assertCreated();

        $this->assertNull($ticket->fresh()->first_response_at);

        $this->withToken(auth('api')->login($this->admin))
            ->postJson("/api/tickets/{$ticket->id}/reply", ['message' => 'We are on it'])
            ->assertCreated();

        $this->assertNotNull($ticket->fresh()->first_response_at);
    }

    #[Test]
    public function an_employee_cannot_reach_the_staff_only_actions(): void
    {
        $this->raiseTicket();
        $ticket = Ticket::firstOrFail();

        $this->withToken(auth('api')->login($this->employee))
            ->putJson("/api/tickets/{$ticket->id}/status", ['status' => Ticket::STATUS_RESOLVED])
            ->assertForbidden();

        $this->withToken(auth('api')->login($this->employee))
            ->putJson("/api/tickets/{$ticket->id}/assign", ['assigned_to' => $this->admin->id])
            ->assertForbidden();
    }
}
