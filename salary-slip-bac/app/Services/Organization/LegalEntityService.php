<?php

namespace App\Services\Organization;

use App\Models\Company;
use App\Models\LegalEntity;
use App\Models\User;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * DOMAIN 02.02 — Legal Entity Management.
 *
 * A legal entity is the statutory employing entity under a company. `is_primary`
 * picks the default when nothing names one, so the primary can never be
 * deactivated or deleted: it is the guaranteed fallback. The company of an
 * entity is fixed once it exists — re-homing an entity silently moves every
 * future payroll record it would answer to.
 */
class LegalEntityService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'organization-legal-entities';

    public function legalEntities(array $filters, ?User $actor): array
    {
        $query = LegalEntity::query()->with('company')->orderBy('name');

        if (! empty($filters['companyIds'])) {
            $query->whereIn('company_id', array_map('intval', (array) $filters['companyIds']));
        } elseif (! $this->hasGlobalCompanyScope($actor)) {
            $codes = $this->authorizedCompanyCodes($actor);
            $companyIds = Company::query()->whereIn('code', $codes)->pluck('id')->all();
            $query->whereIn('company_id', $companyIds);
        }

        if (($search = trim((string) ($filters['search'] ?? ''))) !== '') {
            $query->where(function ($inner) use ($search) {
                $inner->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('legal_name', 'like', "%{$search}%");
            });
        }

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('is_active', $status === 'ACTIVE');
        }

        return $query->get()->map(fn (LegalEntity $entity) => $this->present($entity))->all();
    }

    /** Companies the actor may raise a legal entity under (for pickers). */
    public function assignableCompanies(User $actor): array
    {
        return Company::query()
            ->where('is_active', true)
            ->when(! $this->hasGlobalCompanyScope($actor), fn ($query) => $query->whereIn('code', $this->authorizedCompanyCodes($actor)))
            ->orderBy('name')
            ->get(['id', 'name', 'code'])
            ->map(fn (Company $company) => [
                'id' => (int) $company->id,
                'name' => $company->name,
                'code' => $company->code,
            ])
            ->all();
    }

    public function present(LegalEntity $entity): array
    {
        return [
            'id' => (int) $entity->id,
            'companyId' => (int) $entity->company_id,
            'companyName' => $entity->company?->name,
            'code' => $entity->code,
            'name' => $entity->name,
            'legalName' => $entity->legal_name,
            'registrationNumber' => $entity->registration_number,
            'countryCode' => $entity->country_code,
            'taxId' => $entity->tax_id,
            'currency' => $entity->currency,
            'fiscalYearStart' => $entity->fiscal_year_start,
            'primaryAddress' => $entity->primary_address,
            'contactEmail' => $entity->contact_email,
            'contactPhone' => $entity->contact_phone,
            'isPrimary' => (bool) $entity->is_primary,
            'isActive' => (bool) $entity->is_active,
            'createdAt' => $entity->created_at,
        ];
    }

    public function create(array $data, User $actor): LegalEntity
    {
        $company = Company::query()->findOrFail((int) $data['companyId']);
        $this->assertCompanyVisible($company, $actor);

        if (! $company->is_active) {
            throw new OrganizationException(
                'COMPANY_INACTIVE',
                'Legal entities cannot be added to an inactive company.',
                422
            );
        }

        $name = trim((string) $data['name']);
        $code = trim((string) ($data['code'] ?: $name));

        $this->assertCodeFree($company->id, $code, null);

        $entity = DB::transaction(function () use ($company, $data, $code, $name, $actor) {
            $isPrimary = (bool) ($data['isPrimary'] ?? false);

            $entity = LegalEntity::query()->create([
                'company_id' => $company->id,
                'code' => $code,
                'name' => $name,
                'legal_name' => trim((string) $data['legalName']),
                'registration_number' => $this->blankToNull($data['registrationNumber'] ?? null),
                'country_code' => strtoupper((string) ($data['countryCode'] ?? 'IN')),
                'tax_id' => $this->blankToNull($data['taxId'] ?? null),
                'currency' => $data['currency'] ?? 'INR',
                'fiscal_year_start' => $this->blankToNull($data['fiscalYearStart'] ?? null),
                'primary_address' => $this->blankToNull($data['primaryAddress'] ?? null),
                'contact_email' => $this->blankToNull($data['contactEmail'] ?? null),
                'contact_phone' => $this->blankToNull($data['contactPhone'] ?? null),
                'is_primary' => $isPrimary,
                'is_active' => (bool) ($data['isActive'] ?? true),
            ]);

            if ($isPrimary) {
                $this->clearOtherPrimaries($company->id, $entity->id);
            }

            return $entity;
        });

        $this->audit($actor, 'LEGAL_ENTITY_CREATED', null, $this->snapshot($entity));

        return $entity;
    }

    public function update(LegalEntity $entity, array $data, User $actor): LegalEntity
    {
        $this->assertCompanyVisible($entity->company, $actor);
        $before = $this->snapshot($entity);

        // The company is fixed once the entity exists: re-homing it silently
        // reassigns every future statutory record it would answer to.
        if (array_key_exists('companyId', $data) && (int) $data['companyId'] !== (int) $entity->company_id) {
            throw new OrganizationException(
                'LEGAL_ENTITY_COMPANY_LOCKED',
                'This legal entity cannot be moved to another company.',
                422
            );
        }

        if (array_key_exists('code', $data)) {
            $code = trim((string) $data['code']);
            $this->assertCodeFree($entity->company_id, $code, $entity->id);
            $entity->code = $code;
        }

        if (array_key_exists('name', $data)) {
            $entity->name = trim((string) $data['name']);
        }

        $pairs = [
            'legalName' => 'legal_name',
            'registrationNumber' => 'registration_number',
            'countryCode' => 'country_code',
            'taxId' => 'tax_id',
            'currency' => 'currency',
            'fiscalYearStart' => 'fiscal_year_start',
            'primaryAddress' => 'primary_address',
            'contactEmail' => 'contact_email',
            'contactPhone' => 'contact_phone',
        ];

        foreach ($pairs as $key => $column) {
            if (array_key_exists($key, $data)) {
                $entity->{$column} = $data[$key] === '' ? null : $data[$key];
            }
        }

        $isPrimary = $entity->is_primary;

        if (array_key_exists('isPrimary', $data) && $data['isPrimary'] !== $entity->is_primary) {
            $isPrimary = (bool) $data['isPrimary'];
            $entity->is_primary = $isPrimary;
        }

        DB::transaction(function () use ($entity, $isPrimary) {
            $entity->save();

            if ($isPrimary) {
                $this->clearOtherPrimaries($entity->company_id, $entity->id);
            }
        });

        $this->audit($actor, 'LEGAL_ENTITY_UPDATED', $before, $this->snapshot($entity));

        return $entity;
    }

    public function setStatus(LegalEntity $entity, bool $active, User $actor): LegalEntity
    {
        $this->assertCompanyVisible($entity->company, $actor);

        if (! $active && $entity->is_primary) {
            throw new OrganizationException(
                'LEGAL_ENTITY_PRIMARY',
                'The primary legal entity cannot be deactivated while it remains primary. '
                . 'Choose another primary first.',
                422
            );
        }

        $before = $this->snapshot($entity);
        $entity->is_active = $active;
        $entity->save();

        $this->audit($actor, $active ? 'LEGAL_ENTITY_ACTIVATED' : 'LEGAL_ENTITY_DEACTIVATED', $before, $this->snapshot($entity));

        return $entity;
    }

    public function delete(LegalEntity $entity, User $actor): void
    {
        $this->assertCompanyVisible($entity->company, $actor);

        if ($entity->is_primary) {
            throw new OrganizationException(
                'LEGAL_ENTITY_PRIMARY',
                'The primary legal entity cannot be deleted. Choose another primary first.',
                422
            );
        }

        $snapshot = $this->snapshot($entity);

        DB::transaction(fn () => $entity->delete());

        $this->audit($actor, 'LEGAL_ENTITY_DELETED', $snapshot, null);
    }

    private function assertCodeFree(int $companyId, string $code, ?int $ignoreId): void
    {
        $exists = LegalEntity::query()
            ->where('company_id', $companyId)
            ->where('code', $code)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new OrganizationException(
                'LEGAL_ENTITY_CODE_TAKEN',
                'That company already has a legal entity with this code.',
                422
            );
        }
    }

    private function clearOtherPrimaries(int $companyId, int $keepId): void
    {
        LegalEntity::query()
            ->where('company_id', $companyId)
            ->where('id', '!=', $keepId)
            ->where('is_primary', true)
            ->update(['is_primary' => false]);
    }

    private function blankToNull(mixed $value): ?string
    {
        if ($value === null || (is_string($value) && trim($value) === '')) {
            return null;
        }

        return trim((string) $value);
    }

    private function snapshot(LegalEntity $entity): array
    {
        return [
            'id' => (int) $entity->id,
            'companyId' => (int) $entity->company_id,
            'code' => $entity->code,
            'name' => $entity->name,
            'legalName' => $entity->legal_name,
            'isPrimary' => (bool) $entity->is_primary,
            'isActive' => (bool) $entity->is_active,
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