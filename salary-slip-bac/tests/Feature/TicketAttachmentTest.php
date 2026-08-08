<?php

namespace Tests\Feature;

use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Models\TicketCategory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class TicketAttachmentTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;

    private User $admin;

    private User $otherCompanyAdmin;

    private TicketCategory $category;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');

        $this->employee = $this->makeUser([
            'role' => 3, 'company_code' => 'nidhi-impex', 'unit' => 'Shreeji', 'department' => 'IT',
        ]);
        $this->admin = $this->makeUser(['role' => 1, 'company_code' => 'nidhi-impex']);
        $this->otherCompanyAdmin = $this->makeUser(['role' => 1, 'company_code' => 'acme']);

        $this->category = TicketCategory::create([
            'name' => 'IT Support', 'slug' => 'it-support-attach',
            'default_department' => 'IT', 'is_active' => true, 'sort_order' => 10,
        ]);
    }

    private function makeUser(array $attributes): User
    {
        return User::create(array_merge([
            'name' => 'Attachment Test User',
            'email' => uniqid('att-', true).'@example.test',
            'password' => 'password',
            'emp_code' => strtoupper(substr(uniqid(), -8)),
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'status' => 0,
            'is_deleted' => 0,
        ], $attributes));
    }

    private function raiseTicket(): Ticket
    {
        $this->withToken(auth('api')->login($this->employee))
            ->postJson('/api/tickets/store', [
                'category_id' => $this->category->id,
                'subject' => 'Laptop will not boot',
                'description' => 'Screenshot attached.',
                'priority' => 'high',
            ])->assertCreated();

        return Ticket::latest('id')->firstOrFail();
    }

    private function attach(Ticket $ticket, array $files, ?User $as = null)
    {
        return $this->withToken(auth('api')->login($as ?: $this->employee))
            ->post("/api/tickets/{$ticket->id}/attachments", ['files' => $files]);
    }

    #[Test]
    public function an_employee_can_attach_a_file_to_their_own_ticket(): void
    {
        $ticket = $this->raiseTicket();

        $this->attach($ticket, [UploadedFile::fake()->image('screenshot.png')])
            ->assertCreated()
            ->assertJsonPath('status', true);

        $attachment = TicketAttachment::firstOrFail();

        $this->assertSame($ticket->id, $attachment->ticket_id);
        $this->assertSame('screenshot.png', $attachment->file_name);
        $this->assertSame($this->employee->id, (int) $attachment->uploaded_by);
        Storage::disk('local')->assertExists($attachment->file_path);

        // The path must not be the user-supplied name.
        $this->assertStringNotContainsString('screenshot.png', $attachment->file_path);
        $this->assertStringContainsString("ticket-attachments/{$ticket->id}/", $attachment->file_path);
    }

    #[Test]
    public function several_files_can_be_attached_at_once(): void
    {
        $ticket = $this->raiseTicket();

        $this->attach($ticket, [
            UploadedFile::fake()->image('one.png'),
            UploadedFile::fake()->create('notes.pdf', 40, 'application/pdf'),
        ])->assertCreated();

        $this->assertSame(2, TicketAttachment::where('ticket_id', $ticket->id)->count());
    }

    /** A renamed script must not slip through on a declared MIME type. */
    #[Test]
    public function an_executable_extension_is_rejected(): void
    {
        $ticket = $this->raiseTicket();

        $this->attach($ticket, [UploadedFile::fake()->create('invoice.pdf.php', 10, 'application/pdf')])
            ->assertStatus(422);

        $this->assertSame(0, TicketAttachment::count());
        $this->assertCount(0, Storage::disk('local')->allFiles());
    }

    /** SVG can carry script; inline rendering would be stored XSS. */
    #[Test]
    public function svg_is_rejected(): void
    {
        $ticket = $this->raiseTicket();

        $this->attach($ticket, [UploadedFile::fake()->create('logo.svg', 5, 'image/svg+xml')])
            ->assertStatus(422);

        $this->assertSame(0, TicketAttachment::count());
    }

    #[Test]
    public function an_unsupported_type_is_rejected(): void
    {
        $ticket = $this->raiseTicket();

        $this->attach($ticket, [UploadedFile::fake()->create('archive.iso', 20, 'application/x-iso9660-image')])
            ->assertStatus(422);

        $this->assertSame(0, TicketAttachment::count());
    }

    #[Test]
    public function a_file_over_the_size_limit_is_rejected(): void
    {
        $ticket = $this->raiseTicket();

        // 11 MB against a 10 MB ceiling.
        $this->attach($ticket, [UploadedFile::fake()->create('huge.pdf', 11 * 1024, 'application/pdf')])
            ->assertStatus(422);

        $this->assertSame(0, TicketAttachment::count());
    }

    /** One bad file must not leave the good ones half-attached. */
    #[Test]
    public function a_rejected_file_in_a_batch_stores_none_of_them(): void
    {
        $ticket = $this->raiseTicket();

        $this->attach($ticket, [
            UploadedFile::fake()->image('good.png'),
            UploadedFile::fake()->create('bad.php', 5, 'application/pdf'),
        ])->assertStatus(422);

        $this->assertSame(0, TicketAttachment::count());
        $this->assertCount(0, Storage::disk('local')->allFiles());
    }

    #[Test]
    public function more_than_five_files_at_once_is_rejected(): void
    {
        $ticket = $this->raiseTicket();

        $files = [];
        for ($i = 0; $i < 6; $i++) {
            $files[] = UploadedFile::fake()->image("shot{$i}.png");
        }

        $this->attach($ticket, $files)->assertStatus(422);
        $this->assertSame(0, TicketAttachment::count());
    }

    // -----------------------------------------------------------------
    // Access
    // -----------------------------------------------------------------

    #[Test]
    public function an_employee_cannot_attach_to_someone_elses_ticket(): void
    {
        $ticket = $this->raiseTicket();
        $stranger = $this->makeUser(['role' => 3, 'company_code' => 'nidhi-impex']);

        $this->attach($ticket, [UploadedFile::fake()->image('nosy.png')], $stranger)
            ->assertNotFound();

        $this->assertSame(0, TicketAttachment::count());
    }

    #[Test]
    public function an_admin_in_scope_can_download_but_one_from_another_company_cannot(): void
    {
        $ticket = $this->raiseTicket();
        $this->attach($ticket, [UploadedFile::fake()->image('screenshot.png')])->assertCreated();
        $attachment = TicketAttachment::firstOrFail();

        $this->withToken(auth('api')->login($this->admin))
            ->get("/api/tickets/{$ticket->id}/attachments/{$attachment->id}")
            ->assertOk();

        $this->withToken(auth('api')->login($this->otherCompanyAdmin))
            ->get("/api/tickets/{$ticket->id}/attachments/{$attachment->id}")
            ->assertNotFound();
    }

    /** Only real images render inline; anything else must download. */
    #[Test]
    public function a_pdf_is_forced_to_download_while_an_image_may_render_inline(): void
    {
        $ticket = $this->raiseTicket();
        $this->attach($ticket, [
            UploadedFile::fake()->image('shot.png'),
            UploadedFile::fake()->create('notes.pdf', 20, 'application/pdf'),
        ])->assertCreated();

        $image = TicketAttachment::where('file_name', 'shot.png')->firstOrFail();
        $pdf = TicketAttachment::where('file_name', 'notes.pdf')->firstOrFail();

        $imageResponse = $this->withToken(auth('api')->login($this->employee))
            ->get("/api/tickets/{$ticket->id}/attachments/{$image->id}")->assertOk();
        $pdfResponse = $this->withToken(auth('api')->login($this->employee))
            ->get("/api/tickets/{$ticket->id}/attachments/{$pdf->id}")->assertOk();

        $this->assertStringContainsString('inline', $imageResponse->headers->get('content-disposition'));
        $this->assertStringContainsString('attachment', $pdfResponse->headers->get('content-disposition'));
        $this->assertSame('nosniff', $pdfResponse->headers->get('x-content-type-options'));
    }

    #[Test]
    public function an_attachment_from_one_ticket_cannot_be_read_through_another(): void
    {
        $ticket = $this->raiseTicket();
        $this->attach($ticket, [UploadedFile::fake()->image('secret.png')])->assertCreated();
        $attachment = TicketAttachment::firstOrFail();

        $second = $this->raiseTicket();

        $this->withToken(auth('api')->login($this->employee))
            ->get("/api/tickets/{$second->id}/attachments/{$attachment->id}")
            ->assertNotFound();
    }

    // -----------------------------------------------------------------
    // Removal and lifecycle
    // -----------------------------------------------------------------

    #[Test]
    public function the_uploader_can_remove_their_own_attachment(): void
    {
        $ticket = $this->raiseTicket();
        $this->attach($ticket, [UploadedFile::fake()->image('oops.png')])->assertCreated();
        $attachment = TicketAttachment::firstOrFail();
        $path = $attachment->file_path;

        $this->withToken(auth('api')->login($this->employee))
            ->deleteJson("/api/tickets/{$ticket->id}/attachments/{$attachment->id}")
            ->assertOk();

        $this->assertSame(0, TicketAttachment::count());
        Storage::disk('local')->assertMissing($path);
    }

    #[Test]
    public function another_employee_cannot_remove_an_attachment(): void
    {
        $ticket = $this->raiseTicket();
        $this->attach($ticket, [UploadedFile::fake()->image('mine.png')])->assertCreated();
        $attachment = TicketAttachment::firstOrFail();

        $stranger = $this->makeUser(['role' => 3, 'company_code' => 'nidhi-impex']);

        // The stranger cannot even see the ticket.
        $this->withToken(auth('api')->login($stranger))
            ->deleteJson("/api/tickets/{$ticket->id}/attachments/{$attachment->id}")
            ->assertNotFound();

        $this->assertSame(1, TicketAttachment::count());
    }

    #[Test]
    public function attachments_cannot_be_added_to_a_closed_ticket(): void
    {
        $ticket = $this->raiseTicket();
        $ticket->forceFill(['status' => Ticket::STATUS_CLOSED, 'closed_at' => now()])->save();

        $this->attach($ticket, [UploadedFile::fake()->image('late.png')])->assertStatus(422);
        $this->assertSame(0, TicketAttachment::count());
    }

    #[Test]
    public function attachments_are_returned_with_the_ticket(): void
    {
        $ticket = $this->raiseTicket();
        $this->attach($ticket, [UploadedFile::fake()->image('screenshot.png')])->assertCreated();

        $data = $this->withToken(auth('api')->login($this->admin))
            ->getJson("/api/tickets/show/{$ticket->id}")
            ->assertOk()
            ->json('data');

        $this->assertCount(1, $data['attachments']);
        $this->assertSame('screenshot.png', $data['attachments'][0]['file_name']);
        // The on-disk path is an implementation detail the client never needs.
        $this->assertArrayHasKey('file_size', $data['attachments'][0]);
    }

    #[Test]
    public function attaching_is_recorded_in_the_activity_log(): void
    {
        $ticket = $this->raiseTicket();
        $this->attach($ticket, [UploadedFile::fake()->image('screenshot.png')])->assertCreated();

        $this->assertDatabaseHas('ticket_activity_logs', [
            'ticket_id' => $ticket->id,
            'action' => 'ATTACHED',
        ]);
    }
}
