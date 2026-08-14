<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * DOMAIN 02.02 — Legal Entity Profiles.
 *
 * Profiles hang under companies; registrations, addresses, representatives and
 * bank accounts hang under a profile. The bank account number is stored
 * encrypted and only a last-four/masked form may ever reach the API.
 */
class LegalEntityProfileApiTest extends TestCase
{
    use RefreshDatabase;

    private User $root;

    protected function setUp(): void
    {
        parent::setUp();

        $this->root = User::create([
            'name' => 'Root', 'email' => 'root@org-legal.test', 'password' => 'secret1234',
            'emp_code' => 'LEG-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
    }

    private function asRoot(): static
    {
        return $this->withToken(auth('api')->login($this->root));
    }

    private function company(string $code = 'nidhi-impex'): Company
    {
        return Company::query()->firstOrCreate(
            ['code' => $code],
            ['name' => ucwords(str_replace('-', ' ', $code)), 'is_active' => true]
        );
    }

    private function profileId(Company $company): int
    {
        $response = $this->asRoot()->postJson('/api/v1/admin/organization/legal-entity-profiles', [
            'companyId' => $company->id,
            'legalName' => 'Nidhi Impex Pvt Ltd',
            'corporateIdentificationNumber' => 'U00000MH2004PTC000000',
            'countryCode' => 'IN',
        ])->assertCreated()->assertJsonPath('success', true);

        return $response->json('data.id');
    }

    #[Test]
    public function a_profile_hangs_under_its_company_and_appears_in_the_list(): void
    {
        $company = $this->company();

        $id = $this->profileId($company);

        $this->assertDatabaseHas('legal_entity_profiles', [
            'id' => $id,
            'company_id' => $company->id,
            'legal_name' => 'Nidhi Impex Pvt Ltd',
        ]);

        $this->asRoot()->getJson('/api/v1/admin/organization/legal-entity-profiles?company_ids[]='.$company->id)
            ->assertOk()->assertJsonPath('data.0.id', $id);
    }

    #[Test]
    public function registrations_addresses_and_representatives_are_nested(): void
    {
        $company = $this->company();
        $profileId = $this->profileId($company);

        $registration = $this->asRoot()->postJson(
            "/api/v1/admin/organization/legal-entity-profiles/{$profileId}/registrations",
            ['type' => 'gst', 'registrationNumber' => '27AAACC1234F1Z5']
        )->assertCreated()->json('data');

        $address = $this->asRoot()->postJson(
            "/api/v1/admin/organization/legal-entity-profiles/{$profileId}/addresses",
            ['type' => 'registered', 'addressLine1' => '128 Esplanade Row', 'isPrimary' => true]
        )->assertCreated()->json('data');

        $representative = $this->asRoot()->postJson(
            "/api/v1/admin/organization/legal-entity-profiles/{$profileId}/representatives",
            ['type' => 'director', 'name' => 'Pratik Shah']
        )->assertCreated()->json('data');

        $this->assertDatabaseHas('legal_entity_registrations', ['id' => $registration['id'], 'registration_number' => '27AAACC1234F1Z5']);
        $this->assertDatabaseHas('legal_entity_addresses', ['id' => $address['id'], 'is_primary' => true]);
        $this->assertDatabaseHas('legal_entity_representatives', ['id' => $representative['id'], 'name' => 'Pratik Shah']);
    }

    #[Test]
    public function a_bank_account_number_is_stored_encrypted_and_never_returned_plain(): void
    {
        $company = $this->company();
        $profileId = $this->profileId($company);

        $account = $this->asRoot()->postJson(
            "/api/v1/admin/organization/legal-entity-profiles/{$profileId}/bank-accounts",
            ['bankName' => 'HDFC Bank', 'accountType' => 'current', 'accountNumber' => '50100223334455']
        )->assertCreated()->json('data');

        $row = \App\Models\LegalEntityBankAccount::query()->findOrFail($account['id']);

        $this->assertNotSame('50100223334455', $row->account_number_masked);
        $this->assertSame('4455', $row->account_number_last_four);
        $this->assertSame('50100223334455', Crypt::decryptString($row->encrypted_account_number));

        $accountNumber = json_encode($account);
        $this->assertStringNotContainsString('50100223334455', $accountNumber);
    }

    #[Test]
    public function the_documents_endpoint_returns_documents(): void
    {
        $company = $this->company();
        $profileId = $this->profileId($company);

        $legalEntity = \App\Models\LegalEntity::query()->create([
            'company_id' => $company->id,
            'code' => 'nidhi-impex-legal',
            'name' => 'Nidhi Impex Pvt Ltd',
            'legal_name' => 'Nidhi Impex Pvt Ltd',
            'country_code' => 'IN',
        ]);

        $document = \App\Models\Document::query()->create([
            'document_type' => 'incorporation',
            'status' => 'ACTIVE',
        ]);

        \App\Models\LegalEntityDocument::query()->create([
            'legal_entity_id' => $legalEntity->id,
            'document_kind' => 'incorporation',
            'title' => 'COI.pdf',
            'document_id' => $document->id,
        ]);

        $this->asRoot()->getJson("/api/v1/admin/organization/legal-entity-profiles/{$profileId}/documents")
            ->assertOk()->assertJsonPath('data.0.title', 'COI.pdf');
    }

    #[Test]
    public function a_missing_profile_returns_404(): void
    {
        $this->asRoot()->getJson('/api/v1/admin/organization/legal-entity-profiles/999999')
            ->assertNotFound()->assertJsonPath('error.code', 'NOT_FOUND');
    }

    #[Test]
    public function a_profile_can_be_deactivated_and_the_name_survives(): void
    {
        $company = $this->company();
        $profileId = $this->profileId($company);

        $this->asRoot()->patchJson("/api/v1/admin/organization/legal-entity-profiles/{$profileId}/status", [
            'isActive' => false,
        ])->assertOk()->assertJsonPath('data.isActive', false);

        $this->assertDatabaseHas('legal_entity_profiles', [
            'id' => $profileId,
            'legal_name' => 'Nidhi Impex Pvt Ltd',
            'is_active' => false,
        ]);
    }
}