<?php

namespace Tests\Feature;

use App\Models\AadhaarExportAuthorization;
use App\Models\DocumentAuditLog;
use App\Models\PermissionDimension;
use App\Models\Role;
use App\Models\User;
use App\Support\AadhaarAccess;
use App\Support\AadhaarExportAccess;
use Database\Seeders\AadhaarRevealPermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Confidential (full-Aadhaar) Print and PDF export.
 *
 * The property under test throughout is that the export fails closed: unless the
 * server has re-authorised this actor, for this record, for this export type, and
 * has written an audit entry, no full Aadhaar leaves the application. Every test
 * that expects a refusal also asserts the number is absent from the response
 * body, because "403 with the number in the error payload" would satisfy a status
 * assertion while leaking exactly what it was meant to protect.
 */
class AadhaarConfidentialExportTest extends TestCase
{
    use RefreshDatabase;

    private const AADHAAR = '715115981345';

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();

        // Off by default in config; these tests exercise the enabled behaviour.
        // The disabled case has its own test that turns it back off.
        config(['aadhaar.confidential_export_enabled' => true]);
    }

    private function makeUser(int $role, string $aadhaar = self::AADHAAR, string $company = 'nidhi-impex'): User
    {
        $n = ++$this->seq;

        $user = User::create([
            'name' => "Person {$n}",
            'email' => "export-{$n}@test.local",
            'password' => 'x',
            'role' => $role,
            'emp_code' => "EMP80{$n}",
            'company_code' => $company,
            'unit' => 'Ichapur',
            'status' => 0,
            'is_deleted' => 0,
        ]);

        if ($aadhaar !== '') {
            $user->forceFill(['aadhar_card_no' => $aadhaar])->save();
        }

        return $user->fresh();
    }

    /** Write a permission_dimensions grant, the surface that is actually enforced. */
    private function grant(User $actor, string ...$keys): void
    {
        $role = Role::firstOrCreate(
            ['name' => 'User_'.$actor->id.'_Permissions'],
            ['type' => 'Custom']
        );

        foreach ($keys as $key) {
            PermissionDimension::updateOrCreate(
                ['dimension' => 'page', 'role_id' => $role->id, 'key_name' => $key],
                ['value' => 'view_only']
            );
        }
    }

    private function token(User $actor, User $target, string $exportType, string $surface = 'appointments'): string
    {
        $response = $this->withToken(auth('api')->login($actor))
            ->postJson("/api/v1/{$surface}/{$target->id}/aadhaar/export-authorization", [
                'exportType' => $exportType,
            ]);

        $response->assertStatus(201);

        return $response->json('data.exportToken');
    }

    // ------------------------------------------------- 1-3: authentication, RBAC

    public function test_print_authorization_requires_authentication(): void
    {
        $target = $this->makeUser(3);

        $response = $this->postJson(
            "/api/v1/appointments/{$target->id}/aadhaar/export-authorization",
            ['exportType' => 'PRINT']
        );

        $this->assertContains($response->status(), [401, 403]);
        $this->assertStringNotContainsString(self::AADHAAR, $response->getContent());
    }

    public function test_print_authorization_requires_the_print_permission(): void
    {
        $actor = $this->makeUser(1);
        $target = $this->makeUser(3);

        // Deliberately granted the *view* permission and nothing else. Being
        // allowed to read the number on screen must not authorise paper.
        $this->grant($actor, AadhaarAccess::PERMISSION);

        $response = $this->withToken(auth('api')->login($actor->fresh()))
            ->postJson("/api/v1/appointments/{$target->id}/aadhaar/export-authorization", [
                'exportType' => 'PRINT',
            ]);

        $response->assertStatus(403);
        $this->assertStringNotContainsString(self::AADHAAR, $response->getContent());
        $this->assertSame(0, AadhaarExportAuthorization::count());
    }

    public function test_pdf_authorization_requires_its_own_separate_permission(): void
    {
        $actor = $this->makeUser(1);
        $target = $this->makeUser(3);

        // Print granted, PDF not. A print grant must not produce a downloadable
        // file — that is the difference the two keys exist to express.
        $this->grant($actor, AadhaarExportAccess::PRINT_APPOINTMENT);
        $actor = $actor->fresh();

        $this->withToken(auth('api')->login($actor))
            ->postJson("/api/v1/appointments/{$target->id}/aadhaar/export-authorization", ['exportType' => 'PRINT'])
            ->assertStatus(201);

        $this->withToken(auth('api')->login($actor))
            ->postJson("/api/v1/appointments/{$target->id}/aadhaar/export-authorization", ['exportType' => 'PDF'])
            ->assertStatus(403);
    }

    // ------------------------------------------------------------- 4: scoping

    public function test_cross_organization_export_is_denied(): void
    {
        $target = $this->makeUser(3, self::AADHAAR, 'nidhi-impex');
        $outsider = $this->makeUser(1, '', 'silver-star');
        $this->grant($outsider, AadhaarExportAccess::PDF_APPOINTMENT);

        $response = $this->withToken(auth('api')->login($outsider->fresh()))
            ->postJson("/api/v1/appointments/{$target->id}/aadhaar/export-authorization", [
                'exportType' => 'PDF',
            ]);

        // Refused on scope, before the permission is even consulted.
        $response->assertStatus(403);
        $this->assertStringNotContainsString(self::AADHAAR, $response->getContent());
        $this->assertSame(0, AadhaarExportAuthorization::count());
    }

    // --------------------------------------------------- 5-6: audit is mandatory

    public function test_the_authorization_audit_entry_exists_before_approval(): void
    {
        $admin = $this->makeUser(0);
        $target = $this->makeUser(3);

        $response = $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$target->id}/aadhaar/export-authorization", [
                'exportType' => 'PDF',
            ]);

        $response->assertStatus(201);

        $entry = DocumentAuditLog::where('action', 'APPOINTMENT_FULL_AADHAAR_PDF_AUTHORIZED')
            ->latest('id')
            ->first();

        $this->assertNotNull($entry);
        $this->assertSame($admin->id, $entry->actor_user_id);
        $this->assertSame($target->id, $entry->metadata['target_user_id']);
        $this->assertSame('PDF', $entry->metadata['export_type']);
        $this->assertSame(AadhaarExportAccess::PDF_APPOINTMENT, $entry->metadata['permission_checked']);
        $this->assertSame('ALLOWED', $entry->metadata['authorization_result']);
        $this->assertSame('1345', $entry->metadata['aadhaar_last4']);

        // The authorization row points back at the entry that recorded it.
        $authorization = AadhaarExportAuthorization::latest('id')->first();
        $this->assertSame($entry->id, (int) $authorization->audit_log_id);
    }

    public function test_an_audit_write_failure_denies_the_export(): void
    {
        $admin = $this->makeUser(0);
        $target = $this->makeUser(3);

        // Make the audit insert genuinely impossible, rather than mocking the
        // call away — the point is that a real failure to record leaves no
        // authorization behind.
        Schema::disableForeignKeyConstraints();
        Schema::drop('document_audit_logs');

        $response = $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$target->id}/aadhaar/export-authorization", [
                'exportType' => 'PDF',
            ]);

        $this->assertSame(500, $response->status());
        $this->assertStringNotContainsString(self::AADHAAR, $response->getContent());
        $this->assertSame(0, AadhaarExportAuthorization::count());
    }

    // ------------------------------------------------------- 7-11: token binding

    public function test_an_export_token_is_bound_to_the_user_who_obtained_it(): void
    {
        $admin = $this->makeUser(0);
        $other = $this->makeUser(0);
        $target = $this->makeUser(3);

        $token = $this->token($admin, $target, 'PDF');

        $response = $this->withToken(auth('api')->login($other))
            ->postJson("/api/v1/appointments/{$target->id}/confidential-pdf", ['exportToken' => $token]);

        $response->assertStatus(403);
        $this->assertStringNotContainsString(self::AADHAAR, $response->getContent());
    }

    public function test_an_export_token_is_bound_to_one_record(): void
    {
        $admin = $this->makeUser(0);
        $target = $this->makeUser(3);
        $another = $this->makeUser(3, '999988887777');

        $token = $this->token($admin, $target, 'PDF');

        $response = $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$another->id}/confidential-pdf", ['exportToken' => $token]);

        $response->assertStatus(403);
        $this->assertStringNotContainsString('999988887777', $response->getContent());
    }

    public function test_an_export_token_is_bound_to_its_export_type(): void
    {
        $admin = $this->makeUser(0);
        $target = $this->makeUser(3);

        // Issued for a print; a PDF download must not accept it.
        $token = $this->token($admin, $target, 'PRINT');

        $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$target->id}/confidential-pdf", ['exportToken' => $token])
            ->assertStatus(403);
    }

    public function test_an_expired_export_token_is_rejected(): void
    {
        $admin = $this->makeUser(0);
        $target = $this->makeUser(3);

        $token = $this->token($admin, $target, 'PDF');

        AadhaarExportAuthorization::query()->update(['expires_at' => now()->subSecond()]);

        $response = $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$target->id}/confidential-pdf", ['exportToken' => $token]);

        $response->assertStatus(403);
        $this->assertStringNotContainsString(self::AADHAAR, $response->getContent());
    }

    public function test_a_pdf_export_token_cannot_be_used_twice(): void
    {
        $admin = $this->makeUser(0);
        $target = $this->makeUser(3);

        $token = $this->token($admin, $target, 'PDF');

        $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$target->id}/confidential-pdf", ['exportToken' => $token])
            ->assertOk();

        $second = $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$target->id}/confidential-pdf", ['exportToken' => $token]);

        $second->assertStatus(403);
        $this->assertStringNotContainsString(self::AADHAAR, $second->getContent());
    }

    public function test_the_raw_token_is_never_stored(): void
    {
        $admin = $this->makeUser(0);
        $target = $this->makeUser(3);

        $token = $this->token($admin, $target, 'PDF');
        $stored = AadhaarExportAuthorization::latest('id')->first();

        // A dump of this table must not be replayable against the endpoint.
        $this->assertNotSame($token, $stored->getAttribute('token_hash'));
        $this->assertSame(hash('sha256', $token), $stored->getAttribute('token_hash'));
        $this->assertStringNotContainsString($token, json_encode($stored->toArray()));
    }

    // --------------------------------------------------- 12-15: generated PDF

    public function test_the_server_generated_pdf_carries_the_full_number_for_an_authorized_request(): void
    {
        $admin = $this->makeUser(0);
        $target = $this->makeUser(3);

        $token = $this->token($admin, $target, 'PDF');

        $response = $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$target->id}/confidential-pdf", ['exportToken' => $token]);

        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/pdf');

        $pdf = $response->getContent();

        $this->assertStringStartsWith('%PDF-', $pdf);
        // Grouped in fours, as printed on the card.
        $this->assertStringContainsString('7151 1598 1345', $pdf);
    }

    public function test_the_generated_pdf_carries_the_confidential_watermark_and_provenance(): void
    {
        $admin = $this->makeUser(0);
        $target = $this->makeUser(3);

        $token = $this->token($admin, $target, 'PDF');

        $pdf = $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$target->id}/confidential-pdf", ['exportToken' => $token])
            ->assertOk()
            ->getContent();

        $this->assertStringContainsString('CONFIDENTIAL', $pdf);
        $this->assertStringContainsString('Contains Sensitive Identity Information', $pdf);
        $this->assertStringContainsString('Generated by: '.$admin->name, $pdf);
        $this->assertStringContainsString('Generated at:', $pdf);
        $this->assertStringContainsString('Export reference: EXP-', $pdf);
    }

    public function test_the_pdf_filename_and_export_reference_contain_no_aadhaar(): void
    {
        $admin = $this->makeUser(0);
        $target = $this->makeUser(3);

        $token = $this->token($admin, $target, 'PDF');

        $response = $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$target->id}/confidential-pdf", ['exportToken' => $token])
            ->assertOk();

        $disposition = $response->headers->get('Content-Disposition');

        $this->assertStringContainsString('Appointment_APT-'.str_pad((string) $target->id, 6, '0', STR_PAD_LEFT).'_Confidential.pdf', $disposition);
        $this->assertStringNotContainsString(self::AADHAAR, $disposition);
        $this->assertStringNotContainsString('1345', $disposition);

        $reference = AadhaarExportAuthorization::latest('id')->first()->uuid;
        $this->assertStringNotContainsString(self::AADHAAR, $reference);
    }

    public function test_the_pdf_response_forbids_caching(): void
    {
        $admin = $this->makeUser(0);
        $target = $this->makeUser(3);

        $token = $this->token($admin, $target, 'PDF');

        $response = $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$target->id}/confidential-pdf", ['exportToken' => $token])
            ->assertOk();

        $cacheControl = $response->headers->get('Cache-Control');

        $this->assertStringContainsString('no-store', $cacheControl);
        $this->assertStringContainsString('private', $cacheControl);
        $this->assertSame('nosniff', $response->headers->get('X-Content-Type-Options'));
    }

    // --------------------------------------- 16-20: masking, logging, integrity

    /**
     * Display and export are now governed differently.
     *
     * An in-scope actor sees the complete number on the details page without any
     * grant, and still cannot obtain an audited exported copy of it without the
     * export permission. That separation is the point: reading a number on screen
     * and creating a file that outlives the session are different acts.
     */
    public function test_details_disclose_the_number_while_export_still_needs_a_grant(): void
    {
        $hr = $this->makeUser(1);
        $target = $this->makeUser(3);

        $this->withToken(auth('api')->login($hr))
            ->getJson("/api/v1/appointments/{$target->id}")
            ->assertOk()
            ->assertJsonPath('data.appointment.aadhaar_full', self::AADHAAR);

        $this->withToken(auth('api')->login($hr))
            ->postJson("/api/v1/appointments/{$target->id}/aadhaar/export-authorization", [
                'exportType' => 'PDF',
            ])
            ->assertStatus(403);

        $this->assertSame(0, AadhaarExportAuthorization::count());
    }

    public function test_a_cross_company_actor_receives_no_number_at_all(): void
    {
        $target = $this->makeUser(3, self::AADHAAR, 'nidhi-impex');
        $outsider = $this->makeUser(1, '', 'silver-star');

        $response = $this->withToken(auth('api')->login($outsider))
            ->getJson("/api/v1/appointments/{$target->id}");

        $response->assertStatus(403);
        $this->assertStringNotContainsString(self::AADHAAR, $response->getContent());
        $this->assertStringNotContainsString('aadhaar_full', $response->getContent());
    }

    public function test_no_audit_entry_anywhere_contains_the_complete_number(): void
    {
        $admin = $this->makeUser(0);
        $target = $this->makeUser(3);

        $token = $this->token($admin, $target, 'PDF');

        $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$target->id}/confidential-pdf", ['exportToken' => $token])
            ->assertOk();

        // Also exercise a refusal, so denied entries are covered too.
        $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$target->id}/confidential-pdf", ['exportToken' => 'nonsense'])
            ->assertStatus(403);

        $logs = json_encode(DocumentAuditLog::all()->toArray());

        $this->assertGreaterThan(0, DocumentAuditLog::count());
        $this->assertStringNotContainsString(self::AADHAAR, $logs);
        $this->assertStringNotContainsString($token, $logs);
    }

    public function test_a_successful_download_is_audited_separately_from_the_authorization(): void
    {
        $admin = $this->makeUser(0);
        $target = $this->makeUser(3);

        $token = $this->token($admin, $target, 'PDF');

        $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$target->id}/confidential-pdf", ['exportToken' => $token])
            ->assertOk();

        $download = DocumentAuditLog::where('action', 'APPOINTMENT_CONFIDENTIAL_PDF_DOWNLOADED')
            ->latest('id')
            ->first();

        $this->assertNotNull($download);
        $this->assertSame($admin->id, $download->actor_user_id);
        $this->assertStringStartsWith('EXP-', $download->metadata['export_reference']);
        $this->assertGreaterThan(0, $download->metadata['bytes']);

        // An approval that produced a file is distinguishable from one that did not.
        $this->assertSame(1, DocumentAuditLog::where('action', 'APPOINTMENT_FULL_AADHAAR_PDF_AUTHORIZED')->count());
    }

    public function test_a_failed_export_is_audited_as_denied(): void
    {
        $actor = $this->makeUser(1);
        $target = $this->makeUser(3);

        $this->withToken(auth('api')->login($actor))
            ->postJson("/api/v1/appointments/{$target->id}/aadhaar/export-authorization", ['exportType' => 'PDF'])
            ->assertStatus(403);

        $denied = DocumentAuditLog::where('action', 'APPOINTMENT_FULL_AADHAAR_EXPORT_DENIED')
            ->latest('id')
            ->first();

        $this->assertNotNull($denied);
        $this->assertSame('DENIED', $denied->permission_result);
        $this->assertSame('PERMISSION_MISSING', $denied->metadata['reason']);
        $this->assertSame(AadhaarExportAccess::PDF_APPOINTMENT, $denied->metadata['permission_checked']);
    }

    public function test_an_aadhaar_value_supplied_by_the_client_is_ignored(): void
    {
        $admin = $this->makeUser(0);
        $target = $this->makeUser(3);

        $token = $this->token($admin, $target, 'PDF');

        // Exactly what a tampered client would send: its own number, and a flag
        // asserting its own authorisation.
        $pdf = $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$target->id}/confidential-pdf", [
                'exportToken' => $token,
                'aadhar_card_no' => '111122223333',
                'aadhaarFull' => '111122223333',
                'includeFullAadhaar' => true,
                'html' => '<div>Attacker supplied markup</div>',
            ])
            ->assertOk()
            ->getContent();

        $this->assertStringContainsString('7151 1598 1345', $pdf);
        $this->assertStringNotContainsString('1111 2222 3333', $pdf);
        $this->assertStringNotContainsString('111122223333', $pdf);
        $this->assertStringNotContainsString('Attacker supplied markup', $pdf);
    }

    // ------------------------------------------------- feature flag and payload

    public function test_the_feature_flag_closes_every_confidential_endpoint(): void
    {
        config(['aadhaar.confidential_export_enabled' => false]);

        $admin = $this->makeUser(0);
        $target = $this->makeUser(3);

        foreach ([
            "/api/v1/appointments/{$target->id}/aadhaar/export-authorization",
            "/api/v1/appointments/{$target->id}/confidential-pdf",
            "/api/v1/appointments/{$target->id}/confidential-print-payload",
        ] as $path) {
            $response = $this->withToken(auth('api')->login($admin))
                ->postJson($path, ['exportType' => 'PDF', 'exportToken' => 'anything']);

            $this->assertSame(503, $response->status(), $path);
            $this->assertStringNotContainsString(self::AADHAAR, $response->getContent());
        }

        $this->assertSame(0, AadhaarExportAuthorization::count());
    }

    public function test_a_record_without_a_valid_aadhaar_cannot_be_exported(): void
    {
        $admin = $this->makeUser(0);
        $target = $this->makeUser(3, '');

        $response = $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$target->id}/aadhaar/export-authorization", [
                'exportType' => 'PDF',
            ]);

        $response->assertStatus(404);
        $this->assertSame(0, AadhaarExportAuthorization::count());
    }

    public function test_an_unsupported_export_type_is_refused(): void
    {
        $admin = $this->makeUser(0);
        $target = $this->makeUser(3);

        $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$target->id}/aadhaar/export-authorization", [
                'exportType' => 'CSV',
            ])
            ->assertStatus(422);

        $this->assertSame(0, AadhaarExportAuthorization::count());
    }

    public function test_the_print_payload_comes_from_the_server_and_needs_a_print_token(): void
    {
        $admin = $this->makeUser(0);
        $target = $this->makeUser(3);

        $token = $this->token($admin, $target, 'PRINT');

        $response = $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$target->id}/confidential-print-payload", [
                'exportToken' => $token,
            ]);

        $response->assertOk()
            ->assertJsonPath('data.aadhaarFull', self::AADHAAR)
            ->assertJsonPath('data.generatedBy', $admin->name);

        $this->assertStringStartsWith('EXP-', $response->json('data.exportReference'));
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));

        // Without a token there is nothing to print.
        $this->withToken(auth('api')->login($admin))
            ->postJson("/api/v1/appointments/{$target->id}/confidential-print-payload", [])
            ->assertStatus(403);
    }

    public function test_a_print_token_is_not_spent_by_rendering(): void
    {
        $admin = $this->makeUser(0);
        $target = $this->makeUser(3);

        $token = $this->token($admin, $target, 'PRINT');

        // A cancelled print dialog reopened inside the TTL is legitimate.
        foreach ([1, 2] as $ignored) {
            $this->withToken(auth('api')->login($admin))
                ->postJson("/api/v1/appointments/{$target->id}/confidential-print-payload", [
                    'exportToken' => $token,
                ])
                ->assertOk();
        }

        $this->assertNull(AadhaarExportAuthorization::latest('id')->first()->used_at);
    }

    public function test_an_explicitly_granted_admin_can_export_without_being_super_admin(): void
    {
        $hr = $this->makeUser(1);
        $target = $this->makeUser(3);

        $this->grant($hr, AadhaarExportAccess::PDF_APPOINTMENT);

        $token = $this->token($hr->fresh(), $target, 'PDF');

        $pdf = $this->withToken(auth('api')->login($hr->fresh()))
            ->postJson("/api/v1/appointments/{$target->id}/confidential-pdf", ['exportToken' => $token])
            ->assertOk()
            ->getContent();

        $this->assertStringContainsString('7151 1598 1345', $pdf);
    }

    public function test_revoking_the_grant_inside_the_token_lifetime_blocks_the_download(): void
    {
        $hr = $this->makeUser(1);
        $target = $this->makeUser(3);

        $this->grant($hr, AadhaarExportAccess::PDF_APPOINTMENT);
        $token = $this->token($hr->fresh(), $target, 'PDF');

        // The permission is rechecked at download time precisely for this case.
        PermissionDimension::where('key_name', AadhaarExportAccess::PDF_APPOINTMENT)
            ->update(['value' => 'no_access']);

        $response = $this->withToken(auth('api')->login($hr->fresh()))
            ->postJson("/api/v1/appointments/{$target->id}/confidential-pdf", ['exportToken' => $token]);

        $response->assertStatus(403);
        $this->assertStringNotContainsString(self::AADHAAR, $response->getContent());
    }

    public function test_a_plain_employee_cannot_export_their_own_confidential_document(): void
    {
        $employee = $this->makeUser(3);

        // Self-ownership unlocks reading your own number, never exporting it —
        // an audited confidential document is an administrative artefact.
        $this->assertFalse(AadhaarExportAccess::allows($employee, 'APPOINTMENT', 'PDF'));

        $response = $this->withToken(auth('api')->login($employee))
            ->postJson("/api/v1/appointments/{$employee->id}/aadhaar/export-authorization", [
                'exportType' => 'PDF',
            ]);

        $response->assertStatus(403);
        $this->assertStringNotContainsString(self::AADHAAR, $response->getContent());
    }

    public function test_the_employee_surface_uses_its_own_permissions(): void
    {
        $hr = $this->makeUser(1);
        $target = $this->makeUser(3);

        // Appointment PDF granted; the employee surface must still refuse.
        $this->grant($hr, AadhaarExportAccess::PDF_APPOINTMENT);

        $this->withToken(auth('api')->login($hr->fresh()))
            ->postJson("/api/v1/employees/{$target->id}/aadhaar/export-authorization", ['exportType' => 'PDF'])
            ->assertStatus(403);

        $this->grant($hr, AadhaarExportAccess::PDF_EMPLOYEE);

        $response = $this->withToken(auth('api')->login($hr->fresh()))
            ->postJson("/api/v1/employees/{$target->id}/aadhaar/export-authorization", ['exportType' => 'PDF']);

        $response->assertStatus(201);

        $this->assertNotNull(
            DocumentAuditLog::where('action', 'EMPLOYEE_FULL_AADHAAR_PDF_AUTHORIZED')->first()
        );
    }

    public function test_the_seeder_registers_every_export_permission_idempotently(): void
    {
        $admin = $this->makeUser(0);

        $this->artisan('db:seed', ['--class' => AadhaarRevealPermissionSeeder::class])
            ->assertExitCode(0);

        foreach (AadhaarExportAccess::ALL as $key) {
            $this->assertDatabaseHas('permissions', ['name' => $key]);
        }

        $role = Role::where('name', 'User_'.$admin->id.'_Permissions')->first();
        $this->assertNotNull($role);

        $granted = PermissionDimension::where('role_id', $role->id)
            ->whereIn('key_name', AadhaarExportAccess::ALL)
            ->count();

        $this->assertSame(count(AadhaarExportAccess::ALL), $granted);

        // A deliberate revocation must survive re-seeding.
        PermissionDimension::where('role_id', $role->id)
            ->where('key_name', AadhaarExportAccess::PDF_APPOINTMENT)
            ->update(['value' => 'no_access']);

        $this->artisan('db:seed', ['--class' => AadhaarRevealPermissionSeeder::class]);

        $this->assertSame(
            'no_access',
            PermissionDimension::where('role_id', $role->id)
                ->where('key_name', AadhaarExportAccess::PDF_APPOINTMENT)
                ->value('value')
        );

        $this->assertSame(
            count(AadhaarExportAccess::ALL),
            PermissionDimension::where('role_id', $role->id)
                ->whereIn('key_name', AadhaarExportAccess::ALL)
                ->count()
        );
    }
}
