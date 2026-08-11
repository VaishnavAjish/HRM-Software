<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Unit;
use App\Services\Admin\CompanyUnitService;
use App\Services\Provisioning\ProvisioningException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Access Control → Company & Unit.
 *
 * Master data for the tenants every other screen picks from. Deliberately one
 * controller for both entities: a unit cannot exist without its company, every
 * guard here compares one against the other, and splitting them would put the
 * two halves of a single rule in two files.
 *
 * Nothing here decides authorization by itself — the routes carry
 * permission:admin.company.* and admin.unit.*, which default to super
 * administrator only, because a company code is the tenant key and handing its
 * edit to an ordinary administrator hands them every tenant.
 */
class CompanyUnitController extends Controller
{
    public function __construct(
        private readonly CompanyUnitService $service,
        private readonly \App\Services\Provisioning\CompanyMembershipService $companies,
        private readonly \App\Services\Provisioning\UnitMembershipService $units,
    ) {
    }

    /**
     * The companies and units this actor may file a record into.
     *
     * Deliberately NOT admin.company.read. Populating a dropdown and browsing
     * tenant configuration are different capabilities, and collapsing them would
     * force every agent who fills in a trial form to hold the permission that
     * also opens Company & Unit Management — where codes are renamed and
     * companies deleted.
     *
     * Its authorisation is the scope itself: the response contains only the
     * companies the actor is already assigned to, which is information they
     * necessarily have. A super administrator sees all, and already does.
     * Inactive records are excluded — this list is for new assignments, and an
     * inactive company is one that must not receive any.
     */
    public function assignableOptions(): JsonResponse
    {
        $actor = auth('api')->user();
        $companies = $this->companies->optionsFor($actor);

        return response()->json([
            'success' => true,
            'data' => [
                'companies' => $companies,
                'units' => $this->units->optionsForCompanies(array_column($companies, 'id')),
            ],
        ]);
    }

    /* ------------------------------------------------------------ companies */

    public function companies(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->companies([
                'search' => $request->query('search'),
                'status' => $request->query('status'),
            ]),
        ]);
    }

    public function storeCompany(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:190'],
            'code' => ['required', 'string', 'max:64', Rule::unique('companies', 'code')],
            'isActive' => ['nullable', 'boolean'],
        ], [
            'code.unique' => 'That company code already exists.',
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentCompany(
                $this->service->createCompany($data, auth('api')->user())
            ),
        ], 201));
    }

    public function updateCompany(Request $request, int $id): JsonResponse
    {
        $company = Company::query()->find($id);

        if (! $company) {
            return $this->missing('Company not found.');
        }

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:190'],
            'code' => ['sometimes', 'required', 'string', 'max:64', Rule::unique('companies', 'code')->ignore($id)],
        ], [
            'code.unique' => 'That company code already exists.',
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentCompany(
                $this->service->updateCompany($company, $data, auth('api')->user())
            ),
        ]));
    }

    public function setCompanyStatus(Request $request, int $id): JsonResponse
    {
        $company = Company::query()->find($id);

        if (! $company) {
            return $this->missing('Company not found.');
        }

        $data = $request->validate(['isActive' => ['required', 'boolean']]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentCompany(
                $this->service->setCompanyStatus($company, (bool) $data['isActive'], auth('api')->user())
            ),
        ]));
    }

    public function destroyCompany(int $id): JsonResponse
    {
        $company = Company::query()->find($id);

        if (! $company) {
            return $this->missing('Company not found.');
        }

        return $this->guarded(function () use ($company) {
            $this->service->deleteCompany($company, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $company->id]]);
        });
    }

    /* ---------------------------------------------------------------- units */

    public function units(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->units([
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'search' => $request->query('search'),
                'status' => $request->query('status'),
            ]),
        ]);
    }

    public function storeUnit(Request $request): JsonResponse
    {
        $data = $request->validate([
            'companyId' => ['required', 'integer', 'exists:companies,id'],
            'name' => ['required', 'string', 'max:190'],
            'code' => ['nullable', 'string', 'max:64'],
            'isActive' => ['nullable', 'boolean'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentUnit(
                $this->service->createUnit($data, auth('api')->user())
            ),
        ], 201));
    }

    public function updateUnit(Request $request, int $id): JsonResponse
    {
        $unit = Unit::query()->find($id);

        if (! $unit) {
            return $this->missing('Unit not found.');
        }

        $data = $request->validate([
            'companyId' => ['sometimes', 'required', 'integer', 'exists:companies,id'],
            'name' => ['sometimes', 'required', 'string', 'max:190'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentUnit(
                $this->service->updateUnit($unit, $data, auth('api')->user())
            ),
        ]));
    }

    public function setUnitStatus(Request $request, int $id): JsonResponse
    {
        $unit = Unit::query()->find($id);

        if (! $unit) {
            return $this->missing('Unit not found.');
        }

        $data = $request->validate(['isActive' => ['required', 'boolean']]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentUnit(
                $this->service->setUnitStatus($unit, (bool) $data['isActive'], auth('api')->user())
            ),
        ]));
    }

    public function destroyUnit(int $id): JsonResponse
    {
        $unit = Unit::query()->find($id);

        if (! $unit) {
            return $this->missing('Unit not found.');
        }

        return $this->guarded(function () use ($unit) {
            $this->service->deleteUnit($unit, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $unit->id]]);
        });
    }

    /* ------------------------------------------------------- legacy mapping */

    public function legacyUnits(): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->service->unmappedLegacyUnits()]);
    }

    public function adoptLegacyUnit(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:190'],
            'companyId' => ['required', 'integer', 'exists:companies,id'],
        ]);

        $company = Company::query()->findOrFail((int) $data['companyId']);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->adoptLegacyUnit($data['name'], $company, auth('api')->user()),
        ]));
    }

    /* -------------------------------------------------------------- helpers */

    /** Every rule the service enforces surfaces in the envelope this API uses. */
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
