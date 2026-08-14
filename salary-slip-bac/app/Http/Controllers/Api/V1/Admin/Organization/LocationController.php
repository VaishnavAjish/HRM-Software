<?php

namespace App\Http\Controllers\Api\V1\Admin\Organization;

use App\Http\Controllers\Controller;
use App\Models\Location;
use App\Services\Organization\LocationService;
use App\Services\Provisioning\ProvisioningException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 02.03 / 02.04 — Business Structure and Branch/Location Management.
 *
 * Thin V1 controller: the routes carry permission:org.location.*, the service
 * owns the tenancy and tree rules. This file resolves records, validates
 * request shape, and renders the envelope.
 */
class LocationController extends Controller
{
    public function __construct(private readonly LocationService $service)
    {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->locations([
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'parentId' => $request->query('parentId'),
                'kind' => $request->query('kind'),
                'search' => $request->query('search'),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]);
    }

    /** Flat, path-labelled options for the parent picker. */
    public function options(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->treeOptions([
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
            ], auth('api')->user(), $request->integer('excludeId') ?: null),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'companyId' => ['required', 'integer', 'exists:companies,id'],
            'parentId' => ['nullable', 'integer'],
            'code' => ['nullable', 'string', 'max:60'],
            'name' => ['required', 'string', 'max:190'],
            'kind' => ['required', 'string', Rule::in(Location::KINDS)],
            'isActive' => ['nullable', 'boolean'],
            'address' => ['nullable', 'string', 'max:2000'],
            'city' => ['nullable', 'string', 'max:120'],
            'state' => ['nullable', 'string', 'max:120'],
            'countryCode' => ['nullable', 'string', 'size:2', 'alpha'],
            'postalCode' => ['nullable', 'string', 'max:20'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'contactEmail' => ['nullable', 'email', 'max:190'],
            'contactPhone' => ['nullable', 'string', 'max:32'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->create($data, auth('api')->user())
            ),
        ], 201));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $location = Location::query()->find($id);

        if (! $location) {
            return $this->missing('Location not found.');
        }

        $data = $request->validate([
            'companyId' => ['sometimes', 'integer', 'exists:companies,id'],
            'parentId' => ['sometimes', 'nullable', 'integer'],
            'code' => ['sometimes', 'string', 'max:60'],
            'name' => ['sometimes', 'string', 'max:190'],
            'kind' => ['sometimes', 'string', Rule::in(Location::KINDS)],
            'address' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'city' => ['sometimes', 'nullable', 'string', 'max:120'],
            'state' => ['sometimes', 'nullable', 'string', 'max:120'],
            'countryCode' => ['sometimes', 'nullable', 'string', 'size:2', 'alpha'],
            'postalCode' => ['sometimes', 'nullable', 'string', 'max:20'],
            'latitude' => ['sometimes', 'nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['sometimes', 'nullable', 'numeric', 'between:-180,180'],
            'contactEmail' => ['sometimes', 'nullable', 'email', 'max:190'],
            'contactPhone' => ['sometimes', 'nullable', 'string', 'max:32'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($location, $data, auth('api')->user())
            ),
        ]));
    }

    public function setStatus(Request $request, int $id): JsonResponse
    {
        $location = Location::query()->find($id);

        if (! $location) {
            return $this->missing('Location not found.');
        }

        $data = $request->validate(['isActive' => ['required', 'boolean']]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->setStatus($location, (bool) $data['isActive'], auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $id): JsonResponse
    {
        $location = Location::query()->find($id);

        if (! $location) {
            return $this->missing('Location not found.');
        }

        return $this->guarded(function () use ($location) {
            $this->service->delete($location, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $location->id]]);
        });
    }

    /* --------------------------------------------------------------- members */

    public function members(int $id): JsonResponse
    {
        $location = Location::query()->find($id);

        if (! $location) {
            return $this->missing('Location not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->members($location, auth('api')->user()),
        ]));
    }

    public function assignMembers(Request $request, int $id): JsonResponse
    {
        $location = Location::query()->find($id);

        if (! $location) {
            return $this->missing('Location not found.');
        }

        $data = $request->validate([
            'userIds' => ['required', 'array', 'max:200'],
            'userIds.*' => ['integer', 'distinct'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => ['linked' => $this->service->assignMembers($location, $data['userIds'], auth('api')->user())],
        ]));
    }

    public function removeMember(int $id, int $userId): JsonResponse
    {
        $location = Location::query()->find($id);

        if (! $location) {
            return $this->missing('Location not found.');
        }

        return $this->guarded(function () use ($location, $userId) {
            $this->service->removeMember($location, $userId, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['userId' => $userId]]);
        });
    }

    /* -------------------------------------------------------------- helpers */

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