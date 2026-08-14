<?php

namespace App\Services\Organization;

use App\Models\Company;
use App\Models\Location;
use App\Models\User;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * DOMAIN 02.03 / 02.04 — Business Structure and Branch/Location Management.
 *
 * A location is a physical place under one company, optionally nested under a
 * parent. Two structural rules matter more than the fields:
 *
 * 1. A location can only hang under a location in the SAME company. "Ichapur"
 *    exists under both companies, so a parent-name match alone never proves
 *    relationship — reparenting across tenants silently mixes two companies'
 *    trees.
 * 2. The company of a location is fixed once users are assigned. Moving it
 *    moves every assigned user's scope, which is a bigger change than the form
 *    is allowed to make silently (same rule as units).
 *
 * user_locations membership changes bust the authorization cache: the pivot is
 * future scope material, and a stale cache would serve a membership decision
 * for a lock that no longer exists.
 */
class LocationService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'organization-locations';

    public function __construct(private readonly AuthorizationCache $cache)
    {
    }

    public function locations(array $filters, ?User $actor): array
    {
        $query = Location::query()->with(['company', 'parent'])->orderBy('name');

        if (! empty($filters['companyIds'])) {
            $query->whereIn('company_id', array_map('intval', (array) $filters['companyIds']));
        } elseif (! $this->hasGlobalCompanyScope($actor)) {
            $codes = $this->authorizedCompanyCodes($actor);
            $query->whereIn('company_id', Company::query()->whereIn('code', $codes)->pluck('id'));
        }

        if (array_key_exists('parentId', $filters) && $filters['parentId'] !== null && $filters['parentId'] !== '' && $filters['parentId'] !== 'ALL') {
            $query->where('parent_id', (int) $filters['parentId']);
        }

        if (($kind = (string) ($filters['kind'] ?? '')) !== '' && $kind !== 'ALL') {
            $query->where('kind', $kind);
        }

        if (($search = trim((string) ($filters['search'] ?? ''))) !== '') {
            $query->where(function ($inner) use ($search) {
                $inner->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('city', 'like', "%{$search}%");
            });
        }

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('is_active', $status === 'ACTIVE');
        }

        return $query->get()->map(fn (Location $location) => $this->present($location))->all();
    }

    /**
     * A flat, path-labelled list for the parent picker.
     *
     * Each option carries `path` — "Head Office / Warehouse" — built from the
     * ancestor chain, so choosing a parent does not require reading the whole
     * tree in the browser.
     */
    public function treeOptions(array $filters, ?User $actor, ?int $excludeId = null): array
    {
        $locations = $this->locations($filters, $actor);
        $byId = [];

        foreach ($locations as $location) {
            $byId[$location['id']] = $location;
        }

        $labels = $this->pathLabels($byId);

        return array_map(static function (array $location) use ($labels, $excludeId) {
            return [
                'id' => $location['id'],
                'name' => $location['name'],
                'kind' => $location['kind'],
                'path' => $labels[$location['id']] ?? $location['name'],
                'excluded' => $excludeId !== null && $this->isSelfOrDescendant($location['id'], $excludeId, $byId),
            ];
        }, array_values($byId));
    }

    public function present(Location $location): array
    {
        return [
            'id' => (int) $location->id,
            'companyId' => (int) $location->company_id,
            'companyName' => $location->company?->name,
            'parentId' => $location->parent_id === null ? null : (int) $location->parent_id,
            'parentName' => $location->parent?->name,
            'code' => $location->code,
            'name' => $location->name,
            'kind' => $location->kind,
            'isActive' => (bool) $location->is_active,
            'address' => $location->address,
            'city' => $location->city,
            'state' => $location->state,
            'countryCode' => $location->country_code,
            'postalCode' => $location->postal_code,
            'latitude' => $location->latitude === null ? null : (float) $location->latitude,
            'longitude' => $location->longitude === null ? null : (float) $location->longitude,
            'contactEmail' => $location->contact_email,
            'contactPhone' => $location->contact_phone,
            'hasChildren' => $location->children()->exists(),
            'memberCount' => $location->members()->count(),
            'createdAt' => $location->created_at,
        ];
    }

    public function create(array $data, User $actor): Location
    {
        $company = Company::query()->findOrFail((int) $data['companyId']);
        $this->assertCompanyVisible($company, $actor);

        if (! $company->is_active) {
            throw new OrganizationException(
                'COMPANY_INACTIVE',
                'Locations cannot be added to an inactive company.',
                422
            );
        }

        $name = trim((string) $data['name']);
        $code = trim((string) ($data['code'] ?: $name));
        $parentId = isset($data['parentId']) && $data['parentId'] !== '' ? (int) $data['parentId'] : null;

        $this->assertCodeFree($company->id, $code, null);
        $this->resolveParent($company->id, $parentId, null);

        $location = DB::transaction(fn () => Location::query()->create([
            'company_id' => $company->id,
            'parent_id' => $parentId,
            'code' => $code,
            'name' => $name,
            'kind' => $data['kind'] ?? 'branch',
            'is_active' => (bool) ($data['isActive'] ?? true),
            'address' => $this->blankToNull($data['address'] ?? null),
            'city' => $this->blankToNull($data['city'] ?? null),
            'state' => $this->blankToNull($data['state'] ?? null),
            'country_code' => $this->blankToNull($data['countryCode'] ?? null),
            'postal_code' => $this->blankToNull($data['postalCode'] ?? null),
            'latitude' => $this->decimalOrNull($data['latitude'] ?? null),
            'longitude' => $this->decimalOrNull($data['longitude'] ?? null),
            'contact_email' => $this->blankToNull($data['contactEmail'] ?? null),
            'contact_phone' => $this->blankToNull($data['contactPhone'] ?? null),
        ]));

        $this->audit($actor, 'LOCATION_CREATED', null, $this->snapshot($location));

        return $location;
    }

    public function update(Location $location, array $data, User $actor): Location
    {
        $this->assertCompanyVisible($location->company, $actor);
        $before = $this->snapshot($location);

        if (array_key_exists('companyId', $data) && (int) $data['companyId'] !== (int) $location->company_id) {
            if ($location->members()->exists()) {
                throw new OrganizationException(
                    'LOCATION_COMPANY_LOCKED',
                    'This location cannot be moved to another company while users are assigned to it. '
                    . 'Reassign them first.',
                    422
                );
            }
        }

        if (array_key_exists('code', $data)) {
            $code = trim((string) $data['code']);
            $this->assertCodeFree($location->company_id, $code, $location->id);
            $location->code = $code;
        }

        if (array_key_exists('name', $data)) {
            $location->name = trim((string) $data['name']);
        }

        if (array_key_exists('kind', $data)) {
            $location->kind = $data['kind'];
        }

        if (array_key_exists('parentId', $data)) {
            $parentId = $data['parentId'] === '' || $data['parentId'] === null ? null : (int) $data['parentId'];
            $this->resolveParent($location->company_id, $parentId, $location->id);
            $location->parent_id = $parentId;
        }

        $pairs = [
            'address' => 'address',
            'city' => 'city',
            'state' => 'state',
            'countryCode' => 'country_code',
            'postalCode' => 'postal_code',
            'contactEmail' => 'contact_email',
            'contactPhone' => 'contact_phone',
        ];

        foreach ($pairs as $key => $column) {
            if (array_key_exists($key, $data)) {
                $location->{$column} = $this->blankToNull($data[$key] ?? null);
            }
        }

        if (array_key_exists('latitude', $data)) {
            $location->latitude = $this->decimalOrNull($data['latitude']);
        }

        if (array_key_exists('longitude', $data)) {
            $location->longitude = $this->decimalOrNull($data['longitude']);
        }

        DB::transaction(fn () => $location->save());

        $this->audit($actor, 'LOCATION_UPDATED', $before, $this->snapshot($location));

        return $location;
    }

    public function setStatus(Location $location, bool $active, User $actor): Location
    {
        $this->assertCompanyVisible($location->company, $actor);
        $before = $this->snapshot($location);

        $location->is_active = $active;
        $location->save();

        $this->audit($actor, $active ? 'LOCATION_ACTIVATED' : 'LOCATION_DEACTIVATED', $before, $this->snapshot($location));

        return $location;
    }

    public function delete(Location $location, User $actor): void
    {
        $this->assertCompanyVisible($location->company, $actor);

        if ($location->children()->exists()) {
            throw new OrganizationException(
                'LOCATION_HAS_CHILDREN',
                'Cannot delete this location while sub-locations exist under it. Move them first.',
                422
            );
        }

        if ($location->members()->exists()) {
            throw new OrganizationException(
                'LOCATION_IN_USE',
                'Cannot delete this location while users are assigned to it. Reassign users before deleting.',
                422
            );
        }

        $snapshot = $this->snapshot($location);

        DB::transaction(fn () => $location->delete());

        $this->audit($actor, 'LOCATION_DELETED', $snapshot, null);
    }

    /** @return list<array{userId:int,empCode:?string,name:?string,email:?string}> */
    public function members(Location $location, User $actor): array
    {
        $this->assertCompanyVisible($location->company, $actor);

        return $location->members()
            ->orderBy('users.name')
            ->get(['users.id', 'users.emp_code', 'users.name', 'users.email'])
            ->map(static fn (User $user) => [
                'userId' => (int) $user->id,
                'empCode' => $user->emp_code,
                'name' => $user->name,
                'email' => $user->email,
            ])
            ->all();
    }

    /** Assign a list of users to the location, ignoring ones already linked. */
    public function assignMembers(Location $location, array $userIds, User $actor): int
    {
        $this->assertCompanyVisible($location->company, $actor);

        $existing = $location->members()->pluck('users.id')->all();
        $toLink = array_values(array_diff(array_map('intval', $userIds), $existing));

        DB::transaction(function () use ($location, $toLink) {
            foreach ($toLink as $userId) {
                $exists = DB::table('users')->where('id', $userId)->where('is_deleted', '0')->exists();

                if ($exists) {
                    DB::table('user_locations')->insertOrIgnore([
                        'user_id' => $userId,
                        'location_id' => $location->id,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }
        });

        $this->audit($actor, 'LOCATION_MEMBERS_ASSIGNED', null, [
            'locationId' => (int) $location->id,
            'users' => $toLink,
        ]);

        $this->memberScopeChanged($location);

        return count($toLink);
    }

    public function removeMember(Location $location, int $userId, User $actor): void
    {
        $this->assertCompanyVisible($location->company, $actor);

        $deleted = DB::table('user_locations')
            ->where('location_id', $location->id)
            ->where('user_id', $userId)
            ->delete();

        if ($deleted === 0) {
            throw new OrganizationException(
                'MEMBER_NOT_FOUND',
                'That user is not assigned to this location.',
                404
            );
        }

        $this->audit($actor, 'LOCATION_MEMBER_REMOVED', null, [
            'locationId' => (int) $location->id,
            'userId' => $userId,
        ]);

        $this->memberScopeChanged($location);
    }

    /* -------------------------------------------------------------- helpers */

    private function resolveParent(int $companyId, ?int $parentId, ?int $locationId): void
    {
        if ($parentId === null) {
            return;
        }

        $parent = Location::query()->find($parentId);

        if (! $parent || $parent->company_id !== $companyId) {
            throw new OrganizationException(
                'PARENT_COMPANY_MISMATCH',
                'A sub-location can only be placed under a location in the same company.',
                422
            );
        }

        if ($parentId === $locationId) {
            throw new OrganizationException('LOCATION_CYCLE', 'A location cannot be its own parent.', 422);
        }

        // Walking up the chain prevents a cycle created in a single update — the
        // parent being set to something that hangs under this location.
        $cursor = $parent;

        while ($cursor->parent_id !== null) {
            if ($cursor->parent_id === $locationId) {
                throw new OrganizationException(
                    'LOCATION_CYCLE',
                    'That parent would create a loop in the location tree.',
                    422
                );
            }

            $cursor = Location::query()->find($cursor->parent_id);
        }
    }

    private function assertCodeFree(int $companyId, string $code, ?int $ignoreId): void
    {
        $exists = Location::query()
            ->where('company_id', $companyId)
            ->where('code', $code)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new OrganizationException(
                'LOCATION_CODE_TAKEN',
                'That company already has a location with this code.',
                422
            );
        }
    }

    /** @param array<int,array{id:int,parentId:?int}> $byId */
    private function pathLabels(array $byId): array
    {
        $labels = [];

        foreach ($byId as $id => $location) {
            $chain = [];
            $cursor = $location['id'];

            // Bounded walk so a pre-existing cycle cannot loop forever.
            for ($i = 0; $i < 25 && $cursor !== null; $i++) {
                if (! isset($byId[$cursor])) {
                    break;
                }

                array_unshift($chain, $byId[$cursor]['name']);
                $cursor = $byId[$cursor]['parentId'];
            }

            $labels[$id] = implode(' / ', $chain);
        }

        return $labels;
    }

    /** @param array<int,array{id:int,parentId:?int}> $byId */
    private function isSelfOrDescendant(int $candidateId, int $targetId, array $byId): bool
    {
        if ($candidateId === $targetId) {
            return true;
        }

        $cursor = $candidateId;

        for ($i = 0; $i < 25 && $cursor !== null; $i++) {
            if (! isset($byId[$cursor])) {
                return false;
            }

            if ($cursor === $targetId) {
                return true;
            }

            $cursor = $byId[$cursor]['parentId'];
        }

        return false;
    }

    private function blankToNull(mixed $value): ?string
    {
        if ($value === null || (is_string($value) && trim($value) === '')) {
            return null;
        }

        return trim((string) $value);
    }

    private function decimalOrNull(mixed $value): ?float
    {
        if ($value === null || $value === '' || ! is_numeric($value)) {
            return null;
        }

        return (float) $value;
    }

    private function snapshot(Location $location): array
    {
        return [
            'id' => (int) $location->id,
            'companyId' => (int) $location->company_id,
            'parentId' => $location->parent_id === null ? null : (int) $location->parent_id,
            'code' => $location->code,
            'name' => $location->name,
            'kind' => $location->kind,
            'isActive' => (bool) $location->is_active,
        ];
    }

    private function memberScopeChanged(Location $location): void
    {
        $this->cache->invalidate($location->company?->code ?? null);
    }

    private function audit(User $actor, string $changeType, ?array $old, ?array $new): void
    {
        $request = request();

        if ($request) {
            AuditLogger::log($request, $changeType, self::MODULE, $old, $new);
        }
    }
}