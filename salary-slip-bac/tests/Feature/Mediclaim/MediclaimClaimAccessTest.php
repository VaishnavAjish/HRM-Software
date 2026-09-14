<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * MediclaimClaim::scopeVisibleTo() 404-concealment: an employee may read
 * their own claim, but a colleague's (or another company's) claim must 404,
 * never 403 — matching Ticket::scopeVisibleTo()'s house convention (see
 * ClaimController@show / MediclaimClaim.php's scopeVisibleTo docblock).
 */
class MediclaimClaimAccessTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function an_employee_can_read_their_own_claim(): void
    {
        $employee = $this->makeUser('Employee A');
        $this->grant($employee, ['self.mediclaim.claim.read']);

        $claim = MediclaimClaim::create([
            'company_code' => 'nidhi-impex',
            'employee_user_id' => $employee->id,
            'status' => MediclaimClaim::STATUS_DRAFT,
        ]);

        $this->actingAsUser($employee)
            ->getJson("/api/v1/mediclaim/claims/{$claim->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $claim->id)
            ->assertJsonPath('data.employee_user_id', $employee->id);
    }

    #[Test]
    public function an_employee_cannot_read_a_colleagues_claim_and_gets_404_not_403(): void
    {
        $employee = $this->makeUser('Employee A');
        $colleague = $this->makeUser('Employee B');
        $this->grant($employee, ['self.mediclaim.claim.read']);

        $colleagueClaim = MediclaimClaim::create([
            'company_code' => 'nidhi-impex',
            'employee_user_id' => $colleague->id,
            'status' => MediclaimClaim::STATUS_DRAFT,
        ]);

        $this->actingAsUser($employee)
            ->getJson("/api/v1/mediclaim/claims/{$colleagueClaim->id}")
            ->assertNotFound()
            ->assertJsonPath('error.code', 'NOT_FOUND');
    }

    #[Test]
    public function an_employee_cannot_read_another_companys_claim_and_it_also_404s(): void
    {
        $employee = $this->makeUser('Employee A', ['company_code' => 'nidhi-impex']);
        $otherCompanyEmployee = $this->makeUser('Employee C', ['company_code' => 'silver-star']);
        $this->grant($employee, ['self.mediclaim.claim.read']);

        $otherCompanyClaim = MediclaimClaim::create([
            'company_code' => 'silver-star',
            'employee_user_id' => $otherCompanyEmployee->id,
            'status' => MediclaimClaim::STATUS_DRAFT,
        ]);

        $this->actingAsUser($employee)
            ->getJson("/api/v1/mediclaim/claims/{$otherCompanyClaim->id}")
            ->assertNotFound()
            ->assertJsonPath('error.code', 'NOT_FOUND');
    }

    #[Test]
    public function a_nonexistent_claim_id_also_404s_the_same_way(): void
    {
        $employee = $this->makeUser('Employee A');
        $this->grant($employee, ['self.mediclaim.claim.read']);

        $this->actingAsUser($employee)
            ->getJson('/api/v1/mediclaim/claims/999999')
            ->assertNotFound()
            ->assertJsonPath('error.code', 'NOT_FOUND');
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-access-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCA{$number}",
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'unit' => 'Surat',
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }

    private function grant(User $user, array $codes): void
    {
        foreach ($codes as $code) {
            $parts = explode('.', $code);
            $action = array_pop($parts);
            $permission = Permission::query()->firstOrCreate(['code' => $code], [
                'name' => $code,
                'resource' => implode('.', $parts),
                'action' => $action,
                'level' => 'ACTION',
                'is_sensitive' => str_contains($code, 'decide'),
                'is_active' => true,
            ]);
            DB::table('user_permissions')->updateOrInsert(
                ['user_id' => $user->id, 'permission_id' => $permission->id],
                ['is_denied' => false],
            );
        }
    }

    private function actingAsUser(User $user): static
    {
        return $this->withToken(auth('api')->login($user));
    }
}
