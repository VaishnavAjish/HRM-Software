<?php

namespace App\Services\Organization;

use App\Models\Calendar;
use App\Models\Company;
use App\Models\LegalEntity;
use App\Models\Location;
use App\Models\User;
use App\Services\Authorization\SchemaSupport;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * DOMAIN 02.01 — Enterprise Master.
 *
 * The enterprise surface of the company record. Companies already exist and are
 * managed from Access Control; this service reads them with their enterprise
 * attributes and updates only the statutory/contact columns, never `code` or
 * `name` — the code is the tenant key and Access Control owns it.
 *
 * Reads are company-scoped: a tenant administrator sees their own companies,
 * a global administrator sees all.
 */
class EnterpriseMasterService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'organization-enterprise-master';

    public function __construct()
    {
    }

    public function companies(array $filters, ?User $actor): array
    {
        $query = Company::query()->orderBy('name');

        if (! $this->hasGlobalCompanyScope($actor)) {
            $codes = $this->authorizedCompanyCodes($actor);
            $query->whereIn('code', $codes);
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

        return $query->get()->map(fn (Company $company) => $this->present($company))->all();
    }

    public function present(Company $company): array
    {
        return [
            'id' => (int) $company->id,
            'name' => $company->name,
            'code' => $company->code,
            'legalName' => $company->legal_name,
            'registrationNumber' => $company->registration_number,
            'taxIdentification' => $company->tax_identification,
            'incorporationDate' => $company->incorporation_date?->toDateString(),
            'countryCode' => $company->country_code,
            'timezone' => $company->timezone,
            'primaryAddress' => $company->primary_address,
            'contactEmail' => $company->contact_email,
            'contactPhone' => $company->contact_phone,
            'fiscalYearStart' => $company->fiscal_year_start,
            'currency' => $company->currency,
            'isActive' => (bool) $company->is_active,
            'legalEntityCount' => $this->countIfReady('legal_entities', fn () => LegalEntity::query()->where('company_id', $company->id)->count()),
            'locationCount' => $this->countIfReady('locations', fn () => Location::query()->where('company_id', $company->id)->count()),
            'calendarCount' => $this->countIfReady('calendars', fn () => Calendar::query()->where('company_id', $company->id)->count()),
        ];
    }

    public function updateEnterprise(Company $company, array $data, User $actor): Company
    {
        $this->assertCompanyVisible($company, $actor);

        $before = $this->snapshot($company);

        // Only present keys are written, so a PATCH that omits a field does not
        // blank it. The controller validates shape; this maps the accepted keys.
        foreach ($this->enterpriseColumns() as $column) {
            $key = Str::camel($column);

            if (array_key_exists($key, $data)) {
                $company->{$column} = $data[$key] === '' ? null : $data[$key];
            }
        }

        DB::transaction(fn () => $company->save());

        $this->audit($actor, 'ENTERPRISE_UPDATED', $before, $this->snapshot($company));

        return $company;
    }

    /** @return list<string> */
    private function enterpriseColumns(): array
    {
        return [
            'legal_name',
            'registration_number',
            'tax_identification',
            'incorporation_date',
            'country_code',
            'timezone',
            'primary_address',
            'contact_email',
            'contact_phone',
            'fiscal_year_start',
            'currency',
        ];
    }

    private function snapshot(Company $company): array
    {
        return [
            'id' => (int) $company->id,
            'name' => $company->name,
            'code' => $company->code,
            'legalName' => $company->legal_name,
            'registrationNumber' => $company->registration_number,
            'taxIdentification' => $company->tax_identification,
            'incorporationDate' => $company->incorporation_date?->toDateString(),
            'countryCode' => $company->country_code,
            'timezone' => $company->timezone,
            'primaryAddress' => $company->primary_address,
            'contactEmail' => $company->contact_email,
            'contactPhone' => $company->contact_phone,
            'fiscalYearStart' => $company->fiscal_year_start,
            'currency' => $company->currency,
        ];
    }

    private function countIfReady(string $table, callable $count): int
    {
        return SchemaSupport::hasTable($table) ? (int) $count() : 0;
    }

    private function audit(User $actor, string $changeType, ?array $old, ?array $new): void
    {
        $request = request();

        if ($request) {
            AuditLogger::log($request, $changeType, self::MODULE, $old, $new);
        }
    }
}