<?php

namespace App\Http\Controllers\Api\V1\Admin\Organization;

use App\Http\Controllers\Controller;
use App\Models\OrganizationCalendarAssignment;
use App\Services\Organization\OrganizationCalendarAssignmentService;
use App\Services\Provisioning\ProvisioningException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 02.10 — Calendar Assignments.
 *
 * Assigns calendars to scopes (department -> location -> company ->
 * enterprise -> country) with numeric priority and effective dating, plus the
 * resolution/preview endpoints that answer "which calendar applies here?".
 * Routes carry permission:org.calendar_assignment.*; the service owns the
 * scope/overlap rules.
 */
class OrganizationCalendarAssignmentController extends Controller
{
    public function __construct(
        private readonly OrganizationCalendarAssignmentService $service,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->assignments([
                'enterpriseId' => $request->query('enterprise_id', $request->query('enterpriseId')),
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'scopeType' => $request->query('scope_type', $request->query('scopeType')),
                'calendarKind' => $request->query('calendar_kind', $request->query('calendarKind')),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'calendarId' => ['required', 'integer', 'exists:calendars,id'],
            'scopeType' => ['required', 'string', Rule::in(OrganizationCalendarAssignment::SCOPES)],
            'scopeId' => ['required', 'integer'],
            'calendarKind' => ['sometimes', 'string', Rule::in(OrganizationCalendarAssignment::KINDS)],
            'priority' => ['sometimes', 'integer'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
            'isActive' => ['sometimes', 'boolean'],
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
        $assignment = OrganizationCalendarAssignment::query()->find($id);

        if (! $assignment) {
            return $this->missing('Calendar assignment not found.');
        }

        $data = $request->validate([
            'calendarId' => ['sometimes', 'integer', 'exists:calendars,id'],
            'scopeType' => ['sometimes', 'string', Rule::in(OrganizationCalendarAssignment::SCOPES)],
            'scopeId' => ['sometimes', 'integer'],
            'calendarKind' => ['sometimes', 'string', Rule::in(OrganizationCalendarAssignment::KINDS)],
            'priority' => ['sometimes', 'integer'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
            'isActive' => ['sometimes', 'boolean'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($assignment, $data, auth('api')->user())
            ),
        ]));
    }

    public function setStatus(Request $request, int $id): JsonResponse
    {
        $assignment = OrganizationCalendarAssignment::query()->find($id);

        if (! $assignment) {
            return $this->missing('Calendar assignment not found.');
        }

        $data = $request->validate(['isActive' => ['required', 'boolean']]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->setStatus($assignment, (bool) $data['isActive'], auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $id): JsonResponse
    {
        $assignment = OrganizationCalendarAssignment::query()->find($id);

        if (! $assignment) {
            return $this->missing('Calendar assignment not found.');
        }

        return $this->guarded(function () use ($assignment) {
            $this->service->delete($assignment, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $assignment->id]]);
        });
    }

    /** Which calendar applies to a scope right now (or asOf). */
    public function resolve(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employeeId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'departmentId' => ['sometimes', 'nullable', 'integer'],
            'locationId' => ['sometimes', 'nullable', 'integer'],
            'companyId' => ['sometimes', 'nullable', 'integer', 'exists:companies,id'],
            'enterpriseId' => ['sometimes', 'nullable', 'integer', 'exists:enterprises,id'],
            'countryCode' => ['sometimes', 'nullable', 'string', 'size:2', 'alpha'],
            'calendarKind' => ['sometimes', 'string', Rule::in(OrganizationCalendarAssignment::KINDS)],
            'asOf' => ['sometimes', 'nullable', 'date'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->resolve($data, auth('api')->user()),
        ]));
    }

    /** Same as resolve, but across all calendar kinds so callers can bulk-fetch. */
    public function preview(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employeeId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'departmentId' => ['sometimes', 'nullable', 'integer'],
            'locationId' => ['sometimes', 'nullable', 'integer'],
            'companyId' => ['sometimes', 'nullable', 'integer', 'exists:companies,id'],
            'enterpriseId' => ['sometimes', 'nullable', 'integer', 'exists:enterprises,id'],
            'countryCode' => ['sometimes', 'nullable', 'string', 'size:2', 'alpha'],
            'asOf' => ['sometimes', 'nullable', 'date'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->preview($data, auth('api')->user()),
        ]));
    }

    /* ----------------------------------------------------------------- helpers */

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