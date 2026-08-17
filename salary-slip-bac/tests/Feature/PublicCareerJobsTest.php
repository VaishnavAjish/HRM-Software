<?php

namespace Tests\Feature;

use App\Models\JobRequisition;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Regression coverage for a live bug: a real published job (id 52, "Test
 * 1") never appeared on the public Career Portal despite `status =
 * 'published'`, `posted_at` set, and no closing date. Traced end-to-end:
 * the backend query was correct in isolation — the actual HTTP request
 * from `CareersList.jsx` on a default page load (no filters touched) sent
 * `search=undefined&employment_type=undefined&company_code=undefined`,
 * because `new URLSearchParams({ x: undefined })` serializes to the
 * literal string "undefined" rather than omitting the key. The backend's
 * `if ($request->company_code)` treated that string as a real filter and
 * excluded every job. Fixed in `publicJobApi.getJobs()` (frontend) by
 * stripping undefined/null/empty values before building the query string.
 * These tests lock in the *backend* half of that contract: the query
 * itself, given a genuinely absent filter, must return the job.
 */
class PublicCareerJobsTest extends TestCase
{
    use RefreshDatabase;

    private function job(array $overrides = []): JobRequisition
    {
        return JobRequisition::create(array_merge([
            'title' => 'Senior Software Engineer',
            'employment_type' => 'full_time',
            'status' => 'published',
            'company_code' => 'nidhi-impex',
            'posted_at' => now(),
        ], $overrides));
    }

    #[Test]
    public function a_published_job_with_no_filters_applied_is_returned(): void
    {
        $job = $this->job();

        $response = $this->getJson('/api/public/jobs');

        $response->assertOk();
        $response->assertJsonPath('data.data.0.id', $job->id);
    }

    #[Test]
    public function a_published_job_with_a_comma_separated_multi_company_code_is_still_returned(): void
    {
        // Matches the real affected job: company_code stored as
        // "nidhi-impex,silver-star" when a requisition targets multiple
        // companies. No filter applied means it must still surface.
        $job = $this->job(['company_code' => 'nidhi-impex,silver-star']);

        $response = $this->getJson('/api/public/jobs');

        $response->assertOk()->assertJsonPath('data.data.0.id', $job->id);
    }

    #[Test]
    public function draft_pending_and_closed_jobs_are_never_public(): void
    {
        $this->job(['status' => 'draft', 'title' => 'Draft Job']);
        $this->job(['status' => 'pending_hr_review', 'title' => 'Pending Job']);
        $this->job(['status' => 'approved', 'title' => 'Approved Not Yet Published']);
        $this->job(['status' => 'closed', 'title' => 'Closed Job']);

        $response = $this->getJson('/api/public/jobs');

        $response->assertOk()->assertJsonCount(0, 'data.data');
    }

    #[Test]
    public function a_job_past_its_closing_date_is_excluded(): void
    {
        $this->job(['target_closing_date' => now()->subDay()->toDateString()]);

        $response = $this->getJson('/api/public/jobs');

        $response->assertOk()->assertJsonCount(0, 'data.data');
    }

    #[Test]
    public function a_job_closing_today_is_still_included(): void
    {
        $job = $this->job(['target_closing_date' => now()->toDateString()]);

        $response = $this->getJson('/api/public/jobs');

        $response->assertOk()->assertJsonPath('data.data.0.id', $job->id);
    }

    #[Test]
    public function a_job_with_no_closing_date_never_expires(): void
    {
        $job = $this->job(['target_closing_date' => null]);

        $response = $this->getJson('/api/public/jobs');

        $response->assertOk()->assertJsonPath('data.data.0.id', $job->id);
    }

    #[Test]
    public function a_soft_deleted_job_is_excluded_even_if_published(): void
    {
        $job = $this->job();
        $job->delete();

        $response = $this->getJson('/api/public/jobs');

        $response->assertOk()->assertJsonCount(0, 'data.data');
    }

    #[Test]
    public function an_empty_search_string_returns_every_published_job_rather_than_none(): void
    {
        $job = $this->job();

        $response = $this->getJson('/api/public/jobs?search=');

        $response->assertOk()->assertJsonPath('data.data.0.id', $job->id);
    }

    #[Test]
    public function the_literal_string_undefined_as_a_filter_value_is_treated_as_a_real_filter_by_the_backend(): void
    {
        // Documents the exact malformed request the buggy frontend used to
        // send — this MUST return zero results, proving the fix has to
        // live in the client that builds the query string, not here.
        $this->job();

        $response = $this->getJson('/api/public/jobs?search=undefined&employment_type=undefined&company_code=undefined');

        $response->assertOk()->assertJsonCount(0, 'data.data');
    }

    #[Test]
    public function the_public_endpoint_requires_no_authentication(): void
    {
        $this->job();

        // Deliberately no ->withToken()/auth header of any kind.
        $response = $this->getJson('/api/public/jobs');

        $response->assertOk()->assertJsonCount(1, 'data.data');
    }

    #[Test]
    public function the_public_projection_does_not_expose_internal_workflow_fields(): void
    {
        $this->job();

        $response = $this->getJson('/api/public/jobs');
        $raw = $response->getContent();

        $this->assertStringNotContainsString('ats_score', $raw);
        $this->assertStringNotContainsString('current_approval_cycle_id', $raw);
    }

    #[Test]
    public function an_explicit_company_filter_narrows_results(): void
    {
        $matching = $this->job(['company_code' => 'nidhi-impex']);
        $this->job(['company_code' => 'silver-star', 'title' => 'Other Company Job']);

        $response = $this->getJson('/api/public/jobs?company_code=nidhi-impex');

        $response->assertOk()->assertJsonCount(1, 'data.data');
        $response->assertJsonPath('data.data.0.id', $matching->id);
    }

    #[Test]
    public function a_published_job_is_reachable_via_the_detail_endpoint_by_id(): void
    {
        $job = $this->job();

        $response = $this->getJson("/api/public/jobs/{$job->id}");

        $response->assertOk()->assertJsonPath('data.id', $job->id);
    }

    #[Test]
    public function a_draft_job_is_not_reachable_via_the_detail_endpoint(): void
    {
        $job = $this->job(['status' => 'draft']);

        $response = $this->getJson("/api/public/jobs/{$job->id}");

        $response->assertStatus(404);
    }
}
