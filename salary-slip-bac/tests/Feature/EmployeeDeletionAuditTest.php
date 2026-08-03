<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * That deleting a user leaves a record of it.
 *
 * User rows are deleted outright — no SoftDeletes trait — so the row is the
 * only evidence the account existed. Production went 339 users to 338 during an
 * audit window, one of three role=1 admins, and audit_logs' last entry predates
 * it by hours. Nobody can say which account, who removed it, or from where.
 */
class EmployeeDeletionAuditTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = $this->makeUser(['role' => 1, 'name' => 'Deleting Admin']);
    }

    #[Test]
    public function deleting_an_employee_writes_an_audit_entry(): void
    {
        $victim = $this->makeUser(['name' => 'Removed Person', 'emp_code' => 'EMP9001']);

        $this->withToken(auth('api')->login($this->admin))
            ->getJson("/api/employee/delete/{$victim->id}")
            ->assertOk();

        $this->assertDatabaseMissing('users', ['id' => $victim->id]);

        $entry = AuditLog::where('module', 'employees')->where('action', 'DELETE')->latest('id')->first();

        $this->assertNotNull($entry, 'The account is gone and nothing recorded it.');
        $this->assertSame($this->admin->id, $entry->user_id, 'The trail must name who did it.');
        $this->assertSame($victim->id, $entry->old_value['id']);
        $this->assertSame('Removed Person', $entry->old_value['name']);
        $this->assertSame('EMP9001', $entry->old_value['emp_code']);
    }

    #[Test]
    public function the_snapshot_carries_no_sensitive_fields(): void
    {
        $victim = $this->makeUser([
            'aadhar_card_no' => '123456789012',
            'bank_account_no' => '00112233445566',
        ]);

        $this->withToken(auth('api')->login($this->admin))
            ->getJson("/api/employee/delete/{$victim->id}")
            ->assertOk();

        $entry = AuditLog::where('action', 'DELETE')->latest('id')->first();
        $encoded = json_encode($entry->old_value);

        // An audit trail is read by more people than the record was.
        $this->assertStringNotContainsString('123456789012', $encoded);
        $this->assertStringNotContainsString('00112233445566', $encoded);
        $this->assertArrayNotHasKey('password', $entry->old_value);
    }

    #[Test]
    public function bulk_deletion_records_every_account_not_just_a_count(): void
    {
        $victims = collect(range(1, 3))->map(fn ($n) => $this->makeUser(['name' => "Bulk {$n}"]));

        $this->withToken(auth('api')->login($this->admin))
            ->postJson('/api/employee/delete-multiple', ['ids' => $victims->pluck('id')->all()])
            ->assertOk();

        $entries = AuditLog::where('action', 'DELETE')->where('module', 'employees')->get();

        $this->assertCount(3, $entries, 'A bulk delete must not collapse to one entry.');
        $this->assertEqualsCanonicalizing(
            $victims->pluck('id')->all(),
            $entries->pluck('old_value.id')->all()
        );
    }

    #[Test]
    public function a_refused_deletion_records_nothing(): void
    {
        $otherCompany = $this->makeUser(['company_code' => 'elsewhere']);
        $companyAdmin = $this->makeUser(['role' => 1, 'company_code' => 'acme']);

        $this->withToken(auth('api')->login($companyAdmin))
            ->getJson("/api/employee/delete/{$otherCompany->id}");

        $this->assertDatabaseHas('users', ['id' => $otherCompany->id]);
        $this->assertSame(0, AuditLog::where('action', 'DELETE')->count());
    }

    private function makeUser(array $attributes): User
    {
        return User::create(array_merge([
            'name' => 'Deletion Subject', 'email' => uniqid('del-', true) . '@example.test',
            'password' => 'password', 'emp_code' => strtoupper(substr(uniqid(), -8)),
            'role' => 3, 'company_code' => 'acme', 'status' => 0, 'is_deleted' => 0,
        ], $attributes));
    }
}
