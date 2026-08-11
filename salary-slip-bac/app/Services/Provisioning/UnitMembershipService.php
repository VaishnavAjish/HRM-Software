<?php

namespace App\Services\Provisioning;

use App\Models\User;
use App\Services\Authorization\SchemaSupport;
use Illuminate\Support\Facades\DB;

/**
 * Unit membership, and the one place that knows it is half-normalised.
 *
 * user_units is the real relationship. users.unit is the value ten scope queries
 * still match on with `where('unit', $actor->unit)`, so it must keep holding
 * exactly one unit name — a comma-joined list would silently drop those users
 * out of every unit-scoped query, which is the "visual-only multi-select" this
 * was explicitly not to become.
 *
 * So: the pivot carries the full membership, and the legacy column carries the
 * primary. Primary is the alphabetically first selected unit, chosen for
 * determinism rather than meaning — the same selection must always produce the
 * same scope, whatever order the boxes were ticked in. The UI says which one it
 * is, because an operator who picks two units and is scoped by one deserves to
 * know that rather than discover it.
 *
 * Moving the ten queries onto the pivot is a separate change with its own cache
 * and matcher work, and this leaves them behaving exactly as they do today.
 */
class UnitMembershipService
{
    public function available(): bool
    {
        return SchemaSupport::hasTable('units') && SchemaSupport::hasTable('user_units');
    }

    /**
     * Units belonging to the given companies, for a grouped picker.
     *
     * Keyed by company id rather than flattened, because two companies own a
     * unit called "Ichapur" and a flat list of names cannot tell them apart.
     *
     * @param list<int> $companyIds
     * @return list<array{id:int,name:string,companyId:int}>
     */
    public function optionsForCompanies(array $companyIds): array
    {
        if (! $this->available() || $companyIds === []) {
            return [];
        }

        $query = DB::table('units')
            ->whereIn('company_id', array_map('intval', $companyIds))
            ->orderBy('name');

        if (SchemaSupport::hasColumn('units', 'is_active')) {
            $query->where('is_active', true);
        }

        return $query->get(['id', 'name', 'company_id'])
            ->map(static fn ($row) => [
                'id' => (int) $row->id,
                'name' => (string) $row->name,
                'companyId' => (int) $row->company_id,
            ])->all();
    }

    /** @return list<int> */
    public function unitIdsOf(User $user): array
    {
        if (! $this->available()) {
            return [];
        }

        return DB::table('user_units')
            ->where('user_id', $user->id)
            ->pluck('unit_id')
            ->map(static fn ($id) => (int) $id)
            ->values()
            ->all();
    }

    /**
     * Units the request may assign, given the companies it also selected.
     *
     * Rejecting a unit whose company was not selected is the check the browser
     * cannot be trusted to make: the filtered dropdown is a convenience, and a
     * request naming a Silver Star unit alongside only Nidhi Impex is how an
     * account ends up scoped to a place its company does not own.
     *
     * @param list<int> $unitIds
     * @param list<int> $companyIds
     * @throws ProvisioningException
     */
    public function requireWithinCompanies(array $unitIds, array $companyIds): array
    {
        $unitIds = array_values(array_unique(array_map('intval', $unitIds)));

        if ($unitIds === []) {
            return [];
        }

        if (! $this->available()) {
            throw new ProvisioningException(
                'UNIT_MODULE_NOT_READY',
                'Unit records are not present in this database yet.',
                503
            );
        }

        $rows = DB::table('units')->whereIn('id', $unitIds)->get(['id', 'company_id', 'is_active']);

        if ($rows->count() !== count($unitIds)) {
            throw new ProvisioningException('UNIT_NOT_FOUND', 'One of those units does not exist.', 422);
        }

        foreach ($rows as $row) {
            if (SchemaSupport::hasColumn('units', 'is_active') && ! $row->is_active) {
                throw new ProvisioningException('UNIT_INACTIVE', 'One of those units is not active.', 422);
            }

            if (! in_array((int) $row->company_id, array_map('intval', $companyIds), true)) {
                throw new ProvisioningException(
                    'UNIT_OUTSIDE_COMPANY',
                    'One of those units belongs to a company that is not selected.',
                    422
                );
            }
        }

        return $unitIds;
    }

    /**
     * Replace membership, and record which unit is the primary one.
     *
     * The primary is chosen, not derived. It briefly defaulted to the
     * alphabetically first selection, which was defensible only as a stopgap:
     * users.unit is the employee's home unit — the value attendance, payroll,
     * imports and every unit filter read — so "Daduk beats Ichapur" was letting
     * the alphabet decide real employment data. A single selection still needs
     * no question asked; two or more do.
     *
     * @param list<int> $unitIds
     * @throws ProvisioningException
     */
    public function sync(User $user, array $unitIds, ?int $primaryUnitId = null): void
    {
        if (! $this->available()) {
            return;
        }

        $unitIds = array_values(array_unique(array_map('intval', $unitIds)));
        $primaryUnitId = $this->resolvePrimary($unitIds, $primaryUnitId);

        DB::table('user_units')
            ->where('user_id', $user->id)
            ->when($unitIds !== [], fn ($query) => $query->whereNotIn('unit_id', $unitIds))
            ->delete();

        if ($unitIds !== []) {
            $held = DB::table('user_units')->where('user_id', $user->id)->pluck('unit_id')
                ->map(static fn ($id) => (int) $id)->all();

            $rows = [];

            foreach (array_diff($unitIds, $held) as $unitId) {
                $rows[] = [
                    'user_id' => $user->id,
                    'unit_id' => $unitId,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }

            if ($rows !== []) {
                DB::table('user_units')->insertOrIgnore($rows);
            }
        }

        $user->unit = $primaryUnitId === null
            ? null
            : (string) DB::table('units')->where('id', $primaryUnitId)->value('name');

        $user->save();
    }

    /**
     * Which of the selected units is the home unit.
     *
     * @param list<int> $unitIds
     * @throws ProvisioningException
     */
    private function resolvePrimary(array $unitIds, ?int $primaryUnitId): ?int
    {
        if ($unitIds === []) {
            return null;
        }

        // One unit is its own primary; asking would be a question with a single
        // possible answer.
        if ($primaryUnitId === null && count($unitIds) === 1) {
            return $unitIds[0];
        }

        if ($primaryUnitId === null) {
            throw new ProvisioningException(
                'PRIMARY_UNIT_REQUIRED',
                'Choose which of the selected units is the primary unit. It is the one attendance, '
                . 'payroll and unit filters read.',
                422
            );
        }

        if (! in_array($primaryUnitId, $unitIds, true)) {
            throw new ProvisioningException(
                'PRIMARY_UNIT_NOT_SELECTED',
                'The primary unit must be one of the selected units.',
                422
            );
        }

        return $primaryUnitId;
    }

    /** The id whose name currently sits in the legacy column, if any. */
    public function primaryUnitIdOf(User $user): ?int
    {
        if (! $this->available() || ! filled($user->unit)) {
            return null;
        }

        $held = $this->unitIdsOf($user);

        if ($held === []) {
            return null;
        }

        $id = DB::table('units')
            ->whereIn('id', $held)
            ->where('name', $user->unit)
            ->value('id');

        return $id === null ? null : (int) $id;
    }
}
