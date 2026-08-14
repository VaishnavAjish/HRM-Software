<?php

namespace App\Http\Controllers\Api\V1\Admin\Organization;

use App\Http\Controllers\Controller;
use App\Models\Calendar;
use App\Models\CalendarHoliday;
use App\Services\Organization\CalendarService;
use App\Services\Provisioning\ProvisioningException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 02.10 — Calendars and Calendar Management.
 *
 * Thin V1 controller: the routes carry permission:org.calendar.*, the service
 * owns the tenancy and schedule rules. This file resolves records, validates
 * request shape, and renders the envelope.
 */
class CalendarController extends Controller
{
    public function __construct(private readonly CalendarService $service)
    {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->calendars([
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'unitIds' => $request->query('unit_ids', $request->query('unitIds')),
                'search' => $request->query('search'),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'companyId' => ['required', 'integer', 'exists:companies,id'],
            'unitId' => ['nullable', 'integer', 'exists:units,id'],
            'name' => ['required', 'string', 'max:140'],
            'description' => ['nullable', 'string', 'max:2000'],
            'workWeek' => ['nullable', 'array'],
            'workWeek.*' => ['string', 'distinct', Rule::in(array_keys($this->dayLabels()))],
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
        $calendar = Calendar::query()->find($id);

        if (! $calendar) {
            return $this->missing('Calendar not found.');
        }

        $data = $request->validate([
            'unitId' => ['sometimes', 'nullable', 'integer', 'exists:units,id'],
            'name' => ['sometimes', 'string', 'max:140'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'workWeek' => ['sometimes', 'array'],
            'workWeek.*' => ['string', 'distinct', Rule::in(array_keys($this->dayLabels()))],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($calendar, $data, auth('api')->user())
            ),
        ]));
    }

    public function setStatus(Request $request, int $id): JsonResponse
    {
        $calendar = Calendar::query()->find($id);

        if (! $calendar) {
            return $this->missing('Calendar not found.');
        }

        $data = $request->validate(['isActive' => ['required', 'boolean']]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->setStatus($calendar, (bool) $data['isActive'], auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $id): JsonResponse
    {
        $calendar = Calendar::query()->find($id);

        if (! $calendar) {
            return $this->missing('Calendar not found.');
        }

        return $this->guarded(function () use ($calendar) {
            $this->service->delete($calendar, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $calendar->id]]);
        });
    }

    /* -------------------------------------------------------------- holidays */

    public function holidays(Request $request, int $id): JsonResponse
    {
        $calendar = Calendar::query()->find($id);

        if (! $calendar) {
            return $this->missing('Calendar not found.');
        }

        $year = $request->query('year');

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->holidays(
                $calendar,
                $year !== null && $year !== '' ? (int) $year : null,
                auth('api')->user()
            ),
        ]));
    }

    public function storeHoliday(Request $request, int $id): JsonResponse
    {
        $calendar = Calendar::query()->find($id);

        if (! $calendar) {
            return $this->missing('Calendar not found.');
        }

        $data = $request->validate([
            'date' => ['required', 'date'],
            'title' => ['required', 'string', 'max:190'],
            'kind' => ['required', 'string', Rule::in(CalendarHoliday::KINDS)],
            'isHalfDay' => ['nullable', 'boolean'],
            'recurring' => ['nullable', 'string', Rule::in(['annual'])],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentHoliday(
                $this->service->upsertHoliday($calendar, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroyHoliday(int $id, int $holidayId): JsonResponse
    {
        $calendar = Calendar::query()->find($id);

        if (! $calendar) {
            return $this->missing('Calendar not found.');
        }

        $holiday = CalendarHoliday::query()->where('calendar_id', $calendar->id)->find($holidayId);

        if (! $holiday) {
            return $this->missing('Holiday not found.');
        }

        return $this->guarded(function () use ($calendar, $holiday) {
            $this->service->deleteHoliday($calendar, $holiday, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $holiday->id]]);
        });
    }

    /* -------------------------------------------------------------- helpers */

    private function dayLabels(): array
    {
        return array_fill_keys(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], true);
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