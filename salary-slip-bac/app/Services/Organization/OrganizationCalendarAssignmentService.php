<?php

namespace App\Services\Organization;

use App\Models\Calendar;
use App\Models\OrganizationCalendarAssignment;
use App\Models\Enterprise;
use App\Models\EnterpriseCompanyMembership;
use App\Models\Company;
use App\Models\Department;
use App\Models\OrganizationLocation;
use App\Models\User;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * DOMAIN 02.10 — Calendar Assignments Service.
 *
 * Resolves calendars with precedence:
 * Department → Location → Company → Enterprise → Country
 * Financial and payroll calendars are resolved independently.
 */
class OrganizationCalendarAssignmentService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'organization-calendar-assignments';

    public const CALENDAR_KINDS = [
        'working_day',
        'financial',
        'payroll',
    ];

    public const SCOPE_TYPES = [
        'enterprise',
        'company',
        'country',
        'location',
        'department',
    ];

    public function assignments(array $filters, ?User $actor): array
    {
        $query = OrganizationCalendarAssignment::query()
            ->with(['calendar', 'calendar.company', 'calendar.unit'])
            ->orderBy('calendar_kind')
            ->orderBy('priority', 'desc');

        if (!empty($filters['calendarId'])) {
            $query->where('calendar_id', (int) $filters['calendarId']);
        }

        if (($kind = (string) ($filters['calendarKind'] ?? '')) !== '' && $kind !== 'ALL') {
            $query->where('calendar_kind', $kind);
        }

        if (($scopeType = (string) ($filters['scopeType'] ?? '')) !== '' && $scopeType !== 'ALL') {
            $query->where('scope_type', $scopeType);
        }

        if (!empty($filters['scopeId'])) {
            $query->where('scope_id', (int) $filters['scopeId']);
        }

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('is_active', $status === 'ACTIVE');
        }

        return $query->get()->map(fn (OrganizationCalendarAssignment $assignment) => $this->present($assignment))->all();
    }

    public function present(OrganizationCalendarAssignment $assignment): array
    {
        return [
            'id' => (int) $assignment->id,
            'calendarId' => (int) $assignment->calendar_id,
            'calendarName' => $assignment->calendar?->name,
            'calendarKind' => $assignment->calendar_kind,
            'scopeType' => $assignment->scope_type,
            'scopeId' => (int) $assignment->scope_id,
            'scopeName' => $this->resolveScopeName($assignment->scope_type, $assignment->scope_id),
            'priority' => (int) $assignment->priority,
            'effectiveFrom' => $assignment->effective_from?->toDateString(),
            'effectiveTo' => $assignment->effective_to?->toDateString(),
            'isActive' => (bool) $assignment->is_active,
            'createdAt' => $assignment->created_at,
        ];
    }

    public function create(array $data, User $actor): OrganizationCalendarAssignment
    {
        $calendar = Calendar::query()->findOrFail((int) $data['calendarId']);
        $this->assertCalendarVisible($calendar, $actor);

        $scopeType = $data['scopeType'];
        $scopeId = (int) $data['scopeId'];

        $this->validateScope($scopeType, $scopeId, $calendar, $actor);

        // Check for overlapping assignments
        $this->checkOverlap($calendar->id, $scopeType, $scopeId, $data['calendarKind'], null, $data['effectiveFrom'] ?? null, $data['effectiveTo'] ?? null);

        $assignment = DB::transaction(function () use ($calendar, $scopeType, $scopeId, $data) {
            return OrganizationCalendarAssignment::query()->create([
                'calendar_id' => $calendar->id,
                'calendar_kind' => $data['calendarKind'] ?? 'working_day',
                'scope_type' => $scopeType,
                'scope_id' => $scopeId,
                'priority' => (int) ($data['priority'] ?? 0),
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
                'is_active' => (bool) ($data['isActive'] ?? true),
            ]);
        });

        $this->audit($actor, 'CALENDAR_ASSIGNMENT_CREATED', null, $this->snapshot($assignment));

        return $assignment;
    }

    public function update(OrganizationCalendarAssignment $assignment, array $data, User $actor): OrganizationCalendarAssignment
    {
        $this->assertCalendarVisible($assignment->calendar, $actor);
        $before = $this->snapshot($assignment);

        if (array_key_exists('calendarId', $data)) {
            $calendar = Calendar::query()->findOrFail((int) $data['calendarId']);
            $this->assertCalendarVisible($calendar, $actor);
            $assignment->calendar_id = $calendar->id;
        }

        if (array_key_exists('calendarKind', $data)) {
            $assignment->calendar_kind = $data['calendarKind'];
        }

        if (array_key_exists('scopeType', $data)) {
            $assignment->scope_type = $data['scopeType'];
        }

        if (array_key_exists('scopeId', $data)) {
            $assignment->scope_id = (int) $data['scopeId'];
        }

        if (array_key_exists('priority', $data)) {
            $assignment->priority = (int) $data['priority'];
        }

        if (array_key_exists('effectiveFrom', $data)) {
            $assignment->effective_from = $this->blankToNull($data['effectiveFrom']);
        }

        if (array_key_exists('effectiveTo', $data)) {
            $assignment->effective_to = $this->blankToNull($data['effectiveTo']);
        }

        if (array_key_exists('isActive', $data)) {
            $assignment->is_active = (bool) $data['isActive'];
        }

        // Check for overlaps with other assignments
        $this->checkOverlap(
            $assignment->calendar_id,
            $assignment->scope_type,
            $assignment->scope_id,
            $assignment->calendar_kind,
            $assignment->id,
            $assignment->effective_from,
            $assignment->effective_to
        );

        DB::transaction(fn () => $assignment->save());

        $this->audit($actor, 'CALENDAR_ASSIGNMENT_UPDATED', $before, $this->snapshot($assignment));

        return $assignment;
    }

    public function setStatus(OrganizationCalendarAssignment $assignment, bool $active, User $actor): OrganizationCalendarAssignment
    {
        $this->assertCalendarVisible($assignment->calendar, $actor);
        $before = $this->snapshot($assignment);
        $assignment->is_active = $active;
        $assignment->save();

        $this->audit($actor, $active ? 'CALENDAR_ASSIGNMENT_ACTIVATED' : 'CALENDAR_ASSIGNMENT_DEACTIVATED', $before, $this->snapshot($assignment));

        return $assignment;
    }

    public function delete(OrganizationCalendarAssignment $assignment, User $actor): void
    {
        $this->assertCalendarVisible($assignment->calendar, $actor);
        $snapshot = $this->snapshot($assignment);
        DB::transaction(fn () => $assignment->delete());
        $this->audit($actor, 'CALENDAR_ASSIGNMENT_DELETED', $snapshot, null);
    }

    // Calendar Resolution
    public function resolve(array $filters, ?User $actor): array
    {
        $employeeId = $filters['employeeId'] ?? null;
        $positionId = $filters['positionId'] ?? null;
        $departmentId = $filters['departmentId'] ?? null;
        $locationId = $filters['locationId'] ?? null;
        $companyId = $filters['companyId'] ?? null;
        $enterpriseId = $filters['enterpriseId'] ?? null;
        $countryCode = $filters['countryCode'] ?? null;
        $calendarKind = $filters['calendarKind'] ?? 'working_day';
        $asOf = $filters['asOf'] ?? now()->toDateString();

        $resolved = [];

        // Build scope chain based on provided identifiers
        $scopes = $this->buildScopeChain($employeeId, $positionId, $departmentId, $locationId, $companyId, $enterpriseId, $countryCode);

        foreach ($scopes as $scope) {
            $assignments = OrganizationCalendarAssignment::query()
                ->with('calendar')
                ->where('calendar_kind', $calendarKind)
                ->where('scope_type', $scope['type'])
                ->where('scope_id', $scope['id'])
                ->where('is_active', true)
                ->where('effective_from', '<=', $asOf)
                ->where(function ($q) use ($asOf) {
                    $q->where('effective_to', '>=', $asOf)
                        ->orWhereNull('effective_to');
                })
                ->orderBy('priority', 'desc')
                ->get();

            foreach ($assignments as $assignment) {
                if ($assignment->calendar && $assignment->calendar->is_active) {
                    $resolved[] = [
                        'calendarId' => (int) $assignment->calendar_id,
                        'calendarName' => $assignment->calendar->name,
                        'calendarKind' => $assignment->calendar_kind,
                        'scopeType' => $assignment->scope_type,
                        'scopeId' => (int) $assignment->scope_id,
                        'scopeName' => $scope['name'],
                        'priority' => (int) $assignment->priority,
                        'workWeek' => $assignment->calendar->work_week,
                        'matchedBy' => $scope['type'],
                    ];
                }
            }
        }

        // Return the highest priority match for each scope type
        $byScopeType = [];
        foreach ($resolved as $match) {
            $scopeType = $match['scopeType'];
            if (!isset($byScopeType[$scopeType]) || $match['priority'] > $byScopeType[$scopeType]['priority']) {
                $byScopeType[$scopeType] = $match;
            }
        }

        // Apply precedence: Department → Location → Company → Enterprise → Country
        $precedence = ['department', 'location', 'company', 'enterprise', 'country'];
        $finalCalendar = null;

        foreach ($precedence as $scopeType) {
            if (isset($byScopeType[$scopeType])) {
                $finalCalendar = $byScopeType[$scopeType];
                break;
            }
        }

        return [
            'resolvedCalendar' => $finalCalendar,
            'allMatches' => array_values($byScopeType),
            'precedence' => $precedence,
        ];
    }

    public function preview(array $filters, ?User $actor): array
    {
        $employeeId = $filters['employeeId'] ?? null;
        $positionId = $filters['positionId'] ?? null;
        $departmentId = $filters['departmentId'] ?? null;
        $locationId = $filters['locationId'] ?? null;
        $companyId = $filters['companyId'] ?? null;
        $enterpriseId = $filters['enterpriseId'] ?? null;
        $countryCode = $filters['countryCode'] ?? null;
        $asOf = $filters['asOf'] ?? now()->toDateString();

        $kinds = ['working_day', 'financial', 'payroll'];
        $preview = [];

        foreach ($kinds as $kind) {
            $resolved = $this->resolve(array_merge($filters, ['calendarKind' => $kind]), $actor);
            $preview[$kind] = $resolved;
        }

        return $preview;
    }

    private function buildScopeChain(?int $employeeId, ?int $positionId, ?int $departmentId, ?int $locationId, ?int $companyId, ?int $enterpriseId, ?string $countryCode): array
    {
        $scopes = [];

        if ($employeeId) {
            $employee = User::query()->find($employeeId);
            if ($employee) {
                if ($employee->company_code) {
                    $codes = explode(',', $employee->company_code);
                    foreach ($codes as $code) {
                        $company = Company::query()->where('code', trim($code))->first();
                        if ($company) {
                            $scopes[] = ['type' => 'company', 'id' => $company->id, 'name' => $company->name];
                            $enterprise = $this->enterpriseForCompany($company->id);
                            if ($enterprise) {
                                $scopes[] = ['type' => 'enterprise', 'id' => $enterprise->id, 'name' => $enterprise->name];
                            }
                        }
                    }
                }
            }
        }

        if ($departmentId) {
            $dept = Department::query()->find($departmentId);
            if ($dept) {
                $scopes[] = ['type' => 'department', 'id' => $dept->id, 'name' => $dept->name];
            }
        }

        if ($locationId) {
            $location = OrganizationLocation::query()->find($locationId);
            if ($location) {
                $scopes[] = ['type' => 'location', 'id' => $location->id, 'name' => $location->name];
            }
        }

        if ($companyId) {
            $company = Company::query()->find($companyId);
            if ($company) {
                $scopes[] = ['type' => 'company', 'id' => $company->id, 'name' => $company->name];
                $enterprise = $this->enterpriseForCompany($company->id);
                if ($enterprise) {
                    $scopes[] = ['type' => 'enterprise', 'id' => $enterprise->id, 'name' => $enterprise->name];
                }
            }
        }

        if ($enterpriseId) {
            $enterprise = Enterprise::query()->find($enterpriseId);
            if ($enterprise) {
                $scopes[] = ['type' => 'enterprise', 'id' => $enterprise->id, 'name' => $enterprise->name];
            }
        }

        if ($countryCode) {
            $scopes[] = ['type' => 'country', 'id' => $countryCode, 'name' => $countryCode];
        }

        return $scopes;
    }

    private function validateScope(string $scopeType, int $scopeId, Calendar $calendar, ?User $actor): void
    {
        $modelClass = match ($scopeType) {
            'enterprise' => Enterprise::class,
            'company' => Company::class,
            'country' => null, // No model for country
            'location' => OrganizationLocation::class,
            'department' => Department::class,
            default => null,
        };

        if ($modelClass) {
            $record = $modelClass::query()->find($scopeId);
            if (!$record) {
                throw new OrganizationException(
                    'CALENDAR_ASSIGNMENT_SCOPE_NOT_FOUND',
                    "The referenced {$scopeType} record does not exist.",
                    422
                );
            }

            // Check scope alignment with calendar
            if ($calendar->company_id && $record->company_id && $record->company_id !== $calendar->company_id) {
                throw new OrganizationException(
                    'CALENDAR_ASSIGNMENT_SCOPE_MISMATCH',
                    "The {$scopeType} must belong to the same company as the calendar.",
                    422
                );
            }

            if ($calendar->enterprise_id && $record->enterprise_id && $record->enterprise_id !== $calendar->enterprise_id) {
                throw new OrganizationException(
                    'CALENDAR_ASSIGNMENT_SCOPE_MISMATCH',
                    "The {$scopeType} must belong to the same enterprise as the calendar.",
                    422
                );
            }
        }
    }

    private function checkOverlap(int $calendarId, string $scopeType, int $scopeId, string $calendarKind, ?int $ignoreId, ?string $effectiveFrom, ?string $effectiveTo): void
    {
        $query = OrganizationCalendarAssignment::query()
            ->where('calendar_id', $calendarId)
            ->where('calendar_kind', $calendarKind)
            ->where('scope_type', $scopeType)
            ->where('scope_id', $scopeId)
            ->where('is_active', true);

        if ($ignoreId) {
            $query->where('id', '!=', $ignoreId);
        }

        // Check for date overlap
        if ($effectiveFrom || $effectiveTo) {
            $query->where(function ($q) use ($effectiveFrom, $effectiveTo) {
                if ($effectiveFrom) {
                    $q->where(function ($inner) use ($effectiveFrom) {
                        $inner->where('effective_to', '>=', $effectiveFrom)
                            ->orWhereNull('effective_to');
                    });
                }
                if ($effectiveTo) {
                    $q->where(function ($inner) use ($effectiveTo) {
                        $inner->where('effective_from', '<=', $effectiveTo)
                            ->orWhereNull('effective_from');
                    });
                }
            });
        }

        if ($query->exists()) {
            throw new OrganizationException(
                'CALENDAR_ASSIGNMENT_OVERLAP',
                'An active assignment already exists for this scope and calendar kind with overlapping dates. Use priority to resolve conflicts.',
                422
            );
        }
    }

    private function resolveScopeName(string $scopeType, int $scopeId): string
    {
        return match ($scopeType) {
            'enterprise' => Enterprise::query()->find($scopeId)?->name ?? "Enterprise #{$scopeId}",
            'company' => Company::query()->find($scopeId)?->name ?? "Company #{$scopeId}",
            'country' => "Country {$scopeId}",
            'location' => OrganizationLocation::query()->find($scopeId)?->name ?? "Location #{$scopeId}",
            'department' => Department::query()->find($scopeId)?->name ?? "Department #{$scopeId}",
            default => "Unknown #{$scopeId}",
        };
    }

    private function assertCalendarVisible(Calendar $calendar, ?User $actor): void
    {
        if ($calendar->company_id) {
            $this->assertCompanyVisible($calendar->company, $actor);
        }
    }

    private function enterpriseForCompany(int $companyId): ?Enterprise
    {
        $membership = EnterpriseCompanyMembership::query()
            ->where('company_id', $companyId)
            ->where('is_active', true)
            ->orderBy('id')
            ->first();

        if (! $membership) {
            return null;
        }

        return Enterprise::query()->find($membership->enterprise_id);
    }

    private function blankToNull(mixed $value): ?string
    {
        if ($value === null || (is_string($value) && trim($value) === '')) {
            return null;
        }
        return trim((string) $value);
    }

    private function snapshot(OrganizationCalendarAssignment $assignment): array
    {
        return [
            'id' => (int) $assignment->id,
            'calendarId' => (int) $assignment->calendar_id,
            'calendarKind' => $assignment->calendar_kind,
            'scopeType' => $assignment->scope_type,
            'scopeId' => (int) $assignment->scope_id,
            'priority' => (int) $assignment->priority,
            'isActive' => (bool) $assignment->is_active,
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