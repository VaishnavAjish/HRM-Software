<?php

namespace App\Services\Authorization;

use Illuminate\Support\Arr;

class ScopeMatcher
{
    /**
     * A subject's company_code is not always a single value: multi-company
     * Admins created via "Company Access (Select one or both)" store it as a
     * comma list (e.g. "nidhi-impex,silver-star"), and the frontend's default
     * "All Companies" view requests resourceTenant "all-companies" for every
     * canAdminManage user, Super Admin included. Plain string equality never
     * matches either case, so a legitimate multi-company Admin was denied on
     * every permission-gated route while Super Admin sailed through only
     * because role 0 is short-circuited to $global=true beforehand. This
     * mirrors the comma/"all"-aware scoping AuthorizedUserQuery, AdminController,
     * SalariesSlipController and UserController already use at the query level.
     */
    public function tenantMatches(?string $subjectTenant, ?string $resourceTenant, bool $global): bool
    {
        if ($global || !$resourceTenant || in_array($resourceTenant, ['all', 'all-companies'], true)) {
            return true;
        }
        if ($subjectTenant === null) {
            return false;
        }
        $subjectTenants = array_filter(array_map('trim', explode(',', $subjectTenant)));
        if (array_intersect(['all', 'all-companies'], $subjectTenants)) {
            return true;
        }
        return in_array($resourceTenant, $subjectTenants, true);
    }

    public function matches(string $scopeType, ?string $scopeId, array $subject, array $resource): bool
    {
        $type = strtoupper($scopeType ?: 'TENANT');
        $resourceId = $resource['id'] ?? $resource['resource_id'] ?? null;

        return match ($type) {
            'GLOBAL' => true,
            'TENANT', 'COMPANY' => $this->tenant($resource) === null
                || $this->tenantMatches($scopeId ?: ($subject['company_code'] ?? null), $this->tenant($resource), false),
            'GROUP' => $this->equals($scopeId, $resource['group_id'] ?? null),
            'LEGAL_ENTITY' => $this->equals($scopeId, $resource['legal_entity_id'] ?? null),
            'BRANCH' => $this->equals($scopeId, $resource['branch_id'] ?? null),
            'LOCATION' => $this->equals($scopeId, $resource['location_id'] ?? null),
            'BUSINESS_UNIT' => $this->equals($scopeId, $resource['unit'] ?? $resource['business_unit_id'] ?? null),
            'DEPARTMENT' => $this->equals($scopeId, $resource['department_id'] ?? $resource['department'] ?? null),
            'TEAM' => $this->equals($scopeId, $resource['team_id'] ?? null),
            'SELF' => $this->equals($subject['id'] ?? null, $resourceId),
            'OWN_RECORDS' => $this->equals($subject['id'] ?? null, $resource['owner_id'] ?? $resource['created_by'] ?? null),
            'DIRECT_REPORTS' => $this->equals($subject['id'] ?? null, $resource['manager_id'] ?? null),
            'INDIRECT_REPORTS' => in_array((string) $resourceId, array_map('strval', Arr::wrap($subject['indirect_report_ids'] ?? [])), true),
            'ASSIGNED_RECORDS' => $this->equals($subject['id'] ?? null, $resource['assigned_to'] ?? null),
            'SHARED_RECORDS' => in_array((string) ($subject['id'] ?? ''), array_map('strval', Arr::wrap($resource['shared_with'] ?? [])), true),
            'SELECTED_RECORDS' => in_array((string) $resourceId, $this->selectedIds($scopeId), true),
            'CUSTOM_FILTER' => in_array((string) $resourceId, array_map('strval', Arr::wrap($subject['custom_scope_ids'] ?? [])), true),
            default => false,
        };
    }

    public function tenant(array $resource): ?string
    {
        $value = $resource['tenant_id'] ?? $resource['company_code'] ?? $resource['organization_code'] ?? null;
        return $value === null || $value === '' ? null : (string) $value;
    }

    private function equals(mixed $a, mixed $b): bool
    {
        return $a !== null && $b !== null && (string) $a === (string) $b;
    }

    private function selectedIds(?string $scopeId): array
    {
        if (!$scopeId) {
            return [];
        }
        $decoded = json_decode($scopeId, true);
        $values = is_array($decoded) ? $decoded : explode(',', $scopeId);
        return array_map(fn ($value) => trim((string) $value), $values);
    }
}
