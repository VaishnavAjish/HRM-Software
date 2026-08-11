<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Unit;
use App\Models\User;
use App\Services\Authorization\AuthorizedUserQuery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * A tripwire on the dormant tier-2 unit assumption.
 *
 * Sixteen query predicates and eight object checks scope on the actor's unit,
 * every one of them behind `role === 2`, and this database has no tier-2
 * account. They all read users.unit as a single value, so an actor belonging to
 * two units would silently see only one of them — and nothing in the codebase
 * says so.
 *
 * These tests do not fix that. They make it impossible to activate it by
 * accident: the first tier-2 account created is the moment the limitation
 * becomes real, and this fails loudly at that point rather than quietly
 * under-scoping someone's data.
 */
class LegacyUnitScopeAssumptionTest extends TestCase
{
    use RefreshDatabase;

    public function test_no_tier_two_account_exists(): void
    {
        /*
         * The guard. If this fails, somebody has created a unit administrator
         * and the 16 scalar-unit predicates are now live — read
         * LegacyUnitScopeAssumptionTest and units:report before proceeding.
         * Multi-unit membership exists in user_units, but none of those
         * predicates consult it.
         */
        $this->assertSame(
            0,
            User::query()->where('role', 2)->count(),
            "A tier-2 (unit administrator) account now exists.\n"
            . "Unit-based authorization scope reads users.unit as ONE value:\n"
            . "  - 16 query predicates (AuthorizedUserQuery, UserDirectory, Ticket, "
            . "AdminController, ScopesCompany, SalariesSlip, DocumentController, UploadBatch, UserController)\n"
            . "  - 8 object-level checks\n"
            . "A user_units membership of several units will NOT widen them.\n"
            . "Migrate those predicates to canonical unit membership, or confirm "
            . "that this actor administers exactly one unit."
        );
    }

    public function test_the_scalar_assumption_is_what_the_scope_actually_applies(): void
    {
        // Demonstrates the limitation concretely rather than describing it, so
        // whoever reads this after the guard trips can see the exact shape.
        $company = Company::query()->firstOrCreate(
            ['code' => 'nidhi-impex'],
            ['name' => 'Nidhi Impex', 'is_active' => true],
        );

        $first = Unit::query()->firstOrCreate(
            ['company_id' => $company->id, 'name' => 'Shreeji'],
            ['code' => 'shreeji', 'is_active' => true],
        );
        $second = Unit::query()->firstOrCreate(
            ['company_id' => $company->id, 'name' => 'Ichapur'],
            ['code' => 'ichapur', 'is_active' => true],
        );

        $unitAdmin = User::create([
            'name' => 'Unit Admin', 'email' => 'unitadmin@scope.local', 'password' => 'secret1234',
            'emp_code' => 'S-UA', 'role' => 2, 'company_code' => 'nidhi-impex',
            'unit' => 'Shreeji', 'status' => 0,
        ]);

        // Membership in both units, which is what the canonical model supports.
        foreach ([$first, $second] as $unit) {
            DB::table('user_units')->insert([
                'user_id' => $unitAdmin->id, 'unit_id' => $unit->id,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        foreach (['Shreeji', 'Ichapur'] as $index => $unitName) {
            User::create([
                'name' => 'Worker ' . $index, 'email' => "worker{$index}@scope.local",
                'password' => 'secret1234', 'emp_code' => 'S-W' . $index, 'role' => 3,
                'company_code' => 'nidhi-impex', 'unit' => $unitName, 'status' => 0,
            ]);
        }

        $visible = app(AuthorizedUserQuery::class)
            ->apply(User::query(), $unitAdmin)
            ->whereIn('emp_code', ['S-W0', 'S-W1'])
            ->pluck('unit')
            ->all();

        // One unit, not both: the pivot is ignored by this predicate entirely.
        $this->assertSame(['Shreeji'], $visible);
    }
}
