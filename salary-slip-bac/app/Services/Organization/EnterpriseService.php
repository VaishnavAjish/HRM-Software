<?php

namespace App\Services\Organization;

use App\Models\Company;
use App\Models\Enterprise;
use App\Models\EnterpriseCompanyMembership;
use App\Models\OrganizationActivityLog;
use App\Models\User;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\OrganizationActivityLogSupport;
use Illuminate\Support\Facades\DB;

/**
 * DOMAIN 02.01 — Enterprise Management.
 *
 * The enterprise is the group above the company. It classifies itself
 * (standalone / group / holding / parent / subsidiary), may hang under a parent
 * enterprise, and owns the companies through enterprise_company_memberships.
 *
 * The code is the stable identifier and is global. Tenancy here is inverted
 * relative to the company-scoped services: an enterprise is visible to an actor
 * who can see any of its member companies, or to a global actor. Writes are
 * gated by permission:org.enterprise.* on the route; the service enforces the
 * same company-visibility rule so a tenant admin never edits an enterprise they
 * only partially own.
 */
class EnterpriseService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'organization-enterprise';

    public function __construct()
    {
    }

    public function enterprises(array $filters, ?User $actor): array
    {        $query = Enterprise::query()
            ->with('parent')
            ->when(
                ! $this->hasGlobalCompanyScope($actor),
                fn ($inner) => $inner->whereIn('id', $this->visibleEnterpriseIds($actor))
            );

        if (($search = trim((string) ($filters['search'] ?? ''))) !== '') {
            $query->where(function ($inner) use ($search) {
                $inner->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('display_name', 'like', "%{$search}%")
                    ->orWhere('registration_number', 'like', "%{$search}%");
            });
        }

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('is_active', $status === 'ACTIVE');
        }

        if (($type = (string) ($filters['type'] ?? '')) !== '' && $type !== 'ALL') {
            $query->where('enterprise_type', $type);
        }

        return $query->orderBy('name')->get()
            ->map(fn (Enterprise $enterprise) => $this->present($enterprise, $actor))
            ->all();
    }

    /** Companies the actor may attach to an enterprise — pickers everywhere need it. */
    public function assignableCompanies(User $actor): array
    {
        return Company::query()
            ->whereIn('id', $this->visibleCompanyIds($actor))
            ->orderBy('name')
            ->get()
            ->map(static fn (Company $company) => [
                'id' => (int) $company->id,
                'code' => $company->code,
                'name' => $company->name,
                'isActive' => (bool) $company->is_active,
            ])
            ->all();
    }

    public function present(Enterprise $enterprise, ?User $actor): array
    {
        $memberCompanyIds = $enterprise->memberships()
            ->where('is_active', true)
            ->pluck('company_id')
            ->all();

        $visibleCompanyIds = $this->hasGlobalCompanyScope($actor)
            ? $memberCompanyIds
            : array_values(array_intersect($memberCompanyIds, $this->visibleCompanyIds($actor)));

        return [
            'id' => (int) $enterprise->id,
            'code' => $enterprise->code,
            'enterpriseType' => $enterprise->enterprise_type,
            'parentId' => $enterprise->parent_enterprise_id === null ? null : (int) $enterprise->parent_enterprise_id,
            'parentName' => $enterprise->parent?->name,
            'name' => $enterprise->name,
            'displayName' => $enterprise->display_name,
            'registrationNumber' => $enterprise->registration_number,
            'taxIdentification' => $enterprise->tax_identification,
            'incorporationDate' => $enterprise->incorporation_date?->toDateString(),
            'countryCode' => $enterprise->country_code,
            'timezone' => $enterprise->timezone,
            'primaryAddress' => $enterprise->primary_address,
            'contactEmail' => $enterprise->contact_email,
            'contactPhone' => $enterprise->contact_phone,
            'fiscalYearStart' => $enterprise->fiscal_year_start,
            'currency' => $enterprise->currency,
            'logoDocumentId' => $enterprise->logo_document_id === null ? null : (int) $enterprise->logo_document_id,
            'brandPrimaryColor' => $enterprise->brand_primary_color,
            'brandSecondaryColor' => $enterprise->brand_secondary_color,
            'isActive' => (bool) $enterprise->is_active,
            'effectiveFrom' => $enterprise->effective_from?->toDateString(),
            'effectiveTo' => $enterprise->effective_to?->toDateString(),
            'companyIds' => array_values($memberCompanyIds),
            'visibleCompanyIds' => $visibleCompanyIds,
            'companyCount' => count($memberCompanyIds),
            'subsidiaryCount' => $enterprise->children()->count(),
            'createdAt' => $enterprise->created_at,
        ];
    }

    public function create(array $data, User $actor): Enterprise
    {
        $code = trim((string) $data['code']);

        if (Enterprise::query()->where('code', $code)->exists()) {
            throw new OrganizationException(
                'ENTERPRISE_CODE_TAKEN',
                'That enterprise code is already in use.',
                422
            );
        }

        $this->resolveParent($data['parentId'] ?? null, null);

        $enterprise = DB::transaction(fn () => Enterprise::query()->create([
            'code' => $code,
            'enterprise_type' => $data['enterpriseType'] ?? 'standalone',
            'parent_enterprise_id' => $this->nullIfEmpty($data['parentId'] ?? null),
            'name' => trim((string) $data['name']),
            'display_name' => $this->blankToNull($data['displayName'] ?? null),
            'registration_number' => $this->blankToNull($data['registrationNumber'] ?? null),
            'tax_identification' => $this->blankToNull($data['taxIdentification'] ?? null),
            'incorporation_date' => $this->nullIfEmpty($data['incorporationDate'] ?? null),
            'country_code' => $this->blankToNull($data['countryCode'] ?? null),
            'timezone' => $data['timezone'] ?? 'Asia/Kolkata',
            'primary_address' => $this->blankToNull($data['primaryAddress'] ?? null),
            'contact_email' => $this->blankToNull($data['contactEmail'] ?? null),
            'contact_phone' => $this->blankToNull($data['contactPhone'] ?? null),
            'fiscal_year_start' => $this->blankToNull($data['fiscalYearStart'] ?? null),
            'currency' => $data['currency'] ?? 'INR',
            'logo_document_id' => $this->nullIfEmpty($data['logoDocumentId'] ?? null),
            'brand_primary_color' => $this->blankToNull($data['brandPrimaryColor'] ?? null),
            'brand_secondary_color' => $this->blankToNull($data['brandSecondaryColor'] ?? null),
            'is_active' => (bool) ($data['isActive'] ?? true),
            'effective_from' => $this->nullIfEmpty($data['effectiveFrom'] ?? null),
            'effective_to' => $this->nullIfEmpty($data['effectiveTo'] ?? null),
        ]));

        if (isset($data['companyIds']) && is_array($data['companyIds'])) {
            $this->attachCompanies($enterprise, $data['companyIds'], $actor);
        }

        OrganizationActivityLogSupport::log($actor, 'ENTERPRISE_CREATED', 'enterprise', $enterprise->id, null, $this->snapshot($enterprise), 'Enterprise created.', $enterprise->id);

        return $enterprise;
    }

    public function update(Enterprise $enterprise, array $data, User $actor): Enterprise
    {
        $this->assertEnterpriseVisible($enterprise, $actor);
        $before = $this->snapshot($enterprise);

        if (array_key_exists('code', $data)) {
            $code = trim((string) $data['code']);
            $exists = Enterprise::query()->where('code', $code)->where('id', '!=', $enterprise->id)->exists();
            if ($exists) {
                throw new OrganizationException('ENTERPRISE_CODE_TAKEN', 'That enterprise code is already in use.', 422);
            }
            $enterprise->code = $code;
        }

        if (array_key_exists('parentId', $data)) {
            $parentId = $this->nullIfEmpty($data['parentId']);
            $this->resolveParent($parentId, $enterprise->id);
            $enterprise->parent_enterprise_id = $parentId;
        }

        $pairs = [
            'enterpriseType' => 'enterprise_type',
            'name' => 'name',
            'displayName' => 'display_name',
            'registrationNumber' => 'registration_number',
            'taxIdentification' => 'tax_identification',
            'incorporationDate' => 'incorporation_date',
            'countryCode' => 'country_code',
            'timezone' => 'timezone',
            'primaryAddress' => 'primary_address',
            'contactEmail' => 'contact_email',
            'contactPhone' => 'contact_phone',
            'fiscalYearStart' => 'fiscal_year_start',
            'currency' => 'currency',
            'logoDocumentId' => 'logo_document_id',
            'brandPrimaryColor' => 'brand_primary_color',
            'brandSecondaryColor' => 'brand_secondary_color',
            'effectiveFrom' => 'effective_from',
            'effectiveTo' => 'effective_to',
        ];

        foreach ($pairs as $key => $column) {
            if (array_key_exists($key, $data)) {
                $enterprise->{$column} = $this->nullIfEmpty($data[$key]);
            }
        }

        DB::transaction(fn () => $enterprise->save());

        if (isset($data['companyIds']) && is_array($data['companyIds'])) {
            $this->syncCompanies($enterprise, $data['companyIds'], $actor);
        }

        OrganizationActivityLogSupport::log($actor, 'ENTERPRISE_UPDATED', 'enterprise', $enterprise->id, $before, $this->snapshot($enterprise), 'Enterprise updated.', $enterprise->id);

        return $enterprise;
    }

    public function setStatus(Enterprise $enterprise, bool $active, User $actor): Enterprise
    {
        $this->assertEnterpriseVisible($enterprise, $actor);
        $before = $this->snapshot($enterprise);

        $enterprise->is_active = $active;
        $enterprise->save();

        OrganizationActivityLogSupport::log($actor, $active ? 'ENTERPRISE_ACTIVATED' : 'ENTERPRISE_DEACTIVATED', 'enterprise', $enterprise->id, $before, $this->snapshot($enterprise), $active ? 'Enterprise activated.' : 'Enterprise deactivated.', $enterprise->id);

        return $enterprise;
    }

    public function delete(Enterprise $enterprise, User $actor): void
    {
        $this->assertEnterpriseVisible($enterprise, $actor);

        if ($enterprise->children()->exists()) {
            throw new OrganizationException(
                'ENTERPRISE_HAS_CHILDREN',
                'Cannot delete an enterprise while subsidiaries hang under it. Reparent them first.',
                422
            );
        }

        if ($enterprise->memberships()->exists()) {
            throw new OrganizationException(
                'ENTERPRISE_HAS_COMPANIES',
                'Cannot delete an enterprise while companies belong to it. Detach them first.',
                422
            );
        }

        $snapshot = $this->snapshot($enterprise);

        DB::transaction(fn () => $enterprise->delete());

        OrganizationActivityLogSupport::log($actor, 'ENTERPRISE_DELETED', 'enterprise', null, $snapshot, null, 'Enterprise deleted.');
    }

    /* --------------------------------------------------------------- history */

    public function history(Enterprise $enterprise, ?User $actor): array
    {
        $this->assertEnterpriseVisible($enterprise, $actor);

        return OrganizationActivityLog::query()
            ->where('subject_type', 'enterprise')
            ->where('subject_id', $enterprise->id)
            ->orderByDesc('created_at')
            ->limit(200)
            ->get()
            ->map(static fn (OrganizationActivityLog $log) => [
                'id' => (int) $log->id,
                'activityType' => $log->activity_type,
                'description' => $log->description,
                'beforeValues' => $log->before_values,
                'afterValues' => $log->after_values,
                'actorId' => $log->actor_id,
                'actorName' => $log->actor?->name,
                'createdAt' => $log->created_at,
            ])
            ->all();
    }

    /* ---------------------------------------------------------- memberships */

    public function attachCompanies(Enterprise $enterprise, array $companyIds, User $actor): void
    {
        $this->assertEnterpriseVisible($enterprise, $actor);

        DB::transaction(function () use ($enterprise, $companyIds) {
            foreach (array_map('intval', $companyIds) as $companyId) {
                $company = Company::query()->find($companyId);
                if (! $company) {
                    continue;
                }
                $this->assertCompanyVisible($company, auth('api')->user());

                EnterpriseCompanyMembership::query()->updateOrCreate(
                    ['enterprise_id' => $enterprise->id, 'company_id' => $companyId],
                    ['is_active' => true]
                );
            }
        });
    }

    private function syncCompanies(Enterprise $enterprise, array $companyIds, User $actor): void
    {
        $ids = array_values(array_map('intval', $companyIds));
        $visible = $this->visibleCompanyIds($actor);

        foreach ($ids as $id) {
            if (! in_array($id, $visible, true)) {
                throw new OrganizationException('COMPANY_FORBIDDEN', 'You may not attach companies outside your scope.', 403);
            }
        }

        DB::transaction(function () use ($enterprise, $ids) {
            EnterpriseCompanyMembership::query()
                ->where('enterprise_id', $enterprise->id)
                ->whereNotIn('company_id', $ids)
                ->update(['is_active' => false]);

            foreach ($ids as $id) {
                EnterpriseCompanyMembership::query()->updateOrCreate(
                    ['enterprise_id' => $enterprise->id, 'company_id' => $id],
                    ['is_active' => true]
                );
            }
        });
    }

    /* -------------------------------------------------------------- helpers */

    /** @return list<int> */
    private function visibleEnterpriseIds(?User $actor): array
    {
        return EnterpriseCompanyMembership::query()
            ->where('is_active', true)
            ->whereIn('company_id', $this->visibleCompanyIds($actor))
            ->distinct()
            ->pluck('enterprise_id')
            ->all();
    }

    /** @return list<int> */
    private function visibleCompanyIds(?User $actor): array
    {
        if ($actor === null) {
            return [];
        }

        if ($this->hasGlobalCompanyScope($actor)) {
            return Company::query()->pluck('id')->all();
        }

        return Company::query()
            ->whereIn('code', $this->authorizedCompanyCodes($actor))
            ->pluck('id')
            ->all();
    }

    private function assertEnterpriseVisible(Enterprise $enterprise, ?User $actor): void
    {
        if ($this->hasGlobalCompanyScope($actor)) {
            return;
        }

        $visible = $this->visibleEnterpriseIds($actor);

        if (! in_array((int) $enterprise->id, $visible, true)) {
            throw new OrganizationException(
                'ENTERPRISE_FORBIDDEN',
                'You do not have access to enterprise "'.$enterprise->name.'".',
                403
            );
        }
    }

    private function resolveParent(?int $parentId, ?int $enterpriseId): void
    {
        if ($parentId === null) {
            return;
        }

        $parent = Enterprise::query()->find($parentId);

        if (! $parent) {
            throw new OrganizationException('PARENT_NOT_FOUND', 'The selected parent enterprise does not exist.', 422);
        }

        if ($parentId === $enterpriseId) {
            throw new OrganizationException('ENTERPRISE_CYCLE', 'An enterprise cannot be its own parent.', 422);
        }

        // Walk up to catch a cycle created in a single update.
        $cursor = $parent;
        for ($i = 0; $i < 50 && $cursor->parent_enterprise_id !== null; $i++) {
            if ($cursor->parent_enterprise_id === $enterpriseId) {
                throw new OrganizationException('ENTERPRISE_CYCLE', 'That parent would create a loop in the enterprise tree.', 422);
            }
            $cursor = Enterprise::query()->find($cursor->parent_enterprise_id);
        }
    }

    private function snapshot(Enterprise $enterprise): array
    {
        return [
            'id' => (int) $enterprise->id,
            'code' => $enterprise->code,
            'enterpriseType' => $enterprise->enterprise_type,
            'parentId' => $enterprise->parent_enterprise_id === null ? null : (int) $enterprise->parent_enterprise_id,
            'name' => $enterprise->name,
            'displayName' => $enterprise->display_name,
            'isActive' => (bool) $enterprise->is_active,
        ];
    }

    private function blankToNull(mixed $value): ?string
    {
        if ($value === null || (is_string($value) && trim($value) === '')) {
            return null;
        }

        return trim((string) $value);
    }

    private function nullIfEmpty(mixed $value): mixed
    {
        if ($value === null || $value === '') {
            return null;
        }

        return $value;
    }
}
