<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Documents\DocumentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * Aadhaar preservation on the employee edit path (PUT /employee/edit/{id}).
 *
 * This is a different controller method from the appointment update, and it had
 * no guard: EmployeeManagement posts `aadhar_card_no: form.aadharCardNo || null`
 * from a field that hydrates blank (the column is hidden from API responses), so
 * the first edit of any employee erased their Aadhaar — and moved where their
 * documents would be stored, because the folder reference derives from it.
 */
class EmployeeAadhaarTest extends TestCase
{
    use RefreshDatabase;

    private function adminToken(): string
    {
        $admin = User::firstOrCreate(
            ['email' => 'emp-aadhaar-admin@test.local'],
            ['name' => 'Admin', 'password' => 'x', 'role' => 0,
                'company_code' => 'nidhi-impex', 'status' => 0]
        );

        return auth('api')->login($admin);
    }

    private int $made = 0;

    private function makeEmployee(string $aadhaar = '123456789012'): User
    {
        $n = ++$this->made;

        $employee = User::create([
            'name' => 'Rohit Saket', 'email' => "emp-aadhaar-{$n}@test.local", 'password' => 'x',
            'role' => 3, 'emp_code' => "EMP102{$n}", 'company_code' => 'nidhi-impex',
            'unit' => 'Ichapur', 'status' => 0,
        ]);

        $employee->forceFill(['aadhar_card_no' => $aadhaar])->save();

        return $employee;
    }

    private function storedAadhaar(User $user): ?string
    {
        return $user->fresh()->getRawOriginal('aadhar_card_no');
    }

    private function editEmployee(string $token, User $employee, array $payload)
    {
        return $this->withToken($token)
            ->putJson("/api/employee/edit/{$employee->id}", $payload);
    }

    public function test_an_edit_that_omits_aadhaar_preserves_it(): void
    {
        $token = $this->adminToken();
        $employee = $this->makeEmployee();

        $this->editEmployee($token, $employee, ['name' => 'Rohit Kumar Saket'])->assertOk();

        $this->assertSame('123456789012', $this->storedAadhaar($employee));
        $this->assertSame('Rohit Kumar Saket', $employee->fresh()->name);
    }

    public function test_a_null_aadhaar_does_not_erase_it(): void
    {
        $token = $this->adminToken();
        $employee = $this->makeEmployee();

        // Exactly what the employee form used to post on every edit.
        $this->editEmployee($token, $employee, ['aadhar_card_no' => null])->assertOk();

        $this->assertSame('123456789012', $this->storedAadhaar($employee));
    }

    public function test_a_blank_aadhaar_does_not_erase_it(): void
    {
        $token = $this->adminToken();
        $employee = $this->makeEmployee();

        $this->editEmployee($token, $employee, ['aadhar_card_no' => ''])->assertOk();

        $this->assertSame('123456789012', $this->storedAadhaar($employee));
    }

    public function test_a_masked_value_does_not_replace_the_stored_number(): void
    {
        $token = $this->adminToken();
        $employee = $this->makeEmployee();

        $this->editEmployee($token, $employee, ['aadhar_card_no' => 'XXXX XXXX 9012'])->assertOk();

        $this->assertSame('123456789012', $this->storedAadhaar($employee));
    }

    public function test_a_partial_value_does_not_replace_the_stored_number(): void
    {
        $token = $this->adminToken();
        $employee = $this->makeEmployee();

        $this->editEmployee($token, $employee, ['aadhar_card_no' => '1234'])->assertOk();

        $this->assertSame('123456789012', $this->storedAadhaar($employee));
    }

    public function test_a_complete_value_replaces_it_and_is_normalised(): void
    {
        $token = $this->adminToken();
        $employee = $this->makeEmployee();

        $this->editEmployee($token, $employee, ['aadhar_card_no' => '9999 8888 7777'])->assertOk();

        $this->assertSame('999988887777', $this->storedAadhaar($employee));
    }

    public function test_the_response_exposes_the_mask_and_the_presence_flag_only(): void
    {
        $token = $this->adminToken();
        $employee = $this->makeEmployee();

        $response = $this->editEmployee($token, $employee, ['name' => 'Rohit'])->assertOk();

        $response->assertJsonPath('data.aadhaar_masked', 'XXXX XXXX 9012');
        $response->assertJsonPath('data.has_aadhaar', true);
        $response->assertJsonMissingPath('data.aadhar_card_no');
        $this->assertStringNotContainsString('123456789012', $response->getContent());
    }

    public function test_has_aadhaar_is_false_when_nothing_usable_is_stored(): void
    {
        // A partial legacy value masks to "", so the flag is what the UI needs.
        $this->assertFalse($this->makeEmployee('1234')->fresh()->has_aadhaar);
        $this->assertTrue($this->makeEmployee()->fresh()->has_aadhaar);
    }

    public function test_creating_an_employee_normalises_the_number(): void
    {
        $token = $this->adminToken();

        $this->withToken($token)->postJson('/api/employee/store', [
            'name' => 'New Person',
            'email' => 'new-person@test.local',
            // Explicit: an omitted role casts to 0, which this endpoint treats
            // as creating a Super Admin and then demands a password.
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'unit' => 'Ichapur',
            'emp_code' => 'EMP2000',
            'aadhar_card_no' => '1234 5678 9012',
        ])->assertOk();

        $created = User::where('emp_code', 'EMP2000')->firstOrFail();
        $this->assertSame('123456789012', $created->getRawOriginal('aadhar_card_no'));
    }

    public function test_creating_an_employee_never_stores_a_partial_number(): void
    {
        $token = $this->adminToken();

        $this->withToken($token)->postJson('/api/employee/store', [
            'name' => 'Partial Person',
            'email' => 'partial-person@test.local',
            // Explicit: an omitted role casts to 0, which this endpoint treats
            // as creating a Super Admin and then demands a password.
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'unit' => 'Ichapur',
            'emp_code' => 'EMP2001',
            'aadhar_card_no' => '1234',
        ])->assertOk();

        $created = User::where('emp_code', 'EMP2001')->firstOrFail();
        $this->assertNull($created->getRawOriginal('aadhar_card_no'));
    }

    public function test_an_unrelated_edit_leaves_the_document_folder_unchanged(): void
    {
        config(['documents.mask_aadhaar_in_key' => false]);

        $token = $this->adminToken();
        $employee = $this->makeEmployee();
        $before = DocumentService::ownerFolderReference($employee);

        $this->editEmployee($token, $employee, [
            'name' => 'Renamed',
            'aadhar_card_no' => null,
        ])->assertOk();

        $this->assertSame($before, DocumentService::ownerFolderReference($employee->fresh()));
    }

    public function test_the_folder_moves_only_on_an_authorised_replacement(): void
    {
        config(['documents.mask_aadhaar_in_key' => false]);

        $token = $this->adminToken();
        $employee = $this->makeEmployee();

        $this->editEmployee($token, $employee, ['aadhar_card_no' => '999988887777'])->assertOk();

        $this->assertSame(
            '999988887777',
            DocumentService::ownerFolderReference($employee->fresh()),
        );
    }

    public function test_the_change_is_audited_without_the_full_number(): void
    {
        $token = $this->adminToken();
        $employee = $this->makeEmployee();

        $captured = [];
        Log::listen(function ($message) use (&$captured) {
            if ($message->message === 'aadhaar.changed') {
                $captured[] = $message->context;
            }
        });

        $this->editEmployee($token, $employee, ['aadhar_card_no' => '999988887777'])->assertOk();

        $this->assertCount(1, $captured);
        $this->assertSame('replaced', $captured[0]['action']);
        $this->assertTrue($captured[0]['previous_present']);
        $this->assertSame('9012', $captured[0]['previous_last4']);
        $this->assertSame('7777', $captured[0]['new_last4']);

        // The audit entry must not become a second copy of the data.
        $encoded = json_encode($captured);
        $this->assertStringNotContainsString('123456789012', $encoded);
        $this->assertStringNotContainsString('999988887777', $encoded);
    }
}
