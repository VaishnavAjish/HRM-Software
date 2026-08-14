<?php

namespace App\Services\Organization;

use App\Models\Calendar;
use App\Models\CalendarHoliday;
use App\Models\Company;
use App\Models\Unit;
use App\Models\User;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * DOMAIN 02.10 — Calendars and Calendar Management.
 *
 * A calendar is the working-week schedule master: per company, optionally bound
 * to a unit whose schedule overrides the company default. Holidays are dated
 * rows; `kind` distinguishes holiday / optional / workday, and `recurring =
 * annual` lets a holiday repeat without being copied into every year.
 *
 * A calendar that still carries holidays is never deleted — history belongs to
 * the company, and "retired" is what deactivation means.
 */
class CalendarService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'organization-calendars';

    public const DEFAULT_WORK_WEEK = ['mon', 'tue', 'wed', 'thu', 'fri'];

    public function calendars(array $filters, ?User $actor): array
    {
        $query = Calendar::query()->with(['company', 'unit'])->orderBy('name');

        if (! empty($filters['companyIds'])) {
            $query->whereIn('company_id', array_map('intval', (array) $filters['companyIds']));
        } elseif (! $this->hasGlobalCompanyScope($actor)) {
            $codes = $this->authorizedCompanyCodes($actor);
            $query->whereIn('company_id', Company::query()->whereIn('code', $codes)->pluck('id'));
        }

        if (! empty($filters['unitIds'])) {
            $unitIds = array_map('intval', (array) $filters['unitIds']);
            $query->where(function ($inner) use ($unitIds) {
                $inner->whereIn('unit_id', $unitIds)
                    ->orWhereNull('unit_id');
            });
        }

        if (($search = trim((string) ($filters['search'] ?? ''))) !== '') {
            $query->where(function ($inner) use ($search) {
                $inner->where('name', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            });
        }

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('is_active', $status === 'ACTIVE');
        }

        return $query->get()->map(fn (Calendar $calendar) => $this->present($calendar))->all();
    }

    public function present(Calendar $calendar): array
    {
        return [
            'id' => (int) $calendar->id,
            'companyId' => (int) $calendar->company_id,
            'companyName' => $calendar->company?->name,
            'unitId' => $calendar->unit_id === null ? null : (int) $calendar->unit_id,
            'unitName' => $calendar->unit?->name,
            'name' => $calendar->name,
            'description' => $calendar->description,
            'workWeek' => $calendar->work_week ?: self::DEFAULT_WORK_WEEK,
            'isActive' => (bool) $calendar->is_active,
            'holidayCount' => $calendar->holidays()->count(),
            'createdAt' => $calendar->created_at,
        ];
    }

    public function create(array $data, User $actor): Calendar
    {
        $company = Company::query()->findOrFail((int) $data['companyId']);
        $this->assertCompanyVisible($company, $actor);

        if (! $company->is_active) {
            throw new OrganizationException(
                'COMPANY_INACTIVE',
                'Calendars cannot be added to an inactive company.',
                422
            );
        }

        $name = trim((string) $data['name']);
        $unitId = isset($data['unitId']) && $data['unitId'] !== '' ? (int) $data['unitId'] : null;

        $this->resolveUnit($company->id, $unitId);
        $this->assertNameFree($company->id, $unitId, $name, null);

        $calendar = DB::transaction(fn () => Calendar::query()->create([
            'company_id' => $company->id,
            'unit_id' => $unitId,
            'name' => $name,
            'description' => $this->blankToNull($data['description'] ?? null),
            'work_week' => $this->normaliseWorkWeek($data['workWeek'] ?? null),
            'is_active' => (bool) ($data['isActive'] ?? true),
        ]));

        $this->audit($actor, 'CALENDAR_CREATED', null, $this->snapshot($calendar));

        return $calendar;
    }

    public function update(Calendar $calendar, array $data, User $actor): Calendar
    {
        $this->assertCompanyVisible($calendar->company, $actor);
        $before = $this->snapshot($calendar);

        if (array_key_exists('name', $data)) {
            $name = trim((string) $data['name']);
            $this->assertNameFree($calendar->company_id, $calendar->unit_id, $name, $calendar->id);
            $calendar->name = $name;
        }

        if (array_key_exists('unitId', $data)) {
            $unitId = $data['unitId'] === '' || $data['unitId'] === null ? null : (int) $data['unitId'];
            $this->resolveUnit($calendar->company_id, $unitId);
            $this->assertNameFree($calendar->company_id, $unitId, $calendar->name, $calendar->id);
            $calendar->unit_id = $unitId;
        }

        if (array_key_exists('description', $data)) {
            $calendar->description = $this->blankToNull($data['description']);
        }

        if (array_key_exists('workWeek', $data)) {
            $calendar->work_week = $this->normaliseWorkWeek($data['workWeek']);
        }

        DB::transaction(fn () => $calendar->save());

        $this->audit($actor, 'CALENDAR_UPDATED', $before, $this->snapshot($calendar));

        return $calendar;
    }

    public function setStatus(Calendar $calendar, bool $active, User $actor): Calendar
    {
        $this->assertCompanyVisible($calendar->company, $actor);
        $before = $this->snapshot($calendar);

        $calendar->is_active = $active;
        $calendar->save();

        $this->audit($actor, $active ? 'CALENDAR_ACTIVATED' : 'CALENDAR_DEACTIVATED', $before, $this->snapshot($calendar));

        return $calendar;
    }

    public function delete(Calendar $calendar, User $actor): void
    {
        $this->assertCompanyVisible($calendar->company, $actor);

        if ($calendar->holidays()->exists()) {
            throw new OrganizationException(
                'CALENDAR_HAS_HOLIDAYS',
                'Cannot delete this calendar while holidays exist on it. Remove or deactivate it instead.',
                422
            );
        }

        $snapshot = $this->snapshot($calendar);

        DB::transaction(fn () => $calendar->delete());

        $this->audit($actor, 'CALENDAR_DELETED', $snapshot, null);
    }

    /** @return list<array{id:int,date:string,title:string,kind:string,isHalfDay:bool,recurring:?string}> */
    public function holidays(Calendar $calendar, ?int $year, User $actor): array
    {
        $this->assertCompanyVisible($calendar->company, $actor);

        $query = $calendar->holidays()->orderBy('date');

        if ($year !== null) {
            $query->where(function ($inner) use ($year) {
                $inner->whereYear('date', $year)
                    ->orWhere('recurring', 'annual');
            });
        }

        return $query->get()->map(fn (CalendarHoliday $holiday) => $this->presentHoliday($holiday))->all();
    }

    /** Upsert on the (calendar_id, date) unique key. */
    public function upsertHoliday(Calendar $calendar, array $data, User $actor): CalendarHoliday
    {
        $this->assertCompanyVisible($calendar->company, $actor);

        $date = $data['date'];
        $existing = $calendar->holidays()->where('date', $date)->first();

        $holiday = DB::transaction(function () use ($calendar, $data, $date, $existing) {
            $payload = [
                'title' => trim((string) $data['title']),
                'kind' => $data['kind'],
                'is_half_day' => (bool) ($data['isHalfDay'] ?? false),
                'recurring' => isset($data['recurring']) && $data['recurring'] !== '' ? $data['recurring'] : null,
            ];

            if ($existing) {
                $existing->fill($payload)->save();

                return $existing;
            }

            return CalendarHoliday::query()->create([
                'calendar_id' => $calendar->id,
                'date' => $date,
                ...$payload,
            ]);
        });

        $this->audit($actor, 'HOLIDAY_UPSERTED', $existing ? $this->snapshotHoliday($existing) : null, $this->snapshotHoliday($holiday));

        return $holiday;
    }

    public function deleteHoliday(Calendar $calendar, CalendarHoliday $holiday, User $actor): void
    {
        $this->assertCompanyVisible($calendar->company, $actor);

        $snapshot = $this->snapshotHoliday($holiday);

        DB::transaction(fn () => $holiday->delete());

        $this->audit($actor, 'HOLIDAY_DELETED', $snapshot, null);
    }

    /* -------------------------------------------------------------- helpers */

    private function resolveUnit(int $companyId, ?int $unitId): void
    {
        if ($unitId === null) {
            return;
        }

        $unit = Unit::query()->find($unitId);

        if (! $unit || $unit->company_id !== $companyId) {
            throw new OrganizationException(
                'UNIT_COMPANY_MISMATCH',
                'A calendar can only be bound to a unit in the same company.',
                422
            );
        }
    }

    private function assertNameFree(int $companyId, ?int $unitId, string $name, ?int $ignoreId): void
    {
        $exists = Calendar::query()
            ->where('company_id', $companyId)
            ->where('unit_id', $unitId)
            ->where('name', $name)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new OrganizationException(
                'CALENDAR_NAME_TAKEN',
                'That pair already has a calendar with this name.',
                422
            );
        }
    }

    /** Accepts a list like ["mon","tue"] validated by the controller; NULL becomes the default week. */
    private function normaliseWorkWeek(mixed $workWeek): ?array
    {
        if (! is_array($workWeek) || $workWeek === []) {
            return null;
        }

        return array_values(array_map('strval', $workWeek));
    }

    public function presentHoliday(CalendarHoliday $holiday): array
    {
        return [
            'id' => (int) $holiday->id,
            'date' => $holiday->date->toDateString(),
            'title' => $holiday->title,
            'kind' => $holiday->kind,
            'isHalfDay' => (bool) $holiday->is_half_day,
            'recurring' => $holiday->recurring,
        ];
    }

    private function blankToNull(mixed $value): ?string
    {
        if ($value === null || (is_string($value) && trim($value) === '')) {
            return null;
        }

        return trim((string) $value);
    }

    private function snapshot(Calendar $calendar): array
    {
        return [
            'id' => (int) $calendar->id,
            'companyId' => (int) $calendar->company_id,
            'unitId' => $calendar->unit_id === null ? null : (int) $calendar->unit_id,
            'name' => $calendar->name,
            'isActive' => (bool) $calendar->is_active,
        ];
    }

    private function snapshotHoliday(CalendarHoliday $holiday): array
    {
        return [
            'id' => (int) $holiday->id,
            'date' => $holiday->date->toDateString(),
            'title' => $holiday->title,
            'kind' => $holiday->kind,
        ];
    }

    private function audit(User $actor, string $changeType, ?array $old, ?array $new): void
    {
        $request = request();

        if ($request) {
            AuditLogger::log($request, $changeType, self::MODULE, $old, $new);
        }
    }
}