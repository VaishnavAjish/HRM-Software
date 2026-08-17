<?php

namespace App\Http\Controllers\Api\V1\Admin\Organization;

use App\Http\Controllers\Controller;
use App\Services\Organization\OrganizationChartService;
use App\Services\Provisioning\ProvisioningException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 02.08 — Organization Chart (read-only).
 *
 * Builds tree/span-of-control/vacancy graphs across the organization domain.
 * Routes carry permission:org.chart.read; the service owns the builders.
 */
class OrganizationChartController extends Controller
{
    public const CHART_TYPES = [
        'enterprise', 'legal_entity', 'department', 'team', 'position',
        'manager_hierarchy', 'employee_hierarchy',
    ];

    public function __construct(
        private readonly OrganizationChartService $service,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'chartType' => ['sometimes', 'string', Rule::in(self::CHART_TYPES)],
            'asOf' => ['sometimes', 'nullable', 'date'],
            'rootId' => ['sometimes', 'nullable', 'integer'],
            'maxDepth' => ['sometimes', 'integer', 'min:1', 'max:20'],
            'includeInactive' => ['sometimes', 'boolean'],
            'includeVacant' => ['sometimes', 'boolean'],
            'search' => ['sometimes', 'nullable', 'string', 'max:190'],
            'enterpriseId' => ['sometimes', 'nullable', 'integer'],
            'companyIds' => ['sometimes', 'array'],
            'companyIds.*' => ['integer'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->chart(
                array_merge($data, [
                    'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                    'enterpriseId' => $request->query('enterprise_id', $request->query('enterpriseId')),
                ]),
                auth('api')->user()
            ),
        ]));
    }

    public function activity(Request $request): JsonResponse
    {
        $data = $request->validate([
            'page' => ['sometimes', 'integer', 'min:1'],
            'perPage' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->recentActivity($data),
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
}
