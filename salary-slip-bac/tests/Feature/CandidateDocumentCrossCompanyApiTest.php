<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\CandidateDocument;
use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Highest-severity finding in the 2026-08-16 HR audit: every
 * CandidateDocumentController method loaded its record with a bare
 * `find($id)` and no scope check, so a company-scoped actor could read,
 * upload, review, or delete another company's candidate identity documents
 * (Aadhaar, PAN, passport, bank details) just by guessing the numeric id.
 *
 * `ScopesCompany::hasGlobalCompanyScope()` treats BOTH role 0 and role 1 as
 * globally scoped, so the actors here must be role 2 to actually exercise
 * `companyCodeWithinActorScope()`'s deny path.
 */
class CandidateDocumentCrossCompanyApiTest extends TestCase
{
    use RefreshDatabase;

    private User $root;
    private User $companyAActor;
    private Candidate $candidateA;
    private Candidate $candidateB;
    private CandidateDocument $documentA;
    private CandidateDocument $documentB;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');

        $this->company('nidhi-impex');
        $this->company('silver-star');

        $this->root = User::create([
            'name' => 'Root', 'email' => 'root@caddoc.test', 'password' => 'secret1234',
            'emp_code' => 'CDOC-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex,silver-star', 'status' => 0,
        ]);

        $this->companyAActor = User::create([
            'name' => 'Company A Recruiter', 'email' => 'rec-a@caddoc.test', 'password' => 'secret1234',
            'emp_code' => 'CDOC-A', 'role' => 2, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $companyBActor = User::create([
            'name' => 'Company B Recruiter', 'email' => 'rec-b@caddoc.test', 'password' => 'secret1234',
            'emp_code' => 'CDOC-B', 'role' => 2, 'company_code' => 'silver-star', 'status' => 0,
        ]);

        $this->candidateA = Candidate::create([
            'name' => 'Candidate A', 'email' => 'candidate-a@example.com', 'source' => 'other',
            'priority' => 'medium', 'stage' => 'applied', 'company_code' => 'nidhi-impex',
            'created_by' => $this->companyAActor->id,
        ]);

        $this->candidateB = Candidate::create([
            'name' => 'Candidate B', 'email' => 'candidate-b@example.com', 'source' => 'other',
            'priority' => 'medium', 'stage' => 'applied', 'company_code' => 'silver-star',
            'created_by' => $companyBActor->id,
        ]);

        $this->documentA = CandidateDocument::create([
            'candidate_id' => $this->candidateA->id, 'document_type' => 'aadhaar',
            'original_filename' => 'aadhaar-a.pdf', 'file_path' => 'candidate-documents/aadhaar-a.pdf',
            'status' => 'PENDING', 'uploaded_by' => $this->companyAActor->id,
        ]);

        $this->documentB = CandidateDocument::create([
            'candidate_id' => $this->candidateB->id, 'document_type' => 'aadhaar',
            'original_filename' => 'aadhaar-b.pdf', 'file_path' => 'candidate-documents/aadhaar-b.pdf',
            'status' => 'PENDING', 'uploaded_by' => $companyBActor->id,
        ]);

        Storage::disk('public')->put($this->documentA->file_path, 'fake-a');
        Storage::disk('public')->put($this->documentB->file_path, 'fake-b');
    }

    private function company(string $code): Company
    {
        return Company::query()->firstOrCreate(
            ['code' => $code],
            ['name' => ucwords(str_replace('-', ' ', $code)), 'is_active' => true]
        );
    }

    private function as(User $user): static
    {
        return $this->withToken(auth('api')->login($user));
    }

    #[Test]
    public function a_company_actor_can_list_and_upload_documents_for_its_own_candidate(): void
    {
        $this->as($this->companyAActor)->getJson("/api/hr/candidates/documents/get/{$this->candidateA->id}")
            ->assertOk()->assertJsonFragment(['original_filename' => 'aadhaar-a.pdf']);

        $file = UploadedFile::fake()->create('pan-a.pdf', 100, 'application/pdf');
        $this->as($this->companyAActor)->postJson("/api/hr/candidates/documents/store/{$this->candidateA->id}", [
            'document_type' => 'pan',
            'file' => $file,
        ])->assertCreated();

        $this->assertDatabaseHas('candidate_documents', [
            'candidate_id' => $this->candidateA->id,
            'document_type' => 'pan',
        ]);
    }

    #[Test]
    public function a_company_actor_cannot_list_another_companys_candidate_documents(): void
    {
        $this->as($this->companyAActor)->getJson("/api/hr/candidates/documents/get/{$this->candidateB->id}")
            ->assertStatus(404);
    }

    #[Test]
    public function a_company_actor_cannot_upload_a_document_to_another_companys_candidate(): void
    {
        $file = UploadedFile::fake()->create('malicious.pdf', 100, 'application/pdf');

        $this->as($this->companyAActor)->postJson("/api/hr/candidates/documents/store/{$this->candidateB->id}", [
            'document_type' => 'pan',
            'file' => $file,
        ])->assertStatus(404);

        $this->assertDatabaseMissing('candidate_documents', ['candidate_id' => $this->candidateB->id, 'document_type' => 'pan']);
    }

    #[Test]
    public function a_company_actor_cannot_review_another_companys_document(): void
    {
        $this->as($this->companyAActor)
            ->postJson("/api/hr/candidates/documents/review/{$this->documentB->id}/approve", [])
            ->assertStatus(404);

        $this->assertDatabaseHas('candidate_documents', ['id' => $this->documentB->id, 'status' => 'PENDING']);
    }

    #[Test]
    public function a_company_actor_cannot_delete_another_companys_document(): void
    {
        $this->as($this->companyAActor)->deleteJson("/api/hr/candidates/documents/delete/{$this->documentB->id}")
            ->assertStatus(404);

        $this->assertDatabaseHas('candidate_documents', ['id' => $this->documentB->id]);
        Storage::disk('public')->assertExists($this->documentB->file_path);
    }

    #[Test]
    public function a_company_actor_can_review_and_delete_its_own_document(): void
    {
        $this->as($this->companyAActor)
            ->postJson("/api/hr/candidates/documents/review/{$this->documentA->id}/approve", [])
            ->assertOk()->assertJsonPath('data.status', 'VERIFIED');

        $this->as($this->companyAActor)->deleteJson("/api/hr/candidates/documents/delete/{$this->documentA->id}")
            ->assertOk();

        $this->assertDatabaseMissing('candidate_documents', ['id' => $this->documentA->id]);
        Storage::disk('public')->assertMissing($this->documentA->file_path);
    }

    #[Test]
    public function root_retains_cross_company_access(): void
    {
        $this->as($this->root)->getJson("/api/hr/candidates/documents/get/{$this->candidateB->id}")
            ->assertOk()->assertJsonFragment(['original_filename' => 'aadhaar-b.pdf']);
    }
}
