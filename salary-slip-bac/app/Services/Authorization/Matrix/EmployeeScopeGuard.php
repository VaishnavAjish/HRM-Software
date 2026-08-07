<?php

namespace App\Services\Authorization\Matrix;

use App\Models\User;

/**
 * May this actor operate on this employee record?
 *
 * Business permission and data scope are different questions. `hr.asset.allocate`
 * says the actor may allocate assets; it says nothing about *which* employees
 * they may allocate them to. Several HR write endpoints validated their target
 * only with `exists:users,id`, which proves an employee exists and nothing about
 * who is allowed to touch it — so an actor scoped to one company could allocate
 * assets to, and record a resignation against, employees of another.
 *
 * The rules are taken from the company filtering UserController::index already
 * applies to the employee list, so a target reachable through this guard is
 * exactly a target the actor could already see. That makes it a compatibility
 * layer, not a new policy: it reports COMPAT rather than CANONICAL, because
 * ScopeMatcher is still not reached without policy records.
 */
class EmployeeScopeGuard
{
    /** Not canonical scope — mirrors existing legacy company semantics. */
    public const MODE = 'COMPAT';

    public const ALLOWED = 'ALLOWED';
    public const DENIED_COMPANY = 'DENIED_COMPANY';
    public const DENIED_UNIT = 'DENIED_UNIT';
    public const DENIED_NO_ACTOR = 'DENIED_NO_ACTOR';

    public function allows(?User $actor, ?User $target): bool
    {
        return $this->check($actor, $target) === self::ALLOWED;
    }

    /** @return self::ALLOWED|self::DENIED_COMPANY|self::DENIED_UNIT|self::DENIED_NO_ACTOR */
    public function check(?User $actor, ?User $target): string
    {
        if ($actor === null) {
            return self::DENIED_NO_ACTOR;
        }

        if ($target === null) {
            // A missing target is not a scope decision; callers answer 404.
            return self::ALLOWED;
        }

        if ($actor->isSuperAdmin() || (int) $actor->role === 0) {
            return self::ALLOWED;
        }

        $actorCompanies = $this->companies($actor);

        if ($this->isGlobalCompanySet($actorCompanies)) {
            return self::ALLOWED;
        }

        $targetCompany = trim((string) $target->company_code);

        if ($actorCompanies === [] || ($targetCompany !== '' && ! in_array($targetCompany, $actorCompanies, true))) {
            return self::DENIED_COMPANY;
        }

        // Role 2 is additionally confined to its own unit, matching the employee
        // list. Other roles are company-scoped only.
        if ((int) $actor->role === 2) {
            $actorUnit = trim((string) $actor->unit);
            $targetUnit = trim((string) $target->unit);

            if ($actorUnit !== '' && $targetUnit !== '' && $actorUnit !== $targetUnit) {
                return self::DENIED_UNIT;
            }
        }

        return self::ALLOWED;
    }

    /**
     * May the actor operate on a record belonging to this company/unit?
     *
     * Company-bound records — an asset, a resignation — need the same test as an
     * employee, because a route id is no more proof of authorization than a
     * `user_id` is. Shares the actor rules above so a record and its employee
     * cannot disagree about who may touch them.
     */
    public function allowsCompany(?User $actor, ?string $companyCode, ?string $unit = null): string
    {
        if ($actor === null) {
            return self::DENIED_NO_ACTOR;
        }

        if ($actor->isSuperAdmin() || (int) $actor->role === 0) {
            return self::ALLOWED;
        }

        $actorCompanies = $this->companies($actor);

        if ($this->isGlobalCompanySet($actorCompanies)) {
            return self::ALLOWED;
        }

        // A record with no company recorded predates company tagging; refusing it
        // would break existing data rather than protect anything.
        $recordCompanies = array_values(array_filter(array_map('trim', explode(',', (string) $companyCode))));

        if ($recordCompanies === []) {
            return self::ALLOWED;
        }

        // Records are tagged from the creating actor's own company_code, so a
        // multi-company admin stamps real assets and resignations with a list
        // such as "nidhi-impex,silver-star". Such a record genuinely belongs to
        // both, so any overlap grants access — exact string matching here would
        // lock single-company admins out of records they manage today.
        if ($actorCompanies === [] || array_intersect($recordCompanies, $actorCompanies) === []) {
            return self::DENIED_COMPANY;
        }

        if ((int) $actor->role === 2) {
            $actorUnit = trim((string) $actor->unit);
            $recordUnit = trim((string) $unit);

            if ($actorUnit !== '' && $recordUnit !== '' && $actorUnit !== $recordUnit) {
                return self::DENIED_UNIT;
            }
        }

        return self::ALLOWED;
    }

    /** Companies the actor holds, normalised. */
    public function companies(?User $actor): array
    {
        if ($actor === null) {
            return [];
        }

        return array_values(array_filter(array_map(
            'trim',
            explode(',', (string) $actor->company_code)
        )));
    }

    /**
     * "Both Companies" means every company the actor is authorised for, which for
     * an all-companies account is genuinely all of them — but that marker comes
     * from the actor's own record, never from a request parameter.
     */
    public function isGlobalCompanySet(array $companies): bool
    {
        foreach ($companies as $company) {
            if (in_array($company, ['all', 'all-companies'], true)) {
                return true;
            }
        }

        return false;
    }

    public function reasonFor(string $result): string
    {
        return match ($result) {
            self::DENIED_COMPANY => 'The employee belongs to a company outside your access.',
            self::DENIED_UNIT => 'The employee belongs to a different unit.',
            self::DENIED_NO_ACTOR => 'Authentication required.',
            default => 'Allowed.',
        };
    }
}
