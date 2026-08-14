<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * S8: attendance bulk import is bounded to 500 rows per request; an oversized
 * request is rejected with 422 and writes nothing.
 *
 * Runs on the disposable database only (see phpunit.disposable.xml).
 */
class AttendanceBulkImportBoundsTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::create([
            'name' => 'A' . Str::random(5),
            'email' => Str::lower(Str::random(10)) . '@attn.test',
            'password' => 'x',
            'role' => 0, // super admin bypasses permission enforcement
            'company_code' => 'nidhi-impex',
            'emp_code' => strtoupper(Str::random(8)),
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }

    private function rows(int $count): array
    {
        // emp_codes that match no employee — each row is well-formed but is
        // reported as skipped, so the test exercises the size bound without
        // provisioning hundreds of users.
        return array_map(fn ($i) => [
            'emp_code' => 'NOEMP' . $i,
            'days' => ['1' => 'P'],
        ], range(1, $count));
    }

    public function test_accepts_exactly_500_rows(): void
    {
        $admin = $this->admin();

        $this->withToken(auth('api')->login($admin))
            ->postJson('/api/attendance/import', [
                'company_code' => 'nidhi-impex',
                'month' => 6,
                'year' => 2026,
                'rows' => $this->rows(500),
            ])
            ->assertOk();
    }

    public function test_rejects_501_rows_without_writing(): void
    {
        $admin = $this->admin();

        $this->withToken(auth('api')->login($admin))
            ->postJson('/api/attendance/import', [
                'company_code' => 'nidhi-impex',
                'month' => 6,
                'year' => 2026,
                'rows' => $this->rows(501),
            ])
            ->assertStatus(422);

        $this->assertDatabaseCount('attendances', 0);
        $this->assertDatabaseCount('upload_batches', 0);
    }

    public function test_rejects_malformed_days_structure(): void
    {
        $admin = $this->admin();

        $this->withToken(auth('api')->login($admin))
            ->postJson('/api/attendance/import', [
                'company_code' => 'nidhi-impex',
                'month' => 6,
                'year' => 2026,
                'rows' => [['emp_code' => 'X1', 'days' => 'not-an-array']],
            ])
            ->assertStatus(422);

        $this->assertDatabaseCount('attendances', 0);
    }
}
