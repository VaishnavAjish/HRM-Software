<?php

namespace App\Services\Organization;

use App\Models\LegalEntityProfile;
use App\Models\LegalEntityRegistration;
use App\Models\LegalEntityAddress;
use App\Models\LegalEntityRepresentative;
use App\Models\LegalEntityBankAccount;
use App\Models\LegalEntity;
use App\Models\LegalEntityDocument;
use App\Models\Company;
use App\Models\User;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * DOMAIN 02.02 — Legal Entity Profile Service.
 *
 * Extended legal information for a company.
 */
class LegalEntityProfileService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'organization-legal-entity-profiles';

    public function profiles(array $filters, ?User $actor): array
    {
        $query = LegalEntityProfile::query()->with('company')->orderBy('legal_name');

        if (!empty($filters['companyIds'])) {
            $query->whereIn('company_id', array_map('intval', (array) $filters['companyIds']));
        } elseif (!$this->hasGlobalCompanyScope($actor)) {
            $codes = $this->authorizedCompanyCodes($actor);
            $companyIds = Company::query()->whereIn('code', $codes)->pluck('id')->all();
            $query->whereIn('company_id', $companyIds);
        }

        if (($search = trim((string) ($filters['search'] ?? ''))) !== '') {
            $query->where(function ($inner) use ($search) {
                $inner->where('legal_name', 'like', "%{$search}%")
                    ->orWhere('trading_name', 'like', "%{$search}%")
                    ->orWhere('corporate_identification_number', 'like', "%{$search}%");
            });
        }

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('is_active', $status === 'ACTIVE');
        }

        return $query->get()->map(fn (LegalEntityProfile $profile) => $this->present($profile))->all();
    }

    public function assignableCompanies(User $actor): array
    {
        return Company::query()
            ->where('is_active', true)
            ->when(!$this->hasGlobalCompanyScope($actor), fn ($query) => $query->whereIn('code', $this->authorizedCompanyCodes($actor)))
            ->orderBy('name')
            ->get(['id', 'name', 'code'])
            ->map(fn (Company $company) => [
                'id' => (int) $company->id,
                'name' => $company->name,
                'code' => $company->code,
            ])
            ->all();
    }

    public function present(LegalEntityProfile $profile): array
    {
        return [
            'id' => (int) $profile->id,
            'companyId' => (int) $profile->company_id,
            'companyName' => $profile->company?->name,
            'legalName' => $profile->legal_name,
            'tradingName' => $profile->trading_name,
            'corporateIdentificationNumber' => $profile->corporate_identification_number,
            'incorporationDate' => $profile->incorporation_date?->toDateString(),
            'countryCode' => $profile->country_code,
            'registeredAddress' => $profile->registered_address,
            'correspondenceAddress' => $profile->correspondence_address,
            'contactEmail' => $profile->contact_email,
            'contactPhone' => $profile->contact_phone,
            'website' => $profile->website,
            'isActive' => (bool) $profile->is_active,
            'effectiveFrom' => $profile->effective_from?->toDateString(),
            'effectiveTo' => $profile->effective_to?->toDateString(),
            'registrationCount' => $profile->registrations()->where('is_active', true)->count(),
            'addressCount' => $profile->addresses()->where('is_active', true)->count(),
            'representativeCount' => $profile->representatives()->where('is_active', true)->count(),
            'bankAccountCount' => $profile->bankAccounts()->where('is_active', true)->count(),
            'createdAt' => $profile->created_at,
        ];
    }

    public function create(array $data, User $actor): LegalEntityProfile
    {
        $company = Company::query()->findOrFail((int) $data['companyId']);
        $this->assertCompanyVisible($company, $actor);

        if (!$company->is_active) {
            throw new OrganizationException(
                'COMPANY_INACTIVE',
                'Legal entity profiles cannot be added to an inactive company.',
                422
            );
        }

        $profile = DB::transaction(function () use ($company, $data, $actor) {
            $profile = LegalEntityProfile::query()->create([
                'company_id' => $company->id,
                'legal_name' => trim((string) $data['legalName']),
                'trading_name' => $this->blankToNull($data['tradingName'] ?? null),
                'corporate_identification_number' => $this->blankToNull($data['corporateIdentificationNumber'] ?? null),
                'incorporation_date' => $this->blankToNull($data['incorporationDate'] ?? null),
                'country_code' => strtoupper((string) ($data['countryCode'] ?? 'IN')),
                'registered_address' => $this->blankToNull($data['registeredAddress'] ?? null),
                'correspondence_address' => $this->blankToNull($data['correspondenceAddress'] ?? null),
                'contact_email' => $this->blankToNull($data['contactEmail'] ?? null),
                'contact_phone' => $this->blankToNull($data['contactPhone'] ?? null),
                'website' => $this->blankToNull($data['website'] ?? null),
                'is_active' => (bool) ($data['isActive'] ?? true),
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);

            return $profile;
        });

        $this->audit($actor, 'LEGAL_ENTITY_PROFILE_CREATED', null, $this->snapshot($profile));

        return $profile;
    }

    public function update(LegalEntityProfile $profile, array $data, User $actor): LegalEntityProfile
    {
        $this->assertCompanyVisible($profile->company, $actor);
        $before = $this->snapshot($profile);

        if (array_key_exists('companyId', $data) && (int) $data['companyId'] !== (int) $profile->company_id) {
            throw new OrganizationException(
                'LEGAL_ENTITY_PROFILE_COMPANY_LOCKED',
                'This legal entity profile cannot be moved to another company.',
                422
            );
        }

        $pairs = [
            'legalName' => 'legal_name',
            'tradingName' => 'trading_name',
            'corporateIdentificationNumber' => 'corporate_identification_number',
            'incorporationDate' => 'incorporation_date',
            'countryCode' => 'country_code',
            'registeredAddress' => 'registered_address',
            'correspondenceAddress' => 'correspondence_address',
            'contactEmail' => 'contact_email',
            'contactPhone' => 'contact_phone',
            'website' => 'website',
        ];

        foreach ($pairs as $key => $column) {
            if (array_key_exists($key, $data)) {
                $profile->{$column} = $data[$key] === '' ? null : $data[$key];
            }
        }

        if (array_key_exists('isActive', $data)) {
            $profile->is_active = (bool) $data['isActive'];
        }

        if (array_key_exists('effectiveFrom', $data)) {
            $profile->effective_from = $this->blankToNull($data['effectiveFrom']);
        }

        if (array_key_exists('effectiveTo', $data)) {
            $profile->effective_to = $this->blankToNull($data['effectiveTo']);
        }

        DB::transaction(fn () => $profile->save());

        $this->audit($actor, 'LEGAL_ENTITY_PROFILE_UPDATED', $before, $this->snapshot($profile));

        return $profile;
    }

    public function setStatus(LegalEntityProfile $profile, bool $active, User $actor): LegalEntityProfile
    {
        $this->assertCompanyVisible($profile->company, $actor);
        $before = $this->snapshot($profile);
        $profile->is_active = $active;
        $profile->save();

        $this->audit($actor, $active ? 'LEGAL_ENTITY_PROFILE_ACTIVATED' : 'LEGAL_ENTITY_PROFILE_DEACTIVATED', $before, $this->snapshot($profile));

        return $profile;
    }

    public function delete(LegalEntityProfile $profile, User $actor): void
    {
        $this->assertCompanyVisible($profile->company, $actor);

        if ($profile->registrations()->exists() || $profile->addresses()->exists() || $profile->representatives()->exists() || $profile->bankAccounts()->exists()) {
            throw new OrganizationException(
                'LEGAL_ENTITY_PROFILE_HAS_CHILDREN',
                'Cannot delete this profile while it has related records. Remove them first.',
                422
            );
        }

        $snapshot = $this->snapshot($profile);

        DB::transaction(fn () => $profile->delete());

        $this->audit($actor, 'LEGAL_ENTITY_PROFILE_DELETED', $snapshot, null);
    }

    // Registrations
    public function registrations(int $profileId, array $filters, ?User $actor): array
    {
        $profile = LegalEntityProfile::query()->findOrFail($profileId);
        $this->assertCompanyVisible($profile->company, $actor);

        $query = $profile->registrations()->orderBy('type');

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('is_active', $status === 'ACTIVE');
        }

        return $query->get()->map(fn (LegalEntityRegistration $reg) => $this->presentRegistration($reg))->all();
    }

    public function presentRegistration(LegalEntityRegistration $reg): array
    {
        return [
            'id' => (int) $reg->id,
            'legalEntityProfileId' => (int) $reg->legal_entity_profile_id,
            'type' => $reg->type,
            'jurisdiction' => $reg->jurisdiction,
            'registrationNumber' => $reg->registration_number,
            'registrationDate' => $reg->registration_date?->toDateString(),
            'expiryDate' => $reg->expiry_date?->toDateString(),
            'isActive' => (bool) $reg->is_active,
            'notes' => $reg->notes,
            'createdAt' => $reg->created_at,
        ];
    }

    public function createRegistration(int $profileId, array $data, User $actor): LegalEntityRegistration
    {
        $profile = LegalEntityProfile::query()->findOrFail($profileId);
        $this->assertCompanyVisible($profile->company, $actor);

        $reg = DB::transaction(function () use ($profile, $data) {
            return LegalEntityRegistration::query()->create([
                'legal_entity_profile_id' => $profile->id,
                'type' => trim((string) $data['type']),
                'jurisdiction' => $this->blankToNull($data['jurisdiction'] ?? null),
                'registration_number' => trim((string) $data['registrationNumber']),
                'registration_date' => $this->blankToNull($data['registrationDate'] ?? null),
                'expiry_date' => $this->blankToNull($data['expiryDate'] ?? null),
                'is_active' => (bool) ($data['isActive'] ?? true),
                'notes' => $this->blankToNull($data['notes'] ?? null),
            ]);
        });

        $this->audit($actor, 'LEGAL_ENTITY_REGISTRATION_CREATED', null, $this->snapshotRegistration($reg));

        return $reg;
    }

    public function updateRegistration(LegalEntityRegistration $reg, array $data, User $actor): LegalEntityRegistration
    {
        $this->assertCompanyVisible($reg->legalEntityProfile->company, $actor);
        $before = $this->snapshotRegistration($reg);

        $pairs = [
            'type' => 'type',
            'jurisdiction' => 'jurisdiction',
            'registrationNumber' => 'registration_number',
            'registrationDate' => 'registration_date',
            'expiryDate' => 'expiry_date',
            'isActive' => 'is_active',
            'notes' => 'notes',
        ];

        foreach ($pairs as $key => $column) {
            if (array_key_exists($key, $data)) {
                $reg->{$column} = $data[$key] === '' ? null : $data[$key];
            }
        }

        DB::transaction(fn () => $reg->save());

        $this->audit($actor, 'LEGAL_ENTITY_REGISTRATION_UPDATED', $before, $this->snapshotRegistration($reg));

        return $reg;
    }

    public function deleteRegistration(LegalEntityRegistration $reg, User $actor): void
    {
        $this->assertCompanyVisible($reg->legalEntityProfile->company, $actor);
        $snapshot = $this->snapshotRegistration($reg);
        DB::transaction(fn () => $reg->delete());
        $this->audit($actor, 'LEGAL_ENTITY_REGISTRATION_DELETED', $snapshot, null);
    }

    // Addresses
    public function addresses(int $profileId, array $filters, ?User $actor): array
    {
        $profile = LegalEntityProfile::query()->findOrFail($profileId);
        $this->assertCompanyVisible($profile->company, $actor);

        $query = $profile->addresses()->orderBy('type');

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('is_active', $status === 'ACTIVE');
        }

        return $query->get()->map(fn (LegalEntityAddress $addr) => $this->presentAddress($addr))->all();
    }

    public function presentAddress(LegalEntityAddress $addr): array
    {
        return [
            'id' => (int) $addr->id,
            'legalEntityProfileId' => (int) $addr->legal_entity_profile_id,
            'type' => $addr->type,
            'addressLine1' => $addr->address_line_1,
            'addressLine2' => $addr->address_line_2,
            'city' => $addr->city,
            'state' => $addr->state,
            'countryCode' => $addr->country_code,
            'postalCode' => $addr->postal_code,
            'isPrimary' => (bool) $addr->is_primary,
            'isActive' => (bool) $addr->is_active,
            'createdAt' => $addr->created_at,
        ];
    }

    public function createAddress(int $profileId, array $data, User $actor): LegalEntityAddress
    {
        $profile = LegalEntityProfile::query()->findOrFail($profileId);
        $this->assertCompanyVisible($profile->company, $actor);

        $addr = DB::transaction(function () use ($profile, $data) {
            return LegalEntityAddress::query()->create([
                'legal_entity_profile_id' => $profile->id,
                'type' => trim((string) $data['type']),
                'address_line_1' => trim((string) $data['addressLine1']),
                'address_line_2' => $this->blankToNull($data['addressLine2'] ?? null),
                'city' => $this->blankToNull($data['city'] ?? null),
                'state' => $this->blankToNull($data['state'] ?? null),
                'country_code' => strtoupper((string) ($data['countryCode'] ?? 'IN')),
                'postal_code' => $this->blankToNull($data['postalCode'] ?? null),
                'is_primary' => (bool) ($data['isPrimary'] ?? false),
                'is_active' => (bool) ($data['isActive'] ?? true),
            ]);
        });

        if ($addr->is_primary) {
            $this->clearOtherPrimaryAddresses($profile->id, $addr->id);
        }

        $this->audit($actor, 'LEGAL_ENTITY_ADDRESS_CREATED', null, $this->snapshotAddress($addr));

        return $addr;
    }

    public function updateAddress(LegalEntityAddress $addr, array $data, User $actor): LegalEntityAddress
    {
        $this->assertCompanyVisible($addr->legalEntityProfile->company, $actor);
        $before = $this->snapshotAddress($addr);

        $pairs = [
            'type' => 'type',
            'addressLine1' => 'address_line_1',
            'addressLine2' => 'address_line_2',
            'city' => 'city',
            'state' => 'state',
            'countryCode' => 'country_code',
            'postalCode' => 'postal_code',
            'isPrimary' => 'is_primary',
            'isActive' => 'is_active',
        ];

        foreach ($pairs as $key => $column) {
            if (array_key_exists($key, $data)) {
                $addr->{$column} = $data[$key] === '' ? null : $data[$key];
            }
        }

        DB::transaction(function () use ($addr) {
            $addr->save();
            if ($addr->is_primary) {
                $this->clearOtherPrimaryAddresses($addr->legal_entity_profile_id, $addr->id);
            }
        });

        $this->audit($actor, 'LEGAL_ENTITY_ADDRESS_UPDATED', $before, $this->snapshotAddress($addr));

        return $addr;
    }

    public function deleteAddress(LegalEntityAddress $addr, User $actor): void
    {
        $this->assertCompanyVisible($addr->legalEntityProfile->company, $actor);
        $snapshot = $this->snapshotAddress($addr);
        DB::transaction(fn () => $addr->delete());
        $this->audit($actor, 'LEGAL_ENTITY_ADDRESS_DELETED', $snapshot, null);
    }

    // Representatives
    public function representatives(int $profileId, array $filters, ?User $actor): array
    {
        $profile = LegalEntityProfile::query()->findOrFail($profileId);
        $this->assertCompanyVisible($profile->company, $actor);

        $query = $profile->representatives()->orderBy('type');

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('is_active', $status === 'ACTIVE');
        }

        return $query->get()->map(fn (LegalEntityRepresentative $rep) => $this->presentRepresentative($rep))->all();
    }

    public function presentRepresentative(LegalEntityRepresentative $rep): array
    {
        return [
            'id' => (int) $rep->id,
            'legalEntityProfileId' => (int) $rep->legal_entity_profile_id,
            'name' => $rep->name,
            'designation' => $rep->designation,
            'email' => $rep->email,
            'phone' => $rep->phone,
            'pan' => $rep->pan,
            'din' => $rep->din,
            'type' => $rep->type,
            'isPrimary' => (bool) $rep->is_primary,
            'isActive' => (bool) $rep->is_active,
            'appointmentDate' => $rep->appointment_date?->toDateString(),
            'cessationDate' => $rep->cessation_date?->toDateString(),
            'createdAt' => $rep->created_at,
        ];
    }

    public function createRepresentative(int $profileId, array $data, User $actor): LegalEntityRepresentative
    {
        $profile = LegalEntityProfile::query()->findOrFail($profileId);
        $this->assertCompanyVisible($profile->company, $actor);

        $rep = DB::transaction(function () use ($profile, $data) {
            return LegalEntityRepresentative::query()->create([
                'legal_entity_profile_id' => $profile->id,
                'name' => trim((string) $data['name']),
                'designation' => $this->blankToNull($data['designation'] ?? null),
                'email' => $this->blankToNull($data['email'] ?? null),
                'phone' => $this->blankToNull($data['phone'] ?? null),
                'pan' => $this->blankToNull($data['pan'] ?? null),
                'din' => $this->blankToNull($data['din'] ?? null),
                'type' => trim((string) $data['type']),
                'is_primary' => (bool) ($data['isPrimary'] ?? false),
                'is_active' => (bool) ($data['isActive'] ?? true),
                'appointment_date' => $this->blankToNull($data['appointmentDate'] ?? null),
                'cessation_date' => $this->blankToNull($data['cessationDate'] ?? null),
            ]);
        });

        if ($rep->is_primary) {
            $this->clearOtherPrimaryRepresentatives($profile->id, $rep->id);
        }

        $this->audit($actor, 'LEGAL_ENTITY_REPRESENTATIVE_CREATED', null, $this->snapshotRepresentative($rep));

        return $rep;
    }

    public function updateRepresentative(LegalEntityRepresentative $rep, array $data, User $actor): LegalEntityRepresentative
    {
        $this->assertCompanyVisible($rep->legalEntityProfile->company, $actor);
        $before = $this->snapshotRepresentative($rep);

        $pairs = [
            'name' => 'name',
            'designation' => 'designation',
            'email' => 'email',
            'phone' => 'phone',
            'pan' => 'pan',
            'din' => 'din',
            'type' => 'type',
            'isPrimary' => 'is_primary',
            'isActive' => 'is_active',
            'appointmentDate' => 'appointment_date',
            'cessationDate' => 'cessation_date',
        ];

        foreach ($pairs as $key => $column) {
            if (array_key_exists($key, $data)) {
                $rep->{$column} = $data[$key] === '' ? null : $data[$key];
            }
        }

        DB::transaction(function () use ($rep) {
            $rep->save();
            if ($rep->is_primary) {
                $this->clearOtherPrimaryRepresentatives($rep->legal_entity_profile_id, $rep->id);
            }
        });

        $this->audit($actor, 'LEGAL_ENTITY_REPRESENTATIVE_UPDATED', $before, $this->snapshotRepresentative($rep));

        return $rep;
    }

    public function deleteRepresentative(LegalEntityRepresentative $rep, User $actor): void
    {
        $this->assertCompanyVisible($rep->legalEntityProfile->company, $actor);
        $snapshot = $this->snapshotRepresentative($rep);
        DB::transaction(fn () => $rep->delete());
        $this->audit($actor, 'LEGAL_ENTITY_REPRESENTATIVE_DELETED', $snapshot, null);
    }

    // Bank Accounts
    public function bankAccounts(int $profileId, array $filters, ?User $actor): array
    {
        $profile = LegalEntityProfile::query()->findOrFail($profileId);
        $this->assertCompanyVisible($profile->company, $actor);

        $query = $profile->bankAccounts()->orderBy('bank_name');

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('is_active', $status === 'ACTIVE');
        }

        return $query->get()->map(fn (LegalEntityBankAccount $acc) => $this->presentBankAccount($acc))->all();
    }

    public function presentBankAccount(LegalEntityBankAccount $acc): array
    {
        return [
            'id' => (int) $acc->id,
            'legalEntityProfileId' => (int) $acc->legal_entity_profile_id,
            'bankName' => $acc->bank_name,
            'branchName' => $acc->branch_name,
            'ifscCode' => $acc->ifsc_code,
            'accountType' => $acc->account_type,
            'accountNumberMasked' => $acc->account_number_masked,
            'accountNumberLastFour' => $acc->account_number_last_four,
            'isPrimary' => (bool) $acc->is_primary,
            'isActive' => (bool) $acc->is_active,
            'effectiveFrom' => $acc->effective_from?->toDateString(),
            'effectiveTo' => $acc->effective_to?->toDateString(),
            'createdAt' => $acc->created_at,
        ];
    }

    public function createBankAccount(int $profileId, array $data, User $actor): LegalEntityBankAccount
    {
        $profile = LegalEntityProfile::query()->findOrFail($profileId);
        $this->assertCompanyVisible($profile->company, $actor);

        $acc = DB::transaction(function () use ($profile, $data) {
            $acc = new LegalEntityBankAccount([
                'legal_entity_profile_id' => $profile->id,
                'bank_name' => trim((string) $data['bankName']),
                'branch_name' => $this->blankToNull($data['branchName'] ?? null),
                'ifsc_code' => $this->blankToNull($data['ifscCode'] ?? null),
                'account_type' => trim((string) $data['accountType']),
                'is_primary' => (bool) ($data['isPrimary'] ?? false),
                'is_active' => (bool) ($data['isActive'] ?? true),
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);
            $acc->setAccountNumber(trim((string) $data['accountNumber']));
            $acc->save();
            return $acc;
        });

        if ($acc->is_primary) {
            $this->clearOtherPrimaryBankAccounts($profile->id, $acc->id);
        }

        $this->audit($actor, 'LEGAL_ENTITY_BANK_ACCOUNT_CREATED', null, $this->snapshotBankAccount($acc));

        return $acc;
    }

    public function updateBankAccount(LegalEntityBankAccount $acc, array $data, User $actor): LegalEntityBankAccount
    {
        $this->assertCompanyVisible($acc->legalEntityProfile->company, $actor);
        $before = $this->snapshotBankAccount($acc);

        $pairs = [
            'bankName' => 'bank_name',
            'branchName' => 'branch_name',
            'ifscCode' => 'ifsc_code',
            'accountType' => 'account_type',
            'isPrimary' => 'is_primary',
            'isActive' => 'is_active',
            'effectiveFrom' => 'effective_from',
            'effectiveTo' => 'effective_to',
        ];

        foreach ($pairs as $key => $column) {
            if (array_key_exists($key, $data)) {
                $acc->{$column} = $data[$key] === '' ? null : $data[$key];
            }
        }

        if (array_key_exists('accountNumber', $data)) {
            $acc->setAccountNumber(trim((string) $data['accountNumber']));
        }

        DB::transaction(function () use ($acc) {
            $acc->save();
            if ($acc->is_primary) {
                $this->clearOtherPrimaryBankAccounts($acc->legal_entity_profile_id, $acc->id);
            }
        });

        $this->audit($actor, 'LEGAL_ENTITY_BANK_ACCOUNT_UPDATED', $before, $this->snapshotBankAccount($acc));

        return $acc;
    }

    public function deleteBankAccount(LegalEntityBankAccount $acc, User $actor): void
    {
        $this->assertCompanyVisible($acc->legalEntityProfile->company, $actor);
        $snapshot = $this->snapshotBankAccount($acc);
        DB::transaction(fn () => $acc->delete());
        $this->audit($actor, 'LEGAL_ENTITY_BANK_ACCOUNT_DELETED', $snapshot, null);
    }

    // Documents - using existing Document service
    public function documents(int $profileId, array $filters, ?User $actor): array
    {
        $profile = LegalEntityProfile::query()->findOrFail($profileId);
        $this->assertCompanyVisible($profile->company, $actor);

        $legalEntityIds = LegalEntity::query()
            ->where('company_id', $profile->company_id)
            ->pluck('id');

        $query = LegalEntityDocument::query()
            ->whereIn('legal_entity_id', $legalEntityIds)
            ->with(['legalEntity', 'document']);

        if (($kind = (string) ($filters['kind'] ?? '')) !== '' && $kind !== 'ALL') {
            $query->where('document_kind', $kind);
        }

        return $query->orderByDesc('created_at')
            ->limit(200)
            ->get()
            ->map(fn (LegalEntityDocument $doc) => $this->presentDocument($doc))
            ->all();
    }

    public function presentDocument(LegalEntityDocument $doc): array
    {
        return [
            'id' => (int) $doc->id,
            'legalEntityId' => (int) $doc->legal_entity_id,
            'legalEntityName' => $doc->legalEntity?->name,
            'documentKind' => $doc->document_kind,
            'title' => $doc->title,
            'documentId' => $doc->document_id === null ? null : (int) $doc->document_id,
            'referenceNumber' => $doc->reference_number,
            'issuedOn' => $doc->issued_on?->toDateString(),
            'expiresOn' => $doc->expires_on?->toDateString(),
            'isActive' => (bool) $doc->is_active,
            'notes' => $doc->notes,
            'createdAt' => $doc->created_at,
        ];
    }

    private function clearOtherPrimaryAddresses(int $profileId, int $keepId): void
    {
        LegalEntityAddress::query()
            ->where('legal_entity_profile_id', $profileId)
            ->where('id', '!=', $keepId)
            ->where('is_primary', true)
            ->update(['is_primary' => false]);
    }

    private function clearOtherPrimaryRepresentatives(int $profileId, int $keepId): void
    {
        LegalEntityRepresentative::query()
            ->where('legal_entity_profile_id', $profileId)
            ->where('id', '!=', $keepId)
            ->where('is_primary', true)
            ->update(['is_primary' => false]);
    }

    private function clearOtherPrimaryBankAccounts(int $profileId, int $keepId): void
    {
        LegalEntityBankAccount::query()
            ->where('legal_entity_profile_id', $profileId)
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

    private function snapshot(LegalEntityProfile $profile): array
    {
        return [
            'id' => (int) $profile->id,
            'companyId' => (int) $profile->company_id,
            'legalName' => $profile->legal_name,
            'tradingName' => $profile->trading_name,
            'isActive' => (bool) $profile->is_active,
        ];
    }

    private function snapshotRegistration(LegalEntityRegistration $reg): array
    {
        return [
            'id' => (int) $reg->id,
            'type' => $reg->type,
            'registrationNumber' => $reg->registration_number,
            'isActive' => (bool) $reg->is_active,
        ];
    }

    private function snapshotAddress(LegalEntityAddress $addr): array
    {
        return [
            'id' => (int) $addr->id,
            'type' => $addr->type,
            'isPrimary' => (bool) $addr->is_primary,
            'isActive' => (bool) $addr->is_active,
        ];
    }

    private function snapshotRepresentative(LegalEntityRepresentative $rep): array
    {
        return [
            'id' => (int) $rep->id,
            'name' => $rep->name,
            'type' => $rep->type,
            'isPrimary' => (bool) $rep->is_primary,
            'isActive' => (bool) $rep->is_active,
        ];
    }

    private function snapshotBankAccount(LegalEntityBankAccount $acc): array
    {
        return [
            'id' => (int) $acc->id,
            'bankName' => $acc->bank_name,
            'accountNumberMasked' => $acc->account_number_masked,
            'isPrimary' => (bool) $acc->is_primary,
            'isActive' => (bool) $acc->is_active,
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