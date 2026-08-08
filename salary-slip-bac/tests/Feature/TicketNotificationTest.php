<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class TicketNotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;

    private User $admin;              // holds nidhi-impex + silver-star

    private User $otherCompanyAdmin;  // holds acme only

    private User $superAdmin;

    private TicketCategory $category;

    protected function setUp(): void
    {
        parent::setUp();

        $this->employee = $this->makeUser([
            'role' => 3, 'company_code' => 'nidhi-impex', 'unit' => 'Shreeji', 'department' => 'IT',
        ]);
        $this->admin = $this->makeUser(['role' => 1, 'company_code' => 'nidhi-impex,silver-star']);
        $this->otherCompanyAdmin = $this->makeUser(['role' => 1, 'company_code' => 'acme']);
        $this->superAdmin = $this->makeUser(['role' => 0, 'company_code' => 'nidhi-impex']);

        $this->category = TicketCategory::create([
            'name' => 'IT Support', 'slug' => 'it-support-notif',
            'default_department' => 'IT', 'is_active' => true, 'sort_order' => 10,
        ]);
    }

    private function makeUser(array $attributes): User
    {
        return User::create(array_merge([
            'name' => 'Notif Test User',
            'email' => uniqid('notif-', true).'@example.test',
            'password' => 'password',
            'emp_code' => strtoupper(substr(uniqid(), -8)),
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'status' => 0,
            'is_deleted' => 0,
        ], $attributes));
    }

    private function raiseTicket(?User $as = null): void
    {
        $actor = $as ?: $this->employee;

        $this->withToken(auth('api')->login($actor))
            ->postJson('/api/tickets/store', [
                'category_id' => $this->category->id,
                'subject' => 'Laptop will not boot',
                'description' => 'Powers on then shuts down.',
                'priority' => 'high',
            ])->assertCreated();
    }

    private function notificationsFor(User $user)
    {
        return Notification::where('user_id', $user->id)->get();
    }

    /** The headline case: an employee raises a ticket, the admin is told. */
    #[Test]
    public function raising_a_ticket_notifies_the_admins_who_can_see_it(): void
    {
        $this->raiseTicket();

        $ticket = Ticket::firstOrFail();

        $adminNotifications = $this->notificationsFor($this->admin);
        $this->assertCount(1, $adminNotifications);

        $notification = $adminNotifications->first();
        $this->assertStringContainsString($ticket->ticket_number, $notification->title);
        $this->assertSame('Tickets', $notification->module);
        $this->assertSame('ticket', $notification->related_type);
        $this->assertSame($ticket->id, (int) $notification->related_id);
        $this->assertNull($notification->read_at);
        // Staff land in the control centre, not the employee's own list.
        $this->assertSame('/admin/tickets/control-center', $notification->action_url);

        // A Super Admin sees every company, so they are notified too.
        $this->assertCount(1, $this->notificationsFor($this->superAdmin));
    }

    #[Test]
    public function an_admin_from_another_company_is_not_notified(): void
    {
        $this->raiseTicket();

        $this->assertCount(0, $this->notificationsFor($this->otherCompanyAdmin));
    }

    #[Test]
    public function the_employee_who_raised_the_ticket_is_not_notified_about_their_own_action(): void
    {
        $this->raiseTicket();

        $this->assertCount(0, $this->notificationsFor($this->employee));
    }

    /**
     * A manager is scoped to their unit as well as their company, so a ticket
     * from another unit must not reach them.
     */
    #[Test]
    public function a_manager_is_only_notified_about_their_own_unit(): void
    {
        $sameUnit = $this->makeUser(['role' => 2, 'company_code' => 'nidhi-impex', 'unit' => 'Shreeji']);
        $otherUnit = $this->makeUser(['role' => 2, 'company_code' => 'nidhi-impex', 'unit' => 'Ichapur']);

        $this->raiseTicket();

        $this->assertCount(1, $this->notificationsFor($sameUnit));
        $this->assertCount(0, $this->notificationsFor($otherUnit));
    }

    #[Test]
    public function a_staff_reply_notifies_the_employee_not_the_sender(): void
    {
        $this->raiseTicket();
        $ticket = Ticket::firstOrFail();
        Notification::query()->delete();

        $this->withToken(auth('api')->login($this->admin))
            ->postJson("/api/tickets/{$ticket->id}/reply", ['message' => 'We are looking into it'])
            ->assertCreated();

        $employeeNotifications = $this->notificationsFor($this->employee);
        $this->assertCount(1, $employeeNotifications);
        $this->assertSame('/employee/tickets', $employeeNotifications->first()->action_url);
        $this->assertCount(0, $this->notificationsFor($this->admin));
    }

    /** An internal note must not tell the employee anything at all. */
    #[Test]
    public function an_internal_note_never_notifies_the_employee(): void
    {
        $this->raiseTicket();
        $ticket = Ticket::firstOrFail();
        Notification::query()->delete();

        $this->withToken(auth('api')->login($this->admin))
            ->postJson("/api/tickets/{$ticket->id}/reply", [
                'message' => 'Check the asset log before replying',
                'is_internal' => true,
            ])->assertCreated();

        $this->assertCount(0, $this->notificationsFor($this->employee));
        // Other staff still get it.
        $this->assertCount(1, $this->notificationsFor($this->superAdmin));
    }

    #[Test]
    public function escalation_notifies_staff_with_urgent_priority(): void
    {
        $this->raiseTicket();
        $ticket = Ticket::firstOrFail();
        Notification::query()->delete();

        $this->withToken(auth('api')->login($this->admin))
            ->postJson("/api/tickets/{$ticket->id}/escalate", [])
            ->assertOk();

        $notification = $this->notificationsFor($this->superAdmin)->first();
        $this->assertNotNull($notification);
        $this->assertSame('Urgent', $notification->priority);
        $this->assertStringContainsString('escalated', strtolower($notification->title));
    }

    #[Test]
    public function a_user_only_ever_sees_their_own_notifications(): void
    {
        $this->raiseTicket();

        $response = $this->withToken(auth('api')->login($this->admin))
            ->getJson('/api/notifications')
            ->assertOk();

        $this->assertCount(1, $response->json('data'));
        $this->assertSame(1, $response->json('meta.unread'));

        // The other company's admin has an empty feed for the same event.
        $this->withToken(auth('api')->login($this->otherCompanyAdmin))
            ->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    #[Test]
    public function marking_read_clears_the_badge_and_is_idempotent(): void
    {
        $this->raiseTicket();
        $notification = $this->notificationsFor($this->admin)->first();

        $this->withToken(auth('api')->login($this->admin))
            ->postJson("/api/notifications/{$notification->id}/read")
            ->assertOk();

        $readAt = $notification->fresh()->read_at;
        $this->assertNotNull($readAt);

        $this->withToken(auth('api')->login($this->admin))
            ->getJson('/api/notifications/unread-count')
            ->assertOk()
            ->assertJsonPath('data.unread', 0);

        // Re-reading must not move the timestamp.
        $this->withToken(auth('api')->login($this->admin))
            ->postJson("/api/notifications/{$notification->id}/read")
            ->assertOk();

        $this->assertEquals($readAt, $notification->fresh()->read_at);
    }

    #[Test]
    public function one_user_cannot_mark_another_users_notification_read(): void
    {
        $this->raiseTicket();
        $notification = $this->notificationsFor($this->admin)->first();

        $this->withToken(auth('api')->login($this->otherCompanyAdmin))
            ->postJson("/api/notifications/{$notification->id}/read")
            ->assertNotFound();

        $this->assertNull($notification->fresh()->read_at);
    }

    #[Test]
    public function mark_all_read_only_touches_the_callers_own_feed(): void
    {
        $this->raiseTicket();
        $this->raiseTicket();

        $this->withToken(auth('api')->login($this->admin))
            ->postJson('/api/notifications/read-all')
            ->assertOk();

        $this->assertSame(0, Notification::where('user_id', $this->admin->id)->unread()->count());
        // The Super Admin's copies of the same events are untouched.
        $this->assertSame(2, Notification::where('user_id', $this->superAdmin->id)->unread()->count());
    }
}
