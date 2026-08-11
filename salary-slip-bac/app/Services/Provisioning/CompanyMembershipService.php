<?php

namespace App\Services\Provisioning;

use App\Models\User;
use App\Services\Authorization\SchemaSupport;
use App\Support\CompanyMembership;
use Illuminate\Support\Facades\DB;

/**
 * Writes company membership in both places, together, or in neither.
 *
 * user_companies is the normalised truth; users.company_code is the CSV every
 * scope check still reads. Until authorization moves onto the pivot they are two
 * representations of one fact, and a write that updates one and not the other
 * produces an account that appears in the admin UI under one company and is
 * scoped to another. Both writes happen inside the caller's transaction.
 *
 * The legacy string is always regenerated from the selected companies rather
 * than accepted from the request. A client-supplied CSV is how "Nidhi Impex,
 * Silver Star" — display names, not codes — ended up in that column, matching no
 * scope query at all.
 */
class CompanyMembershipService
{
    /** Codes a request may send that mean "no company scope", not a company. */
    private const SENTINELS = ['all', 'all-companies'];

    public function available(): bool
    {
        return SchemaSupport::hasTable('companies') && SchemaSupport::hasTable('user_companies');
    }

    /**
     * Every company an actor may file an account into.
     *
     * A super administrator sees all of them. Anybody else sees the companies
     * their own account is scoped to, because filing a user into a company you
     * do not administer is the scope boundary crossed at creation time.
     *
     * @return list<array{id:int,code:string,name:string}>
     */
    public function optionsFor(?User $actor): array
    {
        if (! $this->available()) {
            return [];
        }

        $query = DB::table('companies')->orderBy('name');

        if (SchemaSupport::hasColumn('companies', 'is_active')) {
            $query->where('is_active', true);
        }

        if ($actor !== null && (int) $actor->role !== 0) {
            /*
             * Fail closed.
             *
             * This applied the filter only when the actor resolved to at least
             * one company, so an account whose company_code was blank — or held
             * nothing but the "all-companies" sentinel, which parse() strips —
             * fell through to an unfiltered query and was offered every tenant
             * in the system. An actor with no companies administers no
             * companies; that is not the same as administering all of them.
             */
            $query->whereIn('code', CompanyMembership::parse($actor->company_code) ?: ['__none__']);
        }

        return $query->get(['id', 'code', 'name'])
            ->map(static fn ($row) => [
                'id' => (int) $row->id,
                'code' => (string) $row->code,
                'name' => (string) $row->name,
            ])->all();
    }

    /**
     * The company an employee-lifecycle form is filing into.
     *
     * The tenant is decided here, from the actor, and never taken on trust from
     * the body. users.company_code is what ScopeMatcher, AuthorizedUserQuery and
     * the authorization cache partition on, so a request that names a company is
     * asking to place a record inside a tenant — a question about authorization,
     * not about the person being described.
     *
     * A canonical id is preferred and a legacy code still accepted, because the
     * trial and appointment forms predate companies being records. Both are
     * checked against the same list: the active companies this actor is scoped
     * to. An actor with exactly one company needs to send nothing at all.
     *
     * @throws ProvisioningException
     */
    public function resolveCodeFor(User $actor, ?int $companyId, ?string $companyCode): string
    {
        $allowed = $this->optionsFor($actor);

        if ($allowed === []) {
            throw new ProvisioningException(
                'NO_ASSIGNABLE_COMPANY',
                'Your account is not assigned to any active company, so this record has nowhere to go.',
                422
            );
        }

        if ($companyId !== null) {
            foreach ($allowed as $company) {
                if ($company['id'] === $companyId) {
                    return $company['code'];
                }
            }

            throw new ProvisioningException(
                'COMPANY_NOT_ASSIGNABLE',
                'That company is outside the companies you may file records into.',
                403
            );
        }

        $requested = trim((string) $companyCode);

        // A blank or sentinel value is not a choice. With one company available
        // that is unambiguous; with several the caller has to say which.
        if ($requested === '' || in_array($requested, self::SENTINELS, true)) {
            if (count($allowed) === 1) {
                return $allowed[0]['code'];
            }

            throw new ProvisioningException(
                'COMPANY_REQUIRED',
                'Choose the company this record belongs to.',
                422
            );
        }

        foreach ($allowed as $company) {
            if ($company['code'] === $requested) {
                return $company['code'];
            }
        }

        throw new ProvisioningException(
            'COMPANY_NOT_ASSIGNABLE',
            'That company is outside the companies you may file records into.',
            403
        );
    }

    /** @return list<int> */
    public function companyIdsOf(User $user): array
    {
        if (! $this->available()) {
            return [];
        }

        return DB::table('user_companies')
            ->where('user_id', $user->id)
            ->pluck('company_id')
            ->map(static fn ($id) => (int) $id)
            ->values()
            ->all();
    }

    /**
     * The codes behind a set of company ids, in the order the database holds.
     *
     * An id matching no company is dropped here and reported by validation
     * upstream; inventing a code for it would silently widen a scope.
     *
     * @return list<string>
     */
    public function codesForIds(array $companyIds): array
    {
        if ($companyIds === [] || ! $this->available()) {
            return [];
        }

        return DB::table('companies')
            ->whereIn('id', array_map('intval', $companyIds))
            ->pluck('code')
            ->map(static fn ($code) => (string) $code)
            ->values()
            ->all();
    }

    /** @return list<int> */
    public function idsForCodes(array $codes): array
    {
        if ($codes === [] || ! $this->available()) {
            return [];
        }

        return DB::table('companies')
            ->whereIn('code', $codes)
            ->pluck('id')
            ->map(static fn ($id) => (int) $id)
            ->values()
            ->all();
    }

    /**
     * Replace a user's membership with exactly these companies.
     *
     * Called only when the caller actually supplied a selection. A role change
     * that says nothing about companies must leave membership alone — promoting
     * an employee to administrator is not a statement about which companies they
     * belong to, and treating an absent field as an empty set would strip them.
     *
     * @param list<int> $companyIds
     */
    public function sync(User $user, array $companyIds): void
    {
        $codes = $this->codesForIds($companyIds);

        $user->company_code = CompanyMembership::serialize($codes);
        $user->save();

        $this->writePivot($user, $companyIds);
    }

    /**
     * Bring the pivot in line with whatever users.company_code already says.
     *
     * This is the path for records that arrive with a company but no company
     * picker — a trial form, an appointment, a bulk import row. The legacy value
     * is authoritative there and is left untouched; only the pivot is filled in,
     * so a flow that never learned about companies still produces a user whose
     * membership is queryable.
     */
    public function syncFromLegacyCode(User $user): void
    {
        if (! $this->available()) {
            return;
        }

        $codes = array_values(array_diff(
            CompanyMembership::parse($user->company_code),
            self::SENTINELS
        ));

        $this->writePivot($user, $this->idsForCodes($codes));
    }

    /** @param list<int> $companyIds */
    private function writePivot(User $user, array $companyIds): void
    {
        if (! $this->available()) {
            return;
        }

        $companyIds = array_values(array_unique(array_map('intval', $companyIds)));

        DB::table('user_companies')
            ->where('user_id', $user->id)
            ->when($companyIds !== [], fn ($query) => $query->whereNotIn('company_id', $companyIds))
            ->delete();

        if ($companyIds === []) {
            return;
        }

        $held = DB::table('user_companies')
            ->where('user_id', $user->id)
            ->pluck('company_id')
            ->map(static fn ($id) => (int) $id)
            ->all();

        $rows = [];

        foreach (array_diff($companyIds, $held) as $companyId) {
            $rows[] = [
                'user_id' => $user->id,
                'company_id' => $companyId,
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }

        if ($rows !== []) {
            DB::table('user_companies')->insertOrIgnore($rows);
        }
    }
}
