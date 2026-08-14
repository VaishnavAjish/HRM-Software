<?php

namespace App\Http\Controllers\Api\V1\Admin\Organization;

use App\Http\Controllers\Controller;
use App\Models\LegalEntity;
use App\Services\Organization\LegalEntityService;
use App\Services\Provisioning\ProvisioningException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 02.02 — Legal Entity Management.
 *
 * Thin V1 controller: the routes carry permission:org.legal_entity.*, the
 * service owns the tenancy and primary-entity rules. This file only resolves
 * records, validates request shape, and renders the envelope.
 */
class LegalEntityController extends Controller
{
    public function __construct(
        private readonly LegalEntityService $service,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->legalEntities([
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'search' => $request->query('search'),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]);
    }

    /** Companies the actor may raise a legal entity under — pickers everywhere need it. */
    public function companies(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->assignableCompanies(auth('api')->user()),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'companyId' => ['required', 'integer', 'exists:companies,id'],
            'code' => ['nullable', 'string', 'max:60'],
            'name' => ['required', 'string', 'max:190'],
            'legalName' => ['required', 'string', 'max:190'],
            'registrationNumber' => ['nullable', 'string', 'max:100'],
            'countryCode' => ['nullable', 'string', 'size:2', 'alpha'],
            'taxId' => ['nullable', 'string', 'max:100'],
            'currency' => ['nullable', 'string', 'size:3', 'alpha'],
            'fiscalYearStart' => ['nullable', 'string', 'regex:/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/'],
            'primaryAddress' => ['nullable', 'string', 'max:2000'],
            'contactEmail' => ['nullable', 'email', 'max:190'],
            'contactPhone' => ['nullable', 'string', 'max:32'],
            'isPrimary' => ['nullable', 'boolean'],
            'isActive' => ['nullable', 'boolean'],
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
        $entity = LegalEntity::query()->find($id);

        if (! $entity) {
            return $this->missing('Legal entity not found.');
        }

        $data = $request->validate([
            'companyId' => ['sometimes', 'integer', 'exists:companies,id'],
            'code' => ['sometimes', 'string', 'max:60'],
            'name' => ['sometimes', 'string', 'max:190'],
            'legalName' => ['sometimes', 'string', 'max:190'],
            'registrationNumber' => ['sometimes', 'nullable', 'string', 'max:100'],
            'countryCode' => ['sometimes', 'nullable', 'string', 'size:2', 'alpha'],
            'taxId' => ['sometimes', 'nullable', 'string', 'max:100'],
            'currency' => ['sometimes', 'nullable', 'string', 'size:3', 'alpha'],
            'fiscalYearStart' => ['sometimes', 'nullable', 'string', 'regex:/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/'],
            'primaryAddress' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'contactEmail' => ['sometimes', 'nullable', 'email', 'max:190'],
            'contactPhone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'isPrimary' => ['sometimes', 'boolean'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($entity, $data, auth('api')->user())
            ),
        ]));
    }

    public function setStatus(Request $request, int $id): JsonResponse
    {
        $entity = LegalEntity::query()->find($id);

        if (! $entity) {
            return $this->missing('Legal entity not found.');
        }

        $data = $request->validate(['isActive' => ['required', 'boolean']]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->setStatus($entity, (bool) $data['isActive'], auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $id): JsonResponse
    {
        $entity = LegalEntity::query()->find($id);

        if (! $entity) {
            return $this->missing('Legal entity not found.');
        }

        return $this->guarded(function () use ($entity) {
            $this->service->delete($entity, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $entity->id]]);
        });
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