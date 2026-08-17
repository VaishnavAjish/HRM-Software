<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\Interview;
use App\Models\JobRequisition;
use App\Models\Offer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Regression coverage for a live bug: every KPI tile on the Hiring
 * workspace's Dashboard tab showed "—" despite real data existing.
 * Root cause was a response-contract drift — the backend returned
 * `cards`/`funnel_data`/a flat `alerts` array with no `analytics` key at
 * all, while `RecruitmentDashboardTab.jsx` reads `kpis`/`funnel`/`alerts`
 * (grouped by type)/`analytics`. These tests pin the exact shape the
 * frontend actually consumes.
 *
 * Also covers a second bug found while fixing the first: `Offer` and
 * `Interview` have no `company_code` column, but the controller used to
 * call `applyCompanyScope()` directly on them anyway — a SQL error for any
 * actor without global company scope (role 2+), since the LIKE filter
 * referenced a column that doesn't exist on either table.
 */
class RecruitmentDashboardTest extends TestCase
{
    use RefreshDatabase;

    private function requisition(array $overrides = []): JobRequisition
    {
        return JobRequisition::create(array_merge([
            'title' => 'Senior Software Engineer', 'employment_type' => 'full_time',
            'status' => 'published', 'company_code' => 'nidhi-impex', 'openings' => 2,
        ], $overrides));
    }

    private function candidate(JobRequisition $req, array $overrides = []): Candidate
    {
        return Candidate::create(array_merge([
            'requisition_id' => $req->id, 'name' => 'Jane Candidate', 'email' => 'jane@example.com',
            'source' => 'job_portal', 'stage' => 'applied', 'company_code' => 'nidhi-impex',
        ], $overrides));
    }

    #[Test]
    public function it_returns_the_exact_shape_the_dashboard_tab_reads(): void
    {
        $user = User::create([
            'name' => 'Root', 'email' => 'root@dash.test', 'password' => 'secret1234',
            'emp_code' => 'DASH-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
        $token = $this->withToken(auth('api')->login($user));

        $req = $this->requisition();
        $this->candidate($req, ['stage' => 'applied']);
        $this->candidate($req, ['stage' => 'offer_accepted', 'email' => 'hired@example.com']);

        $response = $token->getJson('/api/hr/recruitment-dashboard');

        $response->assertOk();
        $response->assertJsonStructure([
            'data' => [
                'kpis' => ['open_requisitions', 'total_openings', 'in_review_requisitions', 'draft_requisitions', 'active_candidates', 'new_candidates_7d', 'interviews_today', 'interviews_this_week', 'offers_awaiting_response', 'offers_accepted_30d', 'upcoming_joiners_14d'],
                'funnel' => [['stage', 'count']],
                'alerts' => ['overdue_requisitions' => ['count', 'items'], 'approvals_waiting', 'feedback_pending', 'offers_expiring', 'joining_overdue'],
                'analytics' => ['window_days', 'hires', 'time_to_hire_days', 'offers_responded', 'offer_acceptance_rate', 'sources'],
                'definitions' => ['time_to_hire_days', 'offer_acceptance_rate'],
            ],
        ]);

        $response->assertJsonPath('data.kpis.open_requisitions', 1);
        $response->assertJsonPath('data.kpis.total_openings', 2);
        $response->assertJsonPath('data.analytics.hires', 1);
    }

    #[Test]
    public function offers_and_interviews_do_not_error_for_a_non_globally_scoped_actor(): void
    {
        $user = User::create([
            'name' => 'Unit Manager', 'email' => 'unit@dash.test', 'password' => 'secret1234',
            'emp_code' => 'DASH-UNIT', 'role' => 2, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
        $token = $this->withToken(auth('api')->login($user));

        $req = $this->requisition();
        $candidate = $this->candidate($req);
        Offer::create(['candidate_id' => $candidate->id, 'requisition_id' => $req->id, 'designation' => 'SSE', 'status' => 'sent']);
        Interview::create(['candidate_id' => $candidate->id, 'requisition_id' => $req->id, 'round_name' => 'HR', 'scheduled_at' => now()->addDay(), 'status' => 'scheduled']);

        $token->getJson('/api/hr/recruitment-dashboard')->assertOk();
    }

    #[Test]
    public function an_overdue_requisition_surfaces_as_a_named_alert_item(): void
    {
        $user = User::create([
            'name' => 'Root', 'email' => 'root2@dash.test', 'password' => 'secret1234',
            'emp_code' => 'DASH-ROOT2', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
        $token = $this->withToken(auth('api')->login($user));

        $this->requisition(['title' => 'Overdue Role', 'target_closing_date' => now()->subDays(3)->toDateString()]);

        $response = $token->getJson('/api/hr/recruitment-dashboard');

        $response->assertJsonPath('data.alerts.overdue_requisitions.count', 1);
        $response->assertJsonPath('data.alerts.overdue_requisitions.items.0.title', 'Overdue Role');
        $response->assertJsonPath('data.alerts.overdue_requisitions.items.0.days_overdue', 3);
    }
}
