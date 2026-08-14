<?php

namespace App\Services\Organization;

use App\Models\OrganizationLocation;
use App\Models\OrganizationLocationType;
use App\Models\OrganizationUnit;
use App\Models\OrganizationWorkLocationMapping;
use App\Models\Enterprise;
use App\Models\Company;
use App\Models\User;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * DOMAIN 02.04 — Branch and Location Management Service.
 */
class OrganizationLocationService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'organization-locations';

    public const KINDS = [
        'branch',
        'office',
        'plant',
        'factory',
        'warehouse',
        'store',
        'worksite',
        'remote',
    ];

    public function locations(array $filters, ?User $actor): array
    {
        $query = OrganizationLocation::query()
            ->with(['enterprise', 'company', 'locationType', 'parent', 'zone', 'region', 'territory'])
            ->orderBy('name');

        if (!empty($filters['enterpriseId'])) {
            $query->where('enterprise_id', (int) $filters['enterpriseId']);
        }

        if (!empty($filters['companyIds'])) {
            $query->whereIn('company_id', array_map('intval', (array) $filters['companyIds']));
        } elseif (!$this->hasGlobalCompanyScope($actor)) {
            $codes = $this->authorizedCompanyCodes($actor);
            $companyIds = Company::query()->whereIn('code', $codes)->pluck('id')->all();
            $query->whereIn('company_id', $companyIds);
        }

        if (array_key_exists('parentId', $filters) && $filters['parentId'] !== null && $filters['parentId'] !== '' && $filters['parentId'] !== 'ALL') {
            $query->where('parent_id', (int) $filters['parentId']);
        }

        if (($kind = (string) ($filters['kind'] ?? '')) !== '' && $kind !== 'ALL') {
            $query->where('kind', $kind);
        }

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('status', $status);
        }

        if (($search = trim((string) ($filters['search'] ?? ''))) !== '') {
            $query->where(function ($inner) use ($search) {
                $inner->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('city', 'like', "%{$search}%");
            });
        }

        if (($asOf = $filters['asOf'] ?? null) !== null) {
            $query->where(function ($inner) use ($asOf) {
                $inner->where('effective_from', '<=', $asOf)
                    ->orWhereNull('effective_from');
                $inner->where(function ($q) use ($asOf) {
                    $q->where('effective_to', '>=', $asOf)
                        ->orWhereNull('effective_to');
                });
            });
        }

        if (!empty($filters['includeInactive'])) {
            // include all
        } else {
            $query->where('status', 'active');
        }

        return $query->get()->map(fn (OrganizationLocation $location) => $this->present($location))->all();
    }

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

    public function present(OrganizationLocation $location): array
    {
        return [
            'id' => (int) $location->id,
            'enterpriseId' => $location->enterprise_id === null ? null : (int) $location->enterprise_id,
            'enterpriseName' => $location->enterprise?->name,
            'companyId' => (int) $location->company_id,
            'companyName' => $location->company?->name,
            'locationTypeId' => $location->location_type_id === null ? null : (int) $location->location_type_id,
            'locationTypeName' => $location->locationType?->name,
            'parentId' => $location->parent_id === null ? null : (int) $location->parent_id,
            'parentName' => $location->parent?->name,
            'code' => $location->code,
            'name' => $location->name,
            'kind' => $location->kind,
            'status' => $location->status,
            'address' => $location->address,
            'city' => $location->city,
            'state' => $location->state,
            'countryCode' => $location->country_code,
            'postalCode' => $location->postal_code,
            'timezone' => $location->timezone,
            'latitude' => $location->latitude === null ? null : (float) $location->latitude,
            'longitude' => $location->longitude === null ? null : (float) $location->longitude,
            'contactEmail' => $location->contact_email,
            'contactPhone' => $location->contact_phone,
            'zoneId' => $location->zone_id === null ? null : (int) $location->zone_id,
            'zoneName' => $location->zone?->name,
            'regionId' => $location->region_id === null ? null : (int) $location->region_id,
            'regionName' => $location->region?->name,
            'territoryId' => $location->territory_id === null ? null : (int) $location->territory_id,
            'territoryName' => $location->territory?->name,
            'effectiveFrom' => $location->effective_from?->toDateString(),
            'effectiveTo' => $location->effective_to?->toDateString(),
            'hasChildren' => $location->children()->exists(),
            'memberCount' => $location->workLocationMappings()->where('mapping_type', 'employee')->where('is_active', true)->count(),
            'createdAt' => $location->created_at,
        ];
    }

    public function create(array $data, User $actor): OrganizationLocation
    {
        $enterpriseId = isset($data['enterpriseId']) && $data['enterpriseId'] !== '' ? (int) $data['enterpriseId'] : null;
        $companyId = (int) $data['companyId'];
        $parentId = isset($data['parentId']) && $data['parentId'] !== '' ? (int) $data['parentId'] : null;
        $locationTypeId = isset($data['locationTypeId']) && $data['locationTypeId'] !== '' ? (int) $data['locationTypeId'] : null;
        $zoneId = isset($data['zoneId']) && $data['zoneId'] !== '' ? (int) $data['zoneId'] : null;
        $regionId = isset($data['regionId']) && $data['regionId'] !== '' ? (int) $data['regionId'] : null;
        $territoryId = isset($data['territoryId']) && $data['territoryId'] !== '' ? (int) $data['territoryId'] : null;

        if ($enterpriseId) {
            $enterprise = Enterprise::query()->findOrFail($enterpriseId);
            $this->assertEnterpriseVisible($enterprise, $actor);
        }

        $company = Company::query()->findOrFail($companyId);
        $this->assertCompanyVisible($company, $actor);

        if (!$company->is_active) {
            throw new OrganizationException(
                'COMPANY_INACTIVE',
                'Locations cannot be added to an inactive company.',
                422
            );
        }

        $this->assertCodeFree($enterpriseId, $companyId, trim((string) ($data['code'] ?: $data['name'])), null);
        $this->resolveParent($enterpriseId, $companyId, $parentId, null);
        $this->resolveZoneRegionTerritory($companyId, $zoneId, $regionId, $territoryId);

        $location = DB::transaction(function () use ($data, $enterpriseId, $companyId, $parentId, $locationTypeId, $zoneId, $regionId, $territoryId, $actor) {
            return OrganizationLocation::query()->create([
                'enterprise_id' => $enterpriseId,
                'company_id' => $companyId,
                'location_type_id' => $locationTypeId,
                'parent_id' => $parentId,
                'code' => trim((string) ($data['code'] ?: $data['name'])),
                'name' => trim((string) $data['name']),
                'kind' => $data['kind'] ?? 'branch',
                'status' => $data['status'] ?? 'active',
                'address' => $this->blankToNull($data['address'] ?? null),
                'city' => $this->blankToNull($data['city'] ?? null),
                'state' => $this->blankToNull($data['state'] ?? null),
                'country_code' => strtoupper((string) ($data['countryCode'] ?? 'IN')),
                'postal_code' => $this->blankToNull($data['postalCode'] ?? null),
                'timezone' => $this->blankToNull($data['timezone'] ?? null),
                'latitude' => $this->decimalOrNull($data['latitude'] ?? null),
                'longitude' => $this->decimalOrNull($data['longitude'] ?? null),
                'contact_email' => $this->blankToNull($data['contactEmail'] ?? null),
                'contact_phone' => $this->blankToNull($data['contactPhone'] ?? null),
                'zone_id' => $zoneId,
                'region_id' => $regionId,
                'territory_id' => $territoryId,
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);
        });

        $this->audit($actor, 'ORGANIZATION_LOCATION_CREATED', null, $this->snapshot($location));

        return $location;
    }

    public function update(OrganizationLocation $location, array $data, User $actor): OrganizationLocation
    {
        $this->assertLocationVisible($location, $actor);
        $before = $this->snapshot($location);

        if (array_key_exists('enterpriseId', $data)) {
            $enterpriseId = $data['enterpriseId'] === '' || $data['enterpriseId'] === null ? null : (int) $data['enterpriseId'];
            if ($enterpriseId !== $location->enterprise_id) {
                if ($enterpriseId) {
                    $enterprise = Enterprise::query()->findOrFail($enterpriseId);
                    $this->assertEnterpriseVisible($enterprise, $actor);
                }
                $location->enterprise_id = $enterpriseId;
            }
        }

        if (array_key_exists('companyId', $data)) {
            $companyId = (int) $data['companyId'];
            if ($companyId !== $location->company_id) {
                $company = Company::query()->findOrFail($companyId);
                $this->assertCompanyVisible($company, $actor);
                $location->company_id = $companyId;
            }
        }

        if (array_key_exists('code', $data)) {
            $code = trim((string) $data['code']);
            $this->assertCodeFree($location->enterprise_id, $location->company_id, $code, $location->id);
            $location->code = $code;
        }

        if (array_key_exists('name', $data)) {
            $location->name = trim((string) $data['name']);
        }

        if (array_key_exists('kind', $data)) {
            $location->kind = $data['kind'];
        }

        if (array_key_exists('status', $data)) {
            $location->status = $data['status'];
        }

        if (array_key_exists('parentId', $data)) {
            $parentId = $data['parentId'] === '' || $data['parentId'] === null ? null : (int) $data['parentId'];
            $this->resolveParent($location->enterprise_id, $location->company_id, $parentId, $location->id);
            $location->parent_id = $parentId;
        }

        if (array_key_exists('locationTypeId', $data)) {
            $locationTypeId = $data['locationTypeId'] === '' || $data['locationTypeId'] === null ? null : (int) $data['locationTypeId'];
            $location->location_type_id = $locationTypeId;
        }

        if (array_key_exists('zoneId', $data)) {
            $zoneId = $data['zoneId'] === '' || $data['zoneId'] === null ? null : (int) $data['zoneId'];
            $this->resolveZoneRegionTerritory($location->company_id, $zoneId, null, null);
            $location->zone_id = $zoneId;
        }

        if (array_key_exists('regionId', $data)) {
            $regionId = $data['regionId'] === '' || $data['regionId'] === null ? null : (int) $data['regionId'];
            $this->resolveZoneRegionTerritory($location->company_id, null, $regionId, null);
            $location->region_id = $regionId;
        }

        if (array_key_exists('territoryId', $data)) {
            $territoryId = $data['territoryId'] === '' || $data['territoryId'] === null ? null : (int) $data['territoryId'];
            $this->resolveZoneRegionTerritory($location->company_id, null, null, $territoryId);
            $location->territory_id = $territoryId;
        }

        $pairs = [
            'address' => 'address',
            'city' => 'city',
            'state' => 'state',
            'countryCode' => 'country_code',
            'postalCode' => 'postal_code',
            'timezone' => 'timezone',
            'contactEmail' => 'contact_email',
            'contactPhone' => 'contact_phone',
            'effectiveFrom' => 'effective_from',
            'effectiveTo' => 'effective_to',
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

        $this->audit($actor, 'ORGANIZATION_LOCATION_UPDATED', $before, $this->snapshot($location));

        return $location;
    }

    public function setStatus(OrganizationLocation $location, string $status, User $actor): OrganizationLocation
    {
        $this->assertLocationVisible($location, $actor);
        $before = $this->snapshot($location);

        if ($status === 'closed' && $location->children()->where('status', 'active')->exists()) {
            throw new OrganizationException(
                'ORGANIZATION_LOCATION_HAS_ACTIVE_CHILDREN',
                'Cannot close this location while it has active children. Move or close them first.',
                422
            );
        }

        $location->status = $status;
        $location->save();

        $this->audit($actor, 'ORGANIZATION_LOCATION_STATUS_CHANGED', $before, $this->snapshot($location));

        return $location;
    }

    public function delete(OrganizationLocation $location, User $actor): void
    {
        $this->assertLocationVisible($location, $actor);

        if ($location->children()->exists()) {
            throw new OrganizationException(
                'ORGANIZATION_LOCATION_HAS_CHILDREN',
                'Cannot delete this location while sub-locations exist under it. Move them first.',
                422
            );
        }

        if ($location->workLocationMappings()->where('is_active', true)->exists()) {
            throw new OrganizationException(
                'ORGANIZATION_LOCATION_IN_USE',
                'Cannot delete this location while mappings exist. Remove them first.',
                422
            );
        }

        $snapshot = $this->snapshot($location);

        DB::transaction(fn () => $location->delete());

        $this->audit($actor, 'ORGANIZATION_LOCATION_DELETED', $snapshot, null);
    }

    // Work Location Mappings
    public function mappings(array $filters, ?User $actor): array
    {
        $query = OrganizationWorkLocationMapping::query()
            ->with(['organizationLocation', 'organizationUnit', 'position', 'user'])
            ->orderBy('effective_from', 'desc');

        if (!empty($filters['organizationLocationId'])) {
            $query->where('organization_location_id', (int) $filters['organizationLocationId']);
        }

        if (!empty($filters['organizationUnitId'])) {
            $query->where('organization_unit_id', (int) $filters['organizationUnitId']);
        }

        if (!empty($filters['positionId'])) {
            $query->where('position_id', (int) $filters['positionId']);
        }

        if (!empty($filters['userId'])) {
            $query->where('user_id', (int) $filters['userId']);
        }

        if (($asOf = $filters['asOf'] ?? null) !== null) {
            $query->where(function ($inner) use ($asOf) {
                $inner->where('effective_from', '<=', $asOf)
                    ->where(function ($q) use ($asOf) {
                        $q->where('effective_to', '>=', $asOf)
                            ->orWhereNull('effective_to');
                    });
            });
        }

        if (!empty($filters['includeInactive'])) {
            // include all
        } else {
            $query->where('is_active', true);
        }

        return $query->get()->map(fn (OrganizationWorkLocationMapping $mapping) => $this->presentMapping($mapping))->all();
    }

    public function presentMapping(OrganizationWorkLocationMapping $mapping): array
    {
        return [
            'id' => (int) $mapping->id,
            'organizationLocationId' => (int) $mapping->organization_location_id,
            'organizationLocationName' => $mapping->organizationLocation?->name,
            'organizationUnitId' => $mapping->organization_unit_id === null ? null : (int) $mapping->organization_unit_id,
            'organizationUnitName' => $mapping->organizationUnit?->name,
            'positionId' => $mapping->position_id === null ? null : (int) $mapping->position_id,
            'positionTitle' => $mapping->position?->title,
            'userId' => $mapping->user_id === null ? null : (int) $mapping->user_id,
            'userName' => $mapping->user?->name,
            'mappingType' => $mapping->mapping_type,
            'effectiveFrom' => $mapping->effective_from->toDateString(),
            'effectiveTo' => $mapping->effective_to?->toDateString(),
            'isActive' => (bool) $mapping->is_active,
            'createdAt' => $mapping->created_at,
        ];
    }

    public function createMapping(array $data, User $actor): OrganizationWorkLocationMapping
    {
        $location = OrganizationLocation::query()->findOrFail((int) $data['organizationLocationId']);
        $this->assertLocationVisible($location, $actor);

        $unitId = isset($data['organizationUnitId']) && $data['organizationUnitId'] !== '' ? (int) $data['organizationUnitId'] : null;
        $positionId = isset($data['positionId']) && $data['positionId'] !== '' ? (int) $data['positionId'] : null;
        $userId = isset($data['userId']) && $data['userId'] !== '' ? (int) $data['userId'] : null;
        $mappingType = $data['mappingType'] ?? 'unit';

        if ($unitId) {
            $unit = OrganizationUnit::query()->findOrFail($unitId);
            $this->assertUnitVisible($unit, $actor);
        }

        if ($positionId) {
            $position = OrganizationPosition::query()->findOrFail($positionId);
            $this->assertUnitVisible($position->organizationUnit, $actor);
        }

        if ($userId) {
            $user = User::query()->findOrFail($userId);
        }

        $mapping = DB::transaction(function () use ($location, $unitId, $positionId, $userId, $mappingType, $data) {
            return OrganizationWorkLocationMapping::query()->create([
                'organization_location_id' => $location->id,
                'organization_unit_id' => $unitId,
                'position_id' => $positionId,
                'user_id' => $userId,
                'mapping_type' => $mappingType,
                'effective_from' => $data['effectiveFrom'],
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
                'is_active' => (bool) ($data['isActive'] ?? true),
            ]);
        });

        $this->audit($actor, 'ORGANIZATION_WORK_LOCATION_MAPPING_CREATED', null, $this->snapshotMapping($mapping));

        return $mapping;
    }

    public function deleteMapping(OrganizationWorkLocationMapping $mapping, User $actor): void
    {
        $this->assertLocationVisible($mapping->organizationLocation, $actor);
        $snapshot = $this->snapshotMapping($mapping);
        DB::transaction(fn () => $mapping->delete());
        $this->audit($actor, 'ORGANIZATION_WORK_LOCATION_MAPPING_DELETED', $snapshot, null);
    }

    // Location Types
    public function locationTypes(array $filters, ?User $actor): array
    {
        $query = OrganizationLocationType::query()->orderBy('sort_order');

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('is_active', $status === 'ACTIVE');
        }

        return $query->get()->map(fn (OrganizationLocationType $type) => [
            'id' => (int) $type->id,
            'code' => $type->code,
            'name' => $type->name,
            'description' => $type->description,
            'isActive' => (bool) $type->is_active,
            'sortOrder' => (int) $type->sort_order,
            'createdAt' => $type->created_at,
        ])->all();
    }

    public function createLocationType(array $data, User $actor): OrganizationLocationType
    {
        $type = DB::transaction(function () use ($data) {
            return OrganizationLocationType::query()->create([
                'code' => trim((string) $data['code']),
                'name' => trim((string) $data['name']),
                'description' => $this->blankToNull($data['description'] ?? null),
                'is_active' => (bool) ($data['isActive'] ?? true),
                'sort_order' => (int) ($data['sortOrder'] ?? 0),
            ]);
        });

        $this->audit($actor, 'ORGANIZATION_LOCATION_TYPE_CREATED', null, [
            'id' => (int) $type->id,
            'code' => $type->code,
            'name' => $type->name,
        ]);

        return $type;
    }

    private function assertCodeFree(?int $enterpriseId, ?int $companyId, string $code, ?int $ignoreId): void
    {
        $exists = OrganizationLocation::query()
            ->where('enterprise_id', $enterpriseId)
            ->where('company_id', $companyId)
            ->where('code', $code)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new OrganizationException(
                'ORGANIZATION_LOCATION_CODE_TAKEN',
                'That scope already has a location with this code.',
                422
            );
        }
    }

    private function resolveParent(?int $enterpriseId, ?int $companyId, ?int $parentId, ?int $ignoreId): void
    {
        if ($parentId === null) {
            return;
        }

        $parent = OrganizationLocation::query()->find($parentId);

        if (!$parent) {
            throw new OrganizationException(
                'ORGANIZATION_LOCATION_PARENT_NOT_FOUND',
                'The selected parent location does not exist.',
                422
            );
        }

        if ($parent->enterprise_id !== $enterpriseId || $parent->company_id !== $companyId) {
            throw new OrganizationException(
                'ORGANIZATION_LOCATION_PARENT_SCOPE_MISMATCH',
                'A location can only hang under a parent in the same enterprise and company.',
                422
            );
        }

        // Check for cycles
        $cursor = $parentId;
        for ($i = 0; $i < 100 && $cursor !== null; $i++) {
            if ($cursor === $ignoreId) {
                throw new OrganizationException(
                    'ORGANIZATION_LOCATION_CYCLE_DETECTED',
                    'This would create a cycle in the location hierarchy.',
                    422
                );
            }
            $parent = OrganizationLocation::query()->find($cursor);
            $cursor = $parent?->parent_id;
        }
    }

    private function resolveZoneRegionTerritory(int $companyId, ?int $zoneId, ?int $regionId, ?int $territoryId): void
    {
        if ($zoneId) {
            $zone = OrganizationLocation::query()->find($zoneId);
            if (!$zone || $zone->company_id !== $companyId || $zone->kind !== 'branch') {
                throw new OrganizationException(
                    'ORGANIZATION_LOCATION_ZONE_INVALID',
                    'The selected zone must be a branch in the same company.',
                    422
                );
            }
        }

        if ($regionId) {
            $region = OrganizationLocation::query()->find($regionId);
            if (!$region || $region->company_id !== $companyId) {
                throw new OrganizationException(
                    'ORGANIZATION_LOCATION_REGION_INVALID',
                    'The selected region must be in the same company.',
                    422
                );
            }
        }

        if ($territoryId) {
            $territory = OrganizationLocation::query()->find($territoryId);
            if (!$territory || $territory->company_id !== $companyId) {
                throw new OrganizationException(
                    'ORGANIZATION_LOCATION_TERRITORY_INVALID',
                    'The selected territory must be in the same company.',
                    422
                );
            }
        }
    }

    private function assertLocationVisible(OrganizationLocation $location, ?User $actor): void
    {
        if ($location->enterprise_id) {
            $this->assertEnterpriseVisible($location->enterprise, $actor);
        }
        $this->assertCompanyVisible($location->company, $actor);
    }

    private function assertUnitVisible(OrganizationUnit $unit, ?User $actor): void
    {
        if ($unit->enterprise_id) {
            $this->assertEnterpriseVisible($unit->enterprise, $actor);
        }
        if ($unit->company_id) {
            $this->assertCompanyVisible($unit->company, $actor);
        }
    }

    private function assertEnterpriseVisible(Enterprise $enterprise, ?User $actor): void
    {
        if (!$this->hasGlobalCompanyScope($actor)) {
            $codes = $this->authorizedCompanyCodes($actor);
            $companyIds = Company::query()->whereIn('code', $codes)->pluck('id')->all();
            
            $hasAccess = $enterprise->companies()
                ->wherePivot('is_active', true)
                ->whereIn('companies.id', $companyIds)
                ->exists();
            
            if (!$hasAccess) {
                throw new OrganizationException(
                    'ENTERPRISE_NOT_VISIBLE',
                    'You do not have access to this enterprise.',
                    403
                );
            }
        }
    }

    /** @param array<int,array{id:int,parentId:?int}> $byId */
    private function pathLabels(array $byId): array
    {
        $labels = [];

        foreach ($byId as $id => $location) {
            $chain = [];
            $cursor = $location['id'];

            for ($i = 0; $i < 100 && $cursor !== null; $i++) {
                if (!isset($byId[$cursor])) {
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

        for ($i = 0; $i < 100 && $cursor !== null; $i++) {
            if (!isset($byId[$cursor])) {
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
        if ($value === null || $value === '' || !is_numeric($value)) {
            return null;
        }
        return (float) $value;
    }

    private function snapshot(OrganizationLocation $location): array
    {
        return [
            'id' => (int) $location->id,
            'enterpriseId' => $location->enterprise_id === null ? null : (int) $location->enterprise_id,
            'companyId' => (int) $location->company_id,
            'parentId' => $location->parent_id === null ? null : (int) $location->parent_id,
            'code' => $location->code,
            'name' => $location->name,
            'kind' => $location->kind,
            'status' => $location->status,
        ];
    }

    private function snapshotMapping(OrganizationWorkLocationMapping $mapping): array
    {
        return [
            'id' => (int) $mapping->id,
            'organizationLocationId' => (int) $mapping->organization_location_id,
            'mappingType' => $mapping->mapping_type,
            'isActive' => (bool) $mapping->is_active,
        ];
    }

    private function audit(User $actor, string $changeType, ?array $old, ?array $new): void
    {
        $request = request();
        if ($request) {
            AuditLogger::log($request, $changeType, self::MODULE, $old, $new);
        }
    }
}