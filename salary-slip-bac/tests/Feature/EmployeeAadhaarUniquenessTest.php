<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Aadhaar uniqueness is enforced in the controller (UserController::store /
 * update), not via a DB unique constraint — see migration
 * 2026_07_30_000002_relax_aadhaar_reference_unique, which explicitly walked
 * back a unique index because historical duplicate Aadhaar data legitimately
 * exists and a hard constraint blocked those rows outright. Soft-deleted
 * (is_deleted=1) employees are excluded from the conflict check for the same
 * reason a deleted record shouldn't permanently squat a real person's number.
 */
class EmployeeAadhaarUniquenessTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private function admin(): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Admin {$n}", 'email' => "aadhaar-admin-{$n}@test.local",
            'password' => 'x', 'role' => 1, 'company_code' => 'nidhi-impex',
            'status' => 0, 'is_deleted' => 0,
        ]);
    }

    private function employee(array $overrides = []): User
    {
        $n = ++$this->seq;

        return User::create(array_merge([
            'name' => "Employee {$n}", 'email' => "aadhaar-emp-{$n}@test.local",
            'password' => 'x', 'role' => 3, 'company_code' => 'nidhi-impex',
            'status' => 0, 'is_deleted' => 0,
        ], $overrides));
    }

    public function test_store_rejects_aadhaar_already_used_by_another_active_employee(): void
    {
        $admin = $this->admin();
        $existing = $this->employee(['aadhar_card_no' => '123456789012']);

        $response = $this->withToken(auth('api')->login($admin))
            ->postJson('/api/employee/store', [
                'name' => 'New Hire', 'company_code' => 'nidhi-impex', 'role' => 3,
                'unit' => 'Ichapur', 'aadhar_card_no' => '1234 5678 9012',
            ]);

        $response->assertStatus(422);
        $response->assertJsonPath('status', false);
        $this->assertStringContainsString($existing->name, $response->json('message'));
        // Admin + the one pre-existing employee — the rejected request must not have created a third.
        $this->assertSame(2, User::where('company_code', 'nidhi-impex')->count());
    }

    public function test_store_allows_a_unique_aadhaar(): void
    {
        $admin = $this->admin();
        $this->employee(['aadhar_card_no' => '123456789012']);

        $response = $this->withToken(auth('api')->login($admin))
            ->postJson('/api/employee/store', [
                'name' => 'New Hire', 'company_code' => 'nidhi-impex', 'role' => 3,
                'unit' => 'Ichapur', 'aadhar_card_no' => '987654321098',
            ]);

        $response->assertOk();
        $response->assertJsonPath('status', true);
    }

    public function test_update_rejects_aadhaar_already_used_by_another_active_employee(): void
    {
        $admin = $this->admin();
        $existing = $this->employee(['aadhar_card_no' => '123456789012']);
        $target = $this->employee(['aadhar_card_no' => '111122223333']);

        $response = $this->withToken(auth('api')->login($admin))
            ->putJson("/api/employee/edit/{$target->id}", [
                'aadhar_card_no' => '123456789012',
            ]);

        $response->assertStatus(422);
        $this->assertStringContainsString($existing->name, $response->json('message'));
        $this->assertSame('111122223333', $target->fresh()->getRawOriginal('aadhar_card_no'));
    }

    public function test_update_allows_keeping_employees_own_unchanged_aadhaar(): void
    {
        $admin = $this->admin();
        $target = $this->employee(['aadhar_card_no' => '123456789012']);

        $response = $this->withToken(auth('api')->login($admin))
            ->putJson("/api/employee/edit/{$target->id}", [
                'aadhar_card_no' => '1234 5678 9012',
                'name' => 'Renamed',
            ]);

        $response->assertOk();
        $this->assertSame('Renamed', $target->fresh()->name);
    }

    public function test_aadhaar_belonging_to_a_soft_deleted_employee_can_be_reused(): void
    {
        $admin = $this->admin();
        $this->employee(['aadhar_card_no' => '123456789012', 'is_deleted' => 1]);

        $response = $this->withToken(auth('api')->login($admin))
            ->postJson('/api/employee/store', [
                'name' => 'New Hire', 'company_code' => 'nidhi-impex', 'role' => 3,
                'unit' => 'Ichapur', 'aadhar_card_no' => '123456789012',
            ]);

        $response->assertOk();
        $response->assertJsonPath('status', true);
    }
}
