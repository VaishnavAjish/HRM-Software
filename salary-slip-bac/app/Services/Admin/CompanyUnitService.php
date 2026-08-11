<?php

namespace App\Services\Admin;

use App\Models\Company;
use App\Models\Unit;
use App\Models\User;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\SchemaSupport;
use App\Services\Provisioning\ProvisioningException;
use App\Support\AuditLogger;
use App\Support\CompanyMembership;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Company and unit master data, and the rules that stop it destroying anything.
 *
 * This is configuration that changes who can see what. Three consequences drive
 * the whole class:
 *
 * 1. `code` is the tenant key. users.company_code holds it, ScopeMatcher and the
 *    authorization cache partition on it. Renaming `silver-star` to `silverstar`
 *    would leave 334 accounts scoped to a company that no longer answers to that
 *    name. So the code is editable only while nothing depends on it.
 *
 * 2. Deleting is refused whenever anything points at the record — users, units,
 *    or a legacy company_code string. Cascading would take real accounts with it,
 *    and there is no undo for that.
 *
 * 3. Deactivating is the intended alternative. An inactive company keeps its
 *    history and stops being offered for new assignments, which is what
 *    "retired" actually means here.
 *
 * Usage counts come from the normalised pivots AND from the legacy free-text
 * columns, reported separately. Only the pivot is the future, but the legacy
 * value is what authorization reads today, so a delete guard that ignored it
 * would happily remove a company 333 people are scoped to.
 */
class CompanyUnitService
{
    public const MODULE = 'access-control-company-units';

    public function __construct(private readonly AuthorizationCache $cache)
    {
    }

    /* ------------------------------------------------------------ companies */

    public function companies(array $filters = []): array
    {
        $query = Company::query()->orderBy('name');

        if (($search = trim((string) ($filters['search'] ?? ''))) !== '') {
            $query->where(function ($inner) use ($search) {
                $inner->where('name', 'like', "%{$search}%")->orWhere('code', 'like', "%{$search}%");
            });
        }

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('is_active', $status === 'ACTIVE');
        }

        return $query->get()->map(fn (Company $company) => $this->presentCompany($company))->all();
    }

    public function presentCompany(Company $company): array
    {
        $usage = $this->companyUsage($company);

        return [
            'id' => (int) $company->id,
            'name' => $company->name,
            'code' => $company->code,
            'isActive' => (bool) $company->is_active,
            'units' => Unit::query()->where('company_id', $company->id)->count(),
            'assignedUsers' => $usage['members'],
            'legacyUsers' => $usage['legacy'],
            // The browser must not re-derive this: it is the same question the
            // update guard answers, and two answers would let the form offer an
            // edit the API refuses.
            'codeLocked' => $this->companyInUse($company),
            'createdAt' => $company->created_at,
        ];
    }

    public function createCompany(array $data, User $actor): Company
    {
        $code = $this->normaliseCode($data['code'] ?? '');

        $company = DB::transaction(function () use ($data, $code) {
            return Company::query()->create([
                'name' => trim((string) $data['name']),
                'code' => $code,
                'is_active' => (bool) ($data['isActive'] ?? true),
            ]);
        });

        $this->audit($actor, 'COMPANY_CREATED', null, $this->snapshotCompany($company));

        return $company;
    }

    public function updateCompany(Company $company, array $data, User $actor): Company
    {
        $before = $this->snapshotCompany($company);

        if (array_key_exists('code', $data) && $data['code'] !== null) {
            $code = $this->normaliseCode($data['code']);

            if ($code !== $company->code && $this->companyInUse($company)) {
                throw new ProvisioningException(
                    'COMPANY_CODE_LOCKED',
                    'This company code cannot be changed: users or units already depend on it. '
                    . 'The code is the tenant key every access check reads.',
                    422
                );
            }

            $company->code = $code;
        }

        if (array_key_exists('name', $data)) {
            $company->name = trim((string) $data['name']);
        }

        DB::transaction(fn () => $company->save());

        $this->audit($actor, 'COMPANY_UPDATED', $before, $this->snapshotCompany($company));

        return $company;
    }

    public function setCompanyStatus(Company $company, bool $active, User $actor): Company
    {
        $before = $this->snapshotCompany($company);

        $company->is_active = $active;
        $company->save();

        $this->audit($actor, $active ? 'COMPANY_ACTIVATED' : 'COMPANY_DEACTIVATED', $before, $this->snapshotCompany($company));

        return $company;
    }

    public function deleteCompany(Company $company, User $actor): void
    {
        $usage = $this->companyUsage($company);
        $units = Unit::query()->where('company_id', $company->id)->count();

        if ($usage['members'] > 0 || $usage['legacy'] > 0 || $units > 0) {
            throw new ProvisioningException(
                'COMPANY_IN_USE',
                'Cannot delete this company because users or units are assigned to it. '
                . 'Reassign or deactivate them first.',
                422
            );
        }

        $snapshot = $this->snapshotCompany($company);

        DB::transaction(fn () => $company->delete());

        $this->audit($actor, 'COMPANY_DELETED', $snapshot, null);
    }

    /* ---------------------------------------------------------------- units */

    public function units(array $filters = []): array
    {
        $query = Unit::query()->with('company')->orderBy('name');

        if (! empty($filters['companyIds'])) {
            $query->whereIn('company_id', array_map('intval', (array) $filters['companyIds']));
        }

        if (($search = trim((string) ($filters['search'] ?? ''))) !== '') {
            $query->where('name', 'like', "%{$search}%");
        }

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('is_active', $status === 'ACTIVE');
        }

        return $query->get()->map(fn (Unit $unit) => $this->presentUnit($unit))->all();
    }

    public function presentUnit(Unit $unit): array
    {
        $usage = $this->unitUsage($unit);

        return [
            'id' => (int) $unit->id,
            'name' => $unit->name,
            'code' => $unit->code,
            'companyId' => (int) $unit->company_id,
            'companyName' => $unit->company?->name,
            'isActive' => (bool) $unit->is_active,
            'assignedUsers' => $usage['members'],
            'legacyUsers' => $usage['legacy'],
            // Reparenting a unit that people are assigned to moves them between
            // tenants without anyone saying so, which is why the form locks it.
            'companyLocked' => $usage['members'] > 0 || $usage['legacy'] > 0,
            'createdAt' => $unit->created_at,
        ];
    }

    public function createUnit(array $data, User $actor): Unit
    {
        $company = Company::query()->findOrFail((int) $data['companyId']);

        if (! $company->is_active) {
            throw new ProvisioningException(
                'COMPANY_INACTIVE',
                'Units cannot be added to an inactive company.',
                422
            );
        }

        $name = trim((string) $data['name']);

        $this->assertUnitNameFree($company->id, $name, null);

        $unit = DB::transaction(fn () => Unit::query()->create([
            'company_id' => $company->id,
            'name' => $name,
            'code' => $this->unitCode($data['code'] ?? null, $name),
            'is_active' => (bool) ($data['isActive'] ?? true),
        ]));

        $this->audit($actor, 'UNIT_CREATED', null, $this->snapshotUnit($unit));

        return $unit;
    }

    public function updateUnit(Unit $unit, array $data, User $actor): Unit
    {
        $before = $this->snapshotUnit($unit);
        $usage = $this->unitUsage($unit);

        if (array_key_exists('companyId', $data) && (int) $data['companyId'] !== (int) $unit->company_id) {
            if ($usage['members'] > 0 || $usage['legacy'] > 0) {
                throw new ProvisioningException(
                    'UNIT_COMPANY_LOCKED',
                    'This unit cannot be moved to another company while users are assigned to it. '
                    . 'Reassign them first.',
                    422
                );
            }

            $target = Company::query()->findOrFail((int) $data['companyId']);
            $this->assertUnitNameFree($target->id, $data['name'] ?? $unit->name, $unit->id);
            $unit->company_id = $target->id;
        }

        if (array_key_exists('name', $data)) {
            $name = trim((string) $data['name']);
            $this->assertUnitNameFree($unit->company_id, $name, $unit->id);
            $unit->name = $name;
        }

        DB::transaction(fn () => $unit->save());

        $this->audit($actor, 'UNIT_UPDATED', $before, $this->snapshotUnit($unit));

        return $unit;
    }

    public function setUnitStatus(Unit $unit, bool $active, User $actor): Unit
    {
        $before = $this->snapshotUnit($unit);

        $unit->is_active = $active;
        $unit->save();

        $this->audit($actor, $active ? 'UNIT_ACTIVATED' : 'UNIT_DEACTIVATED', $before, $this->snapshotUnit($unit));

        return $unit;
    }

    public function deleteUnit(Unit $unit, User $actor): void
    {
        $usage = $this->unitUsage($unit);

        if ($usage['members'] > 0 || $usage['legacy'] > 0) {
            throw new ProvisioningException(
                'UNIT_IN_USE',
                'Cannot delete this unit because users are assigned to it. Reassign users before deleting.',
                422
            );
        }

        $snapshot = $this->snapshotUnit($unit);

        DB::transaction(fn () => $unit->delete());

        $this->audit($actor, 'UNIT_DELETED', $snapshot, null);
    }

    /* ------------------------------------------------------- legacy mapping */

    /**
     * Legacy unit strings that no unit record accounts for.
     *
     * The bootstrap for a column that was free text: it reports what exists and
     * how many people carry it, and refuses to guess which company owns it. The
     * counts alone are not evidence — "Daduk" appears under silver-star 333
     * times and "Shreeji" appears under both companies — so ownership is an
     * administrator's decision, made once, here.
     *
     * @return list<array{name:string,companyCode:string,users:int,companyId:?int}>
     */
    public function unmappedLegacyUnits(): array
    {
        $rows = DB::table('users')
            ->selectRaw('company_code, unit, count(*) as total')
            ->whereNotNull('unit')
            ->where('unit', '!=', '')
            ->where('is_deleted', '0')
            ->groupBy('company_code', 'unit')
            ->get();

        $known = Company::query()->pluck('id', 'code');
        $out = [];

        foreach ($rows as $row) {
            foreach (CompanyMembership::parse($row->company_code) as $code) {
                $companyId = $known[$code] ?? null;

                $mapped = $companyId !== null && Unit::query()
                    ->where('company_id', $companyId)
                    ->where('name', $row->unit)
                    ->exists();

                $key = $code . '|' . $row->unit;

                $out[$key] = [
                    'name' => $row->unit,
                    'companyCode' => $code,
                    'companyId' => $companyId,
                    'users' => (int) ($out[$key]['users'] ?? 0) + (int) $row->total,
                    'hasUnitRecord' => $mapped,
                ];
            }
        }

        return array_values(array_filter($out, static fn ($row) => ! $row['hasUnitRecord']));
    }

    /**
     * Adopt a legacy unit string into a company an administrator has named.
     *
     * Creates the unit record if it is missing and links every user whose
     * legacy string matches AND whose company scope includes this company. The
     * legacy string is left exactly as it is: it is what the scope queries read,
     * and rewriting it here would change access as a side effect of a
     * bookkeeping step.
     *
     * @return array{unitId:int,linked:int}
     */
    public function adoptLegacyUnit(string $name, Company $company, User $actor): array
    {
        $name = trim($name);

        if ($name === '') {
            throw new ProvisioningException('VALIDATION_FAILED', 'A legacy unit name is required.', 422);
        }

        return DB::transaction(function () use ($name, $company, $actor) {
            $unit = Unit::query()->firstOrCreate(
                ['company_id' => $company->id, 'name' => $name],
                ['code' => Str::slug($name), 'is_active' => true],
            );

            $candidates = DB::table('users')
                ->where('unit', $name)
                ->where('is_deleted', '0')
                ->get(['id', 'company_code']);

            $linked = 0;

            foreach ($candidates as $candidate) {
                if (! in_array($company->code, CompanyMembership::parse($candidate->company_code), true)) {
                    continue;
                }

                DB::table('user_units')->insertOrIgnore([
                    'user_id' => $candidate->id,
                    'unit_id' => $unit->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $linked++;
            }

            $this->audit($actor, 'UNIT_LEGACY_ADOPTED', null, [
                'unitId' => $unit->id,
                'unitName' => $name,
                'companyCode' => $company->code,
                'linkedUsers' => $linked,
            ]);

            return ['unitId' => (int) $unit->id, 'linked' => $linked];
        });
    }

    /* -------------------------------------------------------------- helpers */

    /**
     * A code that cannot break the legacy serialisation.
     *
     * The comma is reserved: users.company_code is a comma-separated list, so a
     * code containing one would parse as two companies and scope an account to
     * something nobody created.
     */
    private function normaliseCode(string $code): string
    {
        $slug = Str::slug(trim($code));

        if ($slug === '' || $slug !== strtolower(trim($code))) {
            throw new ProvisioningException(
                'INVALID_COMPANY_CODE',
                'A company code must be lowercase letters, numbers and hyphens only — no spaces, commas or symbols.',
                422
            );
        }

        return $slug;
    }

    private function unitCode(?string $code, string $name): string
    {
        return Str::slug(trim((string) ($code ?: $name)));
    }

    private function assertUnitNameFree(int $companyId, string $name, ?int $ignoreId): void
    {
        $exists = Unit::query()
            ->where('company_id', $companyId)
            ->where('name', $name)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new ProvisioningException(
                'UNIT_NAME_TAKEN',
                'That company already has a unit with this name.',
                422
            );
        }
    }

    /** Whether anything at all depends on this company's code. */
    private function companyInUse(Company $company): bool
    {
        $usage = $this->companyUsage($company);

        return $usage['members'] > 0
            || $usage['legacy'] > 0
            || Unit::query()->where('company_id', $company->id)->exists();
    }

    /** @return array{members:int,legacy:int} */
    private function companyUsage(Company $company): array
    {
        $members = SchemaSupport::hasTable('user_companies')
            ? DB::table('user_companies')->where('company_id', $company->id)->count()
            : 0;

        // The legacy column is a CSV, so a LIKE would match `silver-star-old`
        // too. Counting exact tokens is slower and correct.
        $legacy = DB::table('users')
            ->where('is_deleted', '0')
            ->where(function ($query) use ($company) {
                $query->where('company_code', $company->code)
                    ->orWhere('company_code', 'like', $company->code.',%')
                    ->orWhere('company_code', 'like', '%,'.$company->code)
                    ->orWhere('company_code', 'like', '%,'.$company->code.',%');
            })
            ->count();

        return ['members' => $members, 'legacy' => $legacy];
    }

    /** @return array{members:int,legacy:int} */
    private function unitUsage(Unit $unit): array
    {
        $members = SchemaSupport::hasTable('user_units')
            ? DB::table('user_units')->where('unit_id', $unit->id)->count()
            : 0;

        $code = $unit->company?->code ?? Company::query()->whereKey($unit->company_id)->value('code');

        // Scoped to the unit's own company, because two companies own a unit
        // called "Ichapur" and a bare name match would count both.
        $legacy = DB::table('users')
            ->where('is_deleted', '0')
            ->where('unit', $unit->name)
            ->where(function ($query) use ($code) {
                $query->where('company_code', $code)
                    ->orWhere('company_code', 'like', $code.',%')
                    ->orWhere('company_code', 'like', '%,'.$code)
                    ->orWhere('company_code', 'like', '%,'.$code.',%');
            })
            ->count();

        return ['members' => $members, 'legacy' => $legacy];
    }

    private function snapshotCompany(Company $company): array
    {
        return [
            'id' => (int) $company->id,
            'name' => $company->name,
            'code' => $company->code,
            'isActive' => (bool) $company->is_active,
        ];
    }

    private function snapshotUnit(Unit $unit): array
    {
        return [
            'id' => (int) $unit->id,
            'name' => $unit->name,
            'code' => $unit->code,
            'companyId' => (int) $unit->company_id,
            'isActive' => (bool) $unit->is_active,
        ];
    }

    /**
     * Master-data edits are audited the same way user edits are.
     *
     * The authorization cache is NOT busted for a rename: the tenant key is the
     * code, and the code cannot change once anything depends on it, so a name
     * change affects no decision. Deactivation and deletion do change what is
     * assignable, so those invalidate.
     */
    private function audit(User $actor, string $changeType, ?array $old, ?array $new): void
    {
        $request = request();

        if ($request) {
            AuditLogger::log($request, $changeType, self::MODULE, $old, $new);
        }

        if (SchemaSupport::hasTable('authorization_permission_audit_logs')) {
            DB::table('authorization_permission_audit_logs')->insert([
                'event_id' => (string) Str::uuid(),
                'tenant_id' => $new['code'] ?? $old['code'] ?? null,
                'actor_id' => $actor->id,
                'subject_type' => str_starts_with($changeType, 'COMPANY') ? 'COMPANY' : 'UNIT',
                'subject_id' => (string) ($new['id'] ?? $old['id'] ?? ''),
                'subject_label' => (string) ($new['name'] ?? $old['name'] ?? ''),
                'change_type' => $changeType,
                'old_values' => $old === null ? null : json_encode($old),
                'new_values' => $new === null ? null : json_encode($new),
                'business_reason' => null,
                'ip_address' => $request?->ip(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        if (in_array($changeType, [
            'COMPANY_ACTIVATED', 'COMPANY_DEACTIVATED', 'COMPANY_DELETED',
            'UNIT_ACTIVATED', 'UNIT_DEACTIVATED', 'UNIT_DELETED', 'UNIT_LEGACY_ADOPTED',
        ], true)) {
            $this->cache->invalidate($new['code'] ?? $old['code'] ?? null);
        }
    }
}
