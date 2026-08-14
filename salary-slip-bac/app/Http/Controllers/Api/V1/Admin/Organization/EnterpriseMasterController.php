<?php

namespace App\Http\Controllers\Api\V1\Admin\Organization;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Services\Organization\EnterpriseMasterService;
use App\Services\Provisioning\ProvisioningException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 02.01 — Enterprise Master.
 *
 * Reads the company list with its enterprise attributes, edits only the
 * statutory/contact columns, and never touches `code`, `name` or `is_active` —
 * those belong to Access Control, which owns the tenant key.
 */
class EnterpriseMasterController extends Controller
{
    public function __construct(private readonly EnterpriseMasterService $service)
    {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->companies([
                'search' => $request->query('search'),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $company = Company::query()->find($id);

        if (! $company) {
            return $this->missing('Company not found.');
        }

        $data = $request->validate([
            'legalName' => ['sometimes', 'nullable', 'string', 'max:190'],
            'registrationNumber' => ['sometimes', 'nullable', 'string', 'max:100'],
            'taxIdentification' => ['sometimes', 'nullable', 'string', 'max:100'],
            'incorporationDate' => ['sometimes', 'nullable', 'date'],
            'countryCode' => ['sometimes', 'nullable', 'string', 'size:2'],
            'timezone' => ['sometimes', 'nullable', 'string', 'max:64', Rule::in(timezone_identifiers_list())],
            'primaryAddress' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'contactEmail' => ['sometimes', 'nullable', 'email', 'max:190'],
            'contactPhone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'fiscalYearStart' => ['sometimes', 'nullable', 'string', 'regex:/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/'],
            'currency' => ['sometimes', 'nullable', 'string', 'size:3', 'alpha'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->updateEnterprise($company, $data, auth('api')->user())
            ),
        ]));
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