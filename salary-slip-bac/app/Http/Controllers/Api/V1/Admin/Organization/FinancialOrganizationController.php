<?php

namespace App\Http\Controllers\Api\V1\Admin\Organization;

use App\Http\Controllers\Controller;
use App\Models\FinancialAllocationLine;
use App\Models\FinancialAllocationRule;
use App\Models\FinancialGlMapping;
use App\Models\FinancialOrganization;
use App\Services\Organization\FinancialOrganizationService;
use App\Services\Provisioning\ProvisioningException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 02.05 — Financial Organization.
 *
 * Financial organizations (cost/profit centers...), GL mappings, and allocation
 * rules with their percentage lines. Routes carry permission:org.financial.*;
 * the service owns tenancy, code-uniqueness, parent-cycle and the <=100% rule.
 */
class FinancialOrganizationController extends Controller
{
    public function __construct(
        private readonly FinancialOrganizationService $service,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->organizations([
                'enterpriseId' => $request->query('enterprise_id', $request->query('enterpriseId')),
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'search' => $request->query('search'),
                'type' => $request->query('type'),
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
        $data = $request->validate($this->orgRules());

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->create($data, auth('api')->user())
            ),
        ], 201));
    }

    public function show(int $id): JsonResponse
    {
        $org = FinancialOrganization::query()->find($id);

        if (! $org) {
            return $this->missing('Financial organization not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present($org),
        ]));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $org = FinancialOrganization::query()->find($id);

        if (! $org) {
            return $this->missing('Financial organization not found.');
        }

        $data = $request->validate($this->orgRules(true));

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($org, $data, auth('api')->user())
            ),
        ]));
    }

    public function setStatus(Request $request, int $id): JsonResponse
    {
        $org = FinancialOrganization::query()->find($id);

        if (! $org) {
            return $this->missing('Financial organization not found.');
        }

        $data = $request->validate(['status' => ['required', 'string', Rule::in(FinancialOrganization::STATUSES)]]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->setStatus($org, $data['status'], auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $id): JsonResponse
    {
        $org = FinancialOrganization::query()->find($id);

        if (! $org) {
            return $this->missing('Financial organization not found.');
        }

        return $this->guarded(function () use ($org) {
            $this->service->delete($org, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $org->id]]);
        });
    }

    /* ------------------------------------------------------------ GL mappings */

    public function glMappings(Request $request, int $orgId): JsonResponse
    {
        if (! $this->orgExists($orgId)) {
            return $this->missing('Financial organization not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->glMappings($orgId, [
                'search' => $request->query('search'),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]));
    }

    public function storeGlMapping(Request $request, int $orgId): JsonResponse
    {
        if (! $this->orgExists($orgId)) {
            return $this->missing('Financial organization not found.');
        }

        $data = $request->validate([
            'glAccountCode' => ['required', 'string', 'max:60'],
            'glAccountName' => ['sometimes', 'nullable', 'string', 'max:190'],
            'mappingType' => ['sometimes', 'string', Rule::in(FinancialGlMapping::MAPPING_TYPES)],
            'isActive' => ['sometimes', 'boolean'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentGlMapping(
                $this->service->createGlMapping($orgId, $data, auth('api')->user())
            ),
        ], 201));
    }

    public function updateGlMapping(Request $request, int $orgId, int $id): JsonResponse
    {
        $mapping = FinancialGlMapping::query()->find($id);

        if (! $mapping) {
            return $this->missing('GL mapping not found.');
        }

        $data = $request->validate([
            'glAccountCode' => ['sometimes', 'string', 'max:60'],
            'glAccountName' => ['sometimes', 'nullable', 'string', 'max:190'],
            'mappingType' => ['sometimes', 'string', Rule::in(FinancialGlMapping::MAPPING_TYPES)],
            'isActive' => ['sometimes', 'boolean'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentGlMapping(
                $this->service->updateGlMapping($mapping, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroyGlMapping(int $orgId, int $id): JsonResponse
    {
        $mapping = FinancialGlMapping::query()->find($id);

        if (! $mapping) {
            return $this->missing('GL mapping not found.');
        }

        return $this->guarded(function () use ($mapping) {
            $this->service->deleteGlMapping($mapping, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $mapping->id]]);
        });
    }

    /* --------------------------------------------------------- allocation rules */

    public function allocationRules(Request $request): JsonResponse
    {
        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->allocationRules([
                'enterpriseId' => $request->query('enterprise_id', $request->query('enterpriseId')),
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'search' => $request->query('search'),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]));
    }

    public function storeAllocationRule(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enterpriseId' => ['sometimes', 'nullable', 'integer'],
            'companyId' => ['sometimes', 'nullable', 'integer', 'exists:companies,id'],
            'sourceFinancialOrganizationId' => ['required', 'integer', 'exists:financial_organizations,id'],
            'code' => ['sometimes', 'nullable', 'string', 'max:60'],
            'name' => ['required', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'status' => ['sometimes', 'string', Rule::in(FinancialAllocationRule::STATUSES)],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
            'isActive' => ['sometimes', 'boolean'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentAllocationRule(
                $this->service->createAllocationRule($data, auth('api')->user())
            ),
        ], 201));
    }

    public function updateAllocationRule(Request $request, int $id): JsonResponse
    {
        $rule = FinancialAllocationRule::query()->find($id);

        if (! $rule) {
            return $this->missing('Allocation rule not found.');
        }

        $data = $request->validate([
            'code' => ['sometimes', 'nullable', 'string', 'max:60'],
            'name' => ['sometimes', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'status' => ['sometimes', 'string', Rule::in(FinancialAllocationRule::STATUSES)],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
            'isActive' => ['sometimes', 'boolean'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentAllocationRule(
                $this->service->updateAllocationRule($rule, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroyAllocationRule(int $id): JsonResponse
    {
        $rule = FinancialAllocationRule::query()->find($id);

        if (! $rule) {
            return $this->missing('Allocation rule not found.');
        }

        return $this->guarded(function () use ($rule) {
            $this->service->deleteAllocationRule($rule, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $rule->id]]);
        });
    }

    /* ------------------------------------------------------- allocation lines */

    public function allocationLines(Request $request, int $ruleId): JsonResponse
    {
        if (! $this->ruleExists($ruleId)) {
            return $this->missing('Allocation rule not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->allocationLines($ruleId, [
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]));
    }

    public function storeAllocationLine(Request $request, int $ruleId): JsonResponse
    {
        if (! $this->ruleExists($ruleId)) {
            return $this->missing('Allocation rule not found.');
        }

        $data = $request->validate([
            'targetFinancialOrganizationId' => ['required', 'integer', 'exists:financial_organizations,id'],
            'percentage' => ['required', 'numeric', 'between:0,100'],
            'basis' => ['sometimes', 'nullable', 'string', 'max:100'],
            'isActive' => ['sometimes', 'boolean'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentAllocationLine(
                $this->service->createAllocationLine($ruleId, $data, auth('api')->user())
            ),
        ], 201));
    }

    public function updateAllocationLine(Request $request, int $ruleId, int $id): JsonResponse
    {
        $line = FinancialAllocationLine::query()->find($id);

        if (! $line) {
            return $this->missing('Allocation line not found.');
        }

        $data = $request->validate([
            'percentage' => ['sometimes', 'numeric', 'between:0,100'],
            'basis' => ['sometimes', 'nullable', 'string', 'max:100'],
            'isActive' => ['sometimes', 'boolean'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentAllocationLine(
                $this->service->updateAllocationLine($line, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroyAllocationLine(int $ruleId, int $id): JsonResponse
    {
        $line = FinancialAllocationLine::query()->find($id);

        if (! $line) {
            return $this->missing('Allocation line not found.');
        }

        return $this->guarded(function () use ($line) {
            $this->service->deleteAllocationLine($line, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $line->id]]);
        });
    }

    /* ----------------------------------------------------------------- helpers */

    private function orgRules(bool $update = false): array
    {
        $rules = [
            'enterpriseId' => ['sometimes', 'nullable', 'integer'],
            'companyId' => ['integer', 'exists:companies,id'],
            'parentId' => ['sometimes', 'nullable', 'integer'],
            'code' => ['sometimes', 'nullable', 'string', 'max:60'],
            'name' => ['string', 'max:190'],
            'type' => ['sometimes', 'string', Rule::in(FinancialOrganization::TYPES)],
            'status' => ['sometimes', 'string', Rule::in(FinancialOrganization::STATUSES)],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'managerUserId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'legacyCostCenterId' => ['sometimes', 'nullable', 'integer'],
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

    private function orgExists(int $id): bool
    {
        return FinancialOrganization::query()->whereKey($id)->exists();
    }

    private function ruleExists(int $id): bool
    {
        return FinancialAllocationRule::query()->whereKey($id)->exists();
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
