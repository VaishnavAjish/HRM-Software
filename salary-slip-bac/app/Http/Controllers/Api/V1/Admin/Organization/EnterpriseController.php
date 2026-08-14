<?php

namespace App\Http\Controllers\Api\V1\Admin\Organization;

use App\Http\Controllers\Controller;
use App\Models\Enterprise;
use App\Services\Organization\EnterpriseService;
use App\Services\Provisioning\ProvisioningException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 02.01 — Enterprise Management. *
 * Thin V1 controller: routes carry permission:org.enterprise.*, the service
 * owns the tenancy and group-structure rules. This file only resolves records,
 * validates request shape, and renders the envelope.
 */
class EnterpriseController extends Controller
{
    public function __construct(
        private readonly EnterpriseService $service,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->enterprises([
                'search' => $request->query('search'),
                'status' => $request->query('status'),
                'type' => $request->query('type'),
            ], auth('api')->user()),
        ]);
    }

    /** Companies the actor may attach to an enterprise — pickers everywhere need it. */
    public function companies(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->assignableCompanies(auth('api')->user()),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $enterprise = Enterprise::query()->find($id);

        if (! $enterprise) {
            return $this->missing('Enterprise not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present($enterprise, auth('api')->user()),
        ]));
    }

    public function history(int $id): JsonResponse
    {
        $enterprise = Enterprise::query()->find($id);

        if (! $enterprise) {
            return $this->missing('Enterprise not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->history($enterprise, auth('api')->user()),
        ]));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:60'],
            'enterpriseType' => ['sometimes', 'string', Rule::in(Enterprise::TYPES)],
            'parentId' => ['sometimes', 'nullable', 'integer', 'exists:enterprises,id'],
            'name' => ['required', 'string', 'max:190'],
            'displayName' => ['sometimes', 'nullable', 'string', 'max:190'],
            'registrationNumber' => ['sometimes', 'nullable', 'string', 'max:100'],
            'taxIdentification' => ['sometimes', 'nullable', 'string', 'max:100'],
            'incorporationDate' => ['sometimes', 'nullable', 'date'],
            'countryCode' => ['sometimes', 'nullable', 'string', 'size:2', 'alpha'],
            'timezone' => ['sometimes', 'nullable', 'string', 'max:64'],
            'primaryAddress' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'contactEmail' => ['sometimes', 'nullable', 'email', 'max:190'],
            'contactPhone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'fiscalYearStart' => ['sometimes', 'nullable', 'string', 'regex:/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/'],
            'currency' => ['sometimes', 'nullable', 'string', 'size:3', 'alpha'],
            'logoDocumentId' => ['sometimes', 'nullable', 'integer'],
            'brandPrimaryColor' => ['sometimes', 'nullable', 'string', 'max:20'],
            'brandSecondaryColor' => ['sometimes', 'nullable', 'string', 'max:20'],
            'isActive' => ['sometimes', 'boolean'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
            'companyIds' => ['sometimes', 'array'],
            'companyIds.*' => ['integer', 'exists:companies,id'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->create($data, auth('api')->user()),
                auth('api')->user()
            ),
        ], 201));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $enterprise = Enterprise::query()->find($id);

        if (! $enterprise) {
            return $this->missing('Enterprise not found.');
        }

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:60'],
            'enterpriseType' => ['sometimes', 'string', Rule::in(Enterprise::TYPES)],
            'parentId' => ['sometimes', 'nullable', 'integer', 'exists:enterprises,id'],
            'name' => ['sometimes', 'string', 'max:190'],
            'displayName' => ['sometimes', 'nullable', 'string', 'max:190'],
            'registrationNumber' => ['sometimes', 'nullable', 'string', 'max:100'],
            'taxIdentification' => ['sometimes', 'nullable', 'string', 'max:100'],
            'incorporationDate' => ['sometimes', 'nullable', 'date'],
            'countryCode' => ['sometimes', 'nullable', 'string', 'size:2', 'alpha'],
            'timezone' => ['sometimes', 'nullable', 'string', 'max:64'],
            'primaryAddress' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'contactEmail' => ['sometimes', 'nullable', 'email', 'max:190'],
            'contactPhone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'fiscalYearStart' => ['sometimes', 'nullable', 'string', 'regex:/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/'],
            'currency' => ['sometimes', 'nullable', 'string', 'size:3', 'alpha'],
            'logoDocumentId' => ['sometimes', 'nullable', 'integer'],
            'brandPrimaryColor' => ['sometimes', 'nullable', 'string', 'max:20'],
            'brandSecondaryColor' => ['sometimes', 'nullable', 'string', 'max:20'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
            'companyIds' => ['sometimes', 'array'],
            'companyIds.*' => ['integer', 'exists:companies,id'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($enterprise, $data, auth('api')->user()),
                auth('api')->user()
            ),
        ]));
    }

    public function setStatus(Request $request, int $id): JsonResponse
    {
        $enterprise = Enterprise::query()->find($id);

        if (! $enterprise) {
            return $this->missing('Enterprise not found.');
        }

        $data = $request->validate(['isActive' => ['required', 'boolean']]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->setStatus($enterprise, (bool) $data['isActive'], auth('api')->user()),
                auth('api')->user()
            ),
        ]));
    }

    public function destroy(int $id): JsonResponse
    {
        $enterprise = Enterprise::query()->find($id);

        if (! $enterprise) {
            return $this->missing('Enterprise not found.');
        }

        return $this->guarded(function () use ($enterprise) {
            $this->service->delete($enterprise, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $enterprise->id]]);
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
