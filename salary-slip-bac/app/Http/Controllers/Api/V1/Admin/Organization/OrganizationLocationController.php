<?php

namespace App\Http\Controllers\Api\V1\Admin\Organization;

use App\Http\Controllers\Controller;
use App\Models\OrganizationLocation;
use App\Models\OrganizationLocationType;
use App\Models\OrganizationWorkLocationMapping;
use App\Services\Organization\OrganizationLocationService;
use App\Services\Provisioning\ProvisioningException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 02.04 — Organization Locations.
 *
 * Locations (branch/office/plant/...), configurable location types, and
 * effective-dated work-location mappings. Routes carry permission:org.location.*
 * and org.location_type.*; the service owns tenancy and zone/region rules.
 */
class OrganizationLocationController extends Controller
{
    public function __construct(
        private readonly OrganizationLocationService $service,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->locations([
                'enterpriseId' => $request->query('enterprise_id', $request->query('enterpriseId')),
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'search' => $request->query('search'),
                'kind' => $request->query('kind'),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]);
    }

    public function options(Request $request): JsonResponse
    {
        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->treeOptions([
                'enterpriseId' => $request->query('enterprise_id', $request->query('enterpriseId')),
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'search' => $request->query('search'),
            ], auth('api')->user()),
        ]));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->locationRules());

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->create($data, auth('api')->user())
            ),
        ], 201));
    }

    public function show(int $id): JsonResponse
    {
        $location = OrganizationLocation::query()->find($id);

        if (! $location) {
            return $this->missing('Organization location not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present($location),
        ]));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $location = OrganizationLocation::query()->find($id);

        if (! $location) {
            return $this->missing('Organization location not found.');
        }

        $data = $request->validate($this->locationRules(true));

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($location, $data, auth('api')->user())
            ),
        ]));
    }

    public function setStatus(Request $request, int $id): JsonResponse
    {
        $location = OrganizationLocation::query()->find($id);

        if (! $location) {
            return $this->missing('Organization location not found.');
        }

        $data = $request->validate(['status' => ['required', 'string', Rule::in(OrganizationLocation::STATUSES)]]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->setStatus($location, $data['status'], auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $id): JsonResponse
    {
        $location = OrganizationLocation::query()->find($id);

        if (! $location) {
            return $this->missing('Organization location not found.');
        }

        return $this->guarded(function () use ($location) {
            $this->service->delete($location, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $location->id]]);
        });
    }

    /* -------------------------------------------------------- location types */

    public function locationTypes(Request $request): JsonResponse
    {
        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->locationTypes([
                'search' => $request->query('search'),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]));
    }

    public function storeLocationType(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:60'],
            'name' => ['required', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'isActive' => ['sometimes', 'boolean'],
            'sortOrder' => ['sometimes', 'integer'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->createLocationType($data, auth('api')->user()),
        ], 201));
    }

    /* --------------------------------------------------------------- mappings */

    public function mappings(Request $request): JsonResponse
    {
        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->mappings([
                'enterpriseId' => $request->query('enterprise_id', $request->query('enterpriseId')),
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'locationId' => $request->query('location_id', $request->query('locationId')),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]));
    }

    public function storeMapping(Request $request): JsonResponse
    {
        $data = $request->validate([
            'organizationLocationId' => ['required', 'integer', 'exists:organization_locations,id'],
            'organizationUnitId' => ['sometimes', 'nullable', 'integer', 'exists:organization_units,id'],
            'positionId' => ['sometimes', 'nullable', 'integer', 'exists:organization_positions,id'],
            'userId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'mappingType' => ['sometimes', 'string', Rule::in(OrganizationWorkLocationMapping::MAPPING_TYPES)],
            'effectiveFrom' => ['required', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
            'isActive' => ['sometimes', 'boolean'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentMapping(
                $this->service->createMapping($data, auth('api')->user())
            ),
        ], 201));
    }

    public function destroyMapping(int $id): JsonResponse
    {
        $mapping = OrganizationWorkLocationMapping::query()->find($id);

        if (! $mapping) {
            return $this->missing('Work-location mapping not found.');
        }

        return $this->guarded(function () use ($mapping) {
            $this->service->deleteMapping($mapping, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $mapping->id]]);
        });
    }

    /* ----------------------------------------------------------------- helpers */

    private function locationRules(bool $update = false): array
    {
        $rules = [
            'enterpriseId' => ['sometimes', 'nullable', 'integer'],
            'companyId' => ['integer', 'exists:companies,id'],
            'locationTypeId' => ['sometimes', 'nullable', 'integer', 'exists:organization_location_types,id'],
            'parentId' => ['sometimes', 'nullable', 'integer'],
            'zoneId' => ['sometimes', 'nullable', 'integer'],
            'regionId' => ['sometimes', 'nullable', 'integer'],
            'territoryId' => ['sometimes', 'nullable', 'integer'],
            'code' => ['sometimes', 'nullable', 'string', 'max:60'],
            'name' => ['string', 'max:190'],
            'kind' => ['sometimes', 'string', Rule::in(OrganizationLocation::KINDS)],
            'status' => ['sometimes', 'string', Rule::in(OrganizationLocation::STATUSES)],
            'address' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'city' => ['sometimes', 'nullable', 'string', 'max:120'],
            'state' => ['sometimes', 'nullable', 'string', 'max:120'],
            'countryCode' => ['sometimes', 'nullable', 'string', 'size:2', 'alpha'],
            'postalCode' => ['sometimes', 'nullable', 'string', 'max:20'],
            'timezone' => ['sometimes', 'nullable', 'string', 'max:64'],
            'latitude' => ['sometimes', 'nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['sometimes', 'nullable', 'numeric', 'between:-180,180'],
            'contactEmail' => ['sometimes', 'nullable', 'email', 'max:190'],
            'contactPhone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
        ];

        if ($update) {
            foreach ($rules as $key => $rule) {
                $rules[$key] = array_merge(['sometimes'], $rule);
            }
        } else {
            $rules['companyId'][] = 'required';
            $rules['name'][] = 'required';
        }

        return $rules;
    }

    private function guarded(callable $run): JsonResponse
    {
        try {
            return $run();
        } catch (ProvisioningException $e) {
            return response()->json([
                'success' => false,
                'error' => ['code' => $e->errorCode, 'message' => $e->getMessage()],
            ], $e->status);
        }
    }

    private function missing(string $message): JsonResponse
    {
        return response()->json([
            'success' => false,
            'error' => ['code' => 'NOT_FOUND', 'message' => $message],
        ], 404);
    }
}
