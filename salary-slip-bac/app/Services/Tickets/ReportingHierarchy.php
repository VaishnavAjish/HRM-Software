<?php

namespace App\Services\Tickets;

use App\Models\ReportingRelationship;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * Resolves and validates the employee reporting chain.
 *
 * The chain is never hard-coded. It is walked from the employee upward through
 * whatever primary reporting lines exist, and it always terminates at a Super
 * Admin (role 0) — the final authority for escalation. If the configured lines
 * run out before reaching one, a Super Admin is appended so a ticket can never
 * escalate into a dead end and sit unowned.
 */
class ReportingHierarchy
{
    /**
     * Hard stop on how far the walk will follow reporting lines.
     *
     * The cycle guard below already prevents infinite loops; this is the second
     * line of defence against a pathological chain (a thousand-deep line built
     * by a bad import) turning one ticket creation into a thousand queries.
     */
    public const MAX_DEPTH = 20;

    /** The employee's current primary manager, or null. */
    public function managerFor(User $employee, ?Carbon $asOf = null): ?User
    {
        $asOf ??= now();

        $relationship = ReportingRelationship::query()
            ->active()
            ->primary()
            ->inForceOn($asOf)
            ->where('employee_user_id', $employee->id)
            ->with('manager')
            ->first();

        $manager = $relationship?->manager;

        // A manager who has left is not an authority. Skipping them here means
        // the walk continues past the gap instead of stopping at someone who
        // will never respond.
        return $manager && $this->isEligibleManager($manager) ? $manager : null;
    }

    /**
     * The full escalation chain above an employee, nearest authority first,
     * always ending at a Super Admin.
     *
     * @return list<User>
     */
    public function chainFor(User $employee, ?Carbon $asOf = null): array
    {
        $asOf ??= now();

        $chain = [];
        $seen = [$employee->id => true];
        $current = $employee;

        for ($depth = 0; $depth < self::MAX_DEPTH; $depth++) {
            $manager = $this->managerFor($current, $asOf);

            if (! $manager) {
                break;
            }

            // Cycle guard. A → B → A is prevented on write, but a chain built
            // before that validation existed (or edited directly in the
            // database) must not hang the escalation sweep.
            if (isset($seen[$manager->id])) {
                break;
            }

            $seen[$manager->id] = true;
            $chain[] = $manager;
            $current = $manager;

            // Super Admin is the top. Nothing escalates past it.
            if ((int) $manager->role === 0) {
                return $chain;
            }
        }

        // The configured line stopped short of a Super Admin, so append one.
        // Without this a ticket could escalate to its last configured manager
        // and then have nowhere left to go.
        $finalAuthority = $this->finalAuthorityFor($employee, $seen);

        if ($finalAuthority) {
            $chain[] = $finalAuthority;
        }

        return $chain;
    }

    /**
     * A serialisable copy of the chain, stored on the ticket at creation.
     *
     * Names and roles are copied rather than referenced because this is a
     * record of who was responsible at the time. Re-deriving it later would
     * rewrite history the moment somebody's manager or job title changed.
     *
     * @return array<int, array<string, mixed>>
     */
    public function snapshotFor(User $employee, ?Carbon $asOf = null): array
    {
        $snapshot = [];

        foreach ($this->chainFor($employee, $asOf) as $index => $manager) {
            $snapshot[] = [
                'level' => $index + 1,
                'user_id' => $manager->id,
                'name' => $manager->name,
                'emp_code' => $manager->emp_code,
                'role' => (int) $manager->role,
                'department' => $manager->department,
                'company_code' => $manager->company_code,
                'unit' => $manager->unit,
                'is_final_authority' => (int) $manager->role === 0,
            ];
        }

        return $snapshot;
    }

    /**
     * Whether `$manager` may be set as `$employee`'s manager.
     *
     * Returns null when allowed, otherwise the reason to show the caller.
     * All four rules from the specification are enforced here rather than in a
     * controller, so every path that writes a reporting line gets them.
     */
    public function validateAssignment(User $employee, User $manager): ?string
    {
        if ($employee->id === $manager->id) {
            return 'An employee cannot report to themselves.';
        }

        if (! $this->isEligibleManager($manager)) {
            return 'That manager account is inactive and cannot be assigned.';
        }

        if (! $this->sharesCompany($employee, $manager)) {
            return 'A manager must belong to the same company as the employee.';
        }

        // Circular: the proposed manager must not already sit below the
        // employee. Walking down from the employee is bounded by MAX_DEPTH.
        if ($this->reportsInto($manager, $employee)) {
            return 'That would create a circular reporting line — the manager already reports to this employee.';
        }

        return null;
    }

    /** True when `$candidate` sits anywhere beneath `$ancestor`. */
    public function reportsInto(User $candidate, User $ancestor): bool
    {
        $seen = [$candidate->id => true];
        $current = $candidate;

        for ($depth = 0; $depth < self::MAX_DEPTH; $depth++) {
            $relationship = ReportingRelationship::query()
                ->active()
                ->primary()
                ->where('employee_user_id', $current->id)
                ->first();

            if (! $relationship) {
                return false;
            }

            if ((int) $relationship->manager_user_id === (int) $ancestor->id) {
                return true;
            }

            if (isset($seen[$relationship->manager_user_id])) {
                return false; // pre-existing cycle; not this assignment's fault
            }

            $seen[$relationship->manager_user_id] = true;
            $current = $relationship->manager ?? User::find($relationship->manager_user_id);

            if (! $current) {
                return false;
            }
        }

        return false;
    }

    /** Active, not soft-deleted, and holds a staff role that can act on tickets. */
    public function isEligibleManager(User $user): bool
    {
        return ! $user->is_deleted
            && in_array((string) $user->status, ['0', 'ACTIVE'], true)
            && in_array((int) $user->role, [0, 1, 2], true);
    }

    /**
     * The Super Admin that terminates this employee's chain.
     *
     * Preference goes to one scoped to the employee's own company so a ticket
     * lands with someone who has context; otherwise any Super Admin, since
     * role 0 sees every company anyway.
     */
    private function finalAuthorityFor(User $employee, array $exclude = []): ?User
    {
        $base = User::query()
            ->where('role', 0)
            ->where('is_deleted', 0)
            ->whereIn('status', ['0', 'ACTIVE'])
            ->whereNotIn('id', array_keys($exclude));

        $companies = $this->companiesOf($employee);

        if ($companies !== []) {
            $scoped = (clone $base)
                ->where(function ($query) use ($companies) {
                    foreach ($companies as $code) {
                        $query->orWhere('company_code', 'like', '%'.$code.'%');
                    }
                })
                ->orderBy('id')
                ->first();

            if ($scoped) {
                return $scoped;
            }
        }

        return $base->orderBy('id')->first();
    }

    /**
     * Company match, tolerant of the comma lists multi-company admins carry
     * and of the 'all'/'all-companies' wildcard — the same convention
     * Ticket::scopeVisibleTo uses.
     */
    private function sharesCompany(User $employee, User $manager): bool
    {
        $managerCompanies = $this->companiesOf($manager);

        if (array_intersect(['all', 'all-companies'], $managerCompanies)) {
            return true;
        }

        // A Super Admin is company-agnostic by definition.
        if ((int) $manager->role === 0) {
            return true;
        }

        $employeeCompanies = $this->companiesOf($employee);

        if ($employeeCompanies === [] || $managerCompanies === []) {
            return false;
        }

        return array_intersect($employeeCompanies, $managerCompanies) !== [];
    }

    /** @return list<string> */
    private function companiesOf(User $user): array
    {
        return array_values(array_filter(array_map(
            'trim',
            explode(',', (string) $user->company_code)
        )));
    }
}
