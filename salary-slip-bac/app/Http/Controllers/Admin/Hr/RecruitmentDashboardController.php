<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\Interview;
use App\Models\JobRequisition;
use App\Models\Offer;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class RecruitmentDashboardController extends Controller
{
    use ScopesCompany;

    private const IN_REVIEW_STATUSES = ['pending_hr_review', 'pending_director_review', 'returned_to_hr', 'revision_requested'];
    private const OPEN_STATUSES = ['approved', 'published', 'posted'];

    public function index(Request $request)
    {
        $today = Carbon::today();
        $windowDays = 90;
        $windowStart = $today->copy()->subDays($windowDays);
        $sevenDaysAgo = $today->copy()->subDays(7);
        $thirtyDaysAgo = $today->copy()->subDays(30);

        $requisitionQuery = JobRequisition::query();
        $this->applyCompanyScope($requisitionQuery, $request);

        $candidateQuery = Candidate::query();
        $this->applyCompanyScope($candidateQuery, $request);

        // Offer/Interview carry no company_code column of their own — they're
        // scoped through the candidate they belong to, not by applying the
        // company_code LIKE filter directly (that used to throw a SQL error
        // for any non-globally-scoped actor, since the column doesn't exist
        // on either table).
        $offerQuery = Offer::whereHas('candidate', fn ($q) => $this->applyCompanyScope($q, $request));
        $interviewQuery = Interview::whereHas('candidate', fn ($q) => $this->applyCompanyScope($q, $request));

        $kpis = [
            'open_requisitions' => (clone $requisitionQuery)->whereIn('status', self::OPEN_STATUSES)->count(),
            'total_openings' => (int) (clone $requisitionQuery)->whereIn('status', self::OPEN_STATUSES)->sum('openings'),
            'in_review_requisitions' => (clone $requisitionQuery)->whereIn('status', self::IN_REVIEW_STATUSES)->count(),
            'draft_requisitions' => (clone $requisitionQuery)->where('status', 'draft')->count(),
            'active_candidates' => (clone $candidateQuery)->whereIn('stage', ['screening', 'shortlisted', 'assessment', 'interview', 'selected'])->count(),
            'new_candidates_7d' => (clone $candidateQuery)->where('created_at', '>=', $sevenDaysAgo)->count(),
            'interviews_today' => (clone $interviewQuery)->whereDate('scheduled_at', $today)->where('status', 'scheduled')->count(),
            'interviews_this_week' => (clone $interviewQuery)->whereBetween('scheduled_at', [$today->copy()->startOfWeek(), $today->copy()->endOfWeek()])->where('status', 'scheduled')->count(),
            'offers_awaiting_response' => (clone $offerQuery)->where('status', 'sent')->count(),
            'offers_accepted_30d' => (clone $offerQuery)->where('status', 'accepted')->where('responded_at', '>=', $thirtyDaysAgo)->count(),
            'upcoming_joiners_14d' => (clone $offerQuery)->where('status', 'accepted')->whereBetween('joining_date', [$today, $today->copy()->addDays(14)])->count(),
        ];

        $funnel = (clone $candidateQuery)
            ->selectRaw('stage, COUNT(*) as count')
            ->groupBy('stage')
            ->pluck('count', 'stage');
        $stageOrder = ['applied', 'screening', 'shortlisted', 'assessment', 'interview', 'selected', 'offer_sent', 'offer_accepted', 'rejected', 'on_hold'];
        $funnelData = collect($stageOrder)->map(fn ($stage) => ['stage' => $stage, 'count' => (int) ($funnel[$stage] ?? 0)])->values();

        $alerts = [
            'overdue_requisitions' => $this->overdueRequisitionsAlert($requisitionQuery, $today),
            'approvals_waiting' => $this->approvalsWaitingAlert($requisitionQuery, $today),
            'feedback_pending' => $this->feedbackPendingAlert($interviewQuery, $today),
            'offers_expiring' => $this->offersExpiringAlert($offerQuery, $today),
            'joining_overdue' => $this->joiningOverdueAlert($offerQuery, $today),
        ];

        $analytics = $this->buildAnalytics($candidateQuery, $offerQuery, $windowStart, $windowDays);

        return response()->json(['status' => true, 'data' => [
            'kpis' => $kpis,
            'funnel' => $funnelData,
            'alerts' => $alerts,
            'analytics' => $analytics,
            'definitions' => [
                'time_to_hire_days' => 'Time to hire: average days from application to offer acceptance.',
                'offer_acceptance_rate' => 'Offer acceptance rate: share of responded offers (accepted or rejected) that were accepted.',
            ],
        ]]);
    }

    private function overdueRequisitionsAlert($requisitionQuery, Carbon $today): array
    {
        $items = (clone $requisitionQuery)
            ->whereIn('status', self::OPEN_STATUSES)
            ->whereNotNull('target_closing_date')
            ->where('target_closing_date', '<', $today)
            ->orderBy('target_closing_date')
            ->get(['id', 'title', 'target_closing_date']);

        return [
            'count' => $items->count(),
            'items' => $items->take(5)->map(fn ($r) => [
                'title' => $r->title,
                'days_overdue' => Carbon::parse($r->target_closing_date)->diffInDays($today),
            ])->values(),
        ];
    }

    private function approvalsWaitingAlert($requisitionQuery, Carbon $today): array
    {
        $items = (clone $requisitionQuery)
            ->whereIn('status', ['pending_hr_review', 'pending_director_review'])
            ->orderBy('updated_at')
            ->get(['id', 'title', 'status', 'updated_at']);

        return [
            'count' => $items->count(),
            'items' => $items->take(5)->map(fn ($r) => [
                'title' => $r->title,
                'step_type' => $r->status === 'pending_hr_review' ? 'HR Manager' : 'Director',
                'days_waiting' => Carbon::parse($r->updated_at)->diffInDays($today),
            ])->values(),
        ];
    }

    private function feedbackPendingAlert($interviewQuery, Carbon $today): array
    {
        $items = (clone $interviewQuery)
            ->where('status', 'completed')
            ->whereDoesntHave('feedback')
            ->whereDate('scheduled_at', '<', $today)
            ->with('candidate:id,name')
            ->orderBy('scheduled_at')
            ->get();

        return [
            'count' => $items->count(),
            'items' => $items->take(5)->map(fn ($i) => [
                'candidate' => $i->candidate->name ?? 'Candidate',
                'round_name' => $i->round_name,
                'days_waiting' => Carbon::parse($i->scheduled_at)->diffInDays($today),
            ])->values(),
        ];
    }

    private function offersExpiringAlert($offerQuery, Carbon $today): array
    {
        $items = (clone $offerQuery)
            ->where('status', 'sent')
            ->whereNotNull('expiry_date')
            ->where('expiry_date', '<=', $today->copy()->addDays(7))
            ->with('candidate:id,name')
            ->orderBy('expiry_date')
            ->get();

        return [
            'count' => $items->count(),
            'items' => $items->take(5)->map(fn ($o) => [
                'candidate' => $o->candidate->name ?? 'Candidate',
                // Positive = days remaining, negative = days past expiry —
                // the frontend branches its label on the sign of this value.
                'days_left' => (int) $today->diffInDays(Carbon::parse($o->expiry_date), false),
            ])->values(),
        ];
    }

    private function joiningOverdueAlert($offerQuery, Carbon $today): array
    {
        $items = (clone $offerQuery)
            ->where('status', 'accepted')
            ->whereNotNull('joining_date')
            ->where('joining_date', '<', $today)
            ->with('candidate:id,name')
            ->orderBy('joining_date')
            ->get();

        return [
            'count' => $items->count(),
            'items' => $items->take(5)->map(fn ($o) => [
                'candidate' => $o->candidate->name ?? 'Candidate',
                'days_overdue' => Carbon::parse($o->joining_date)->diffInDays($today),
            ])->values(),
        ];
    }

    private function buildAnalytics($candidateQuery, $offerQuery, Carbon $windowStart, int $windowDays): array
    {
        $hired = (clone $candidateQuery)
            ->where('stage', 'offer_accepted')
            ->where('updated_at', '>=', $windowStart)
            ->get(['created_at', 'updated_at']);

        $timeToHireDays = null;
        if ($hired->count() > 0) {
            $totalDays = $hired->sum(fn ($c) => Carbon::parse($c->created_at)->diffInDays(Carbon::parse($c->updated_at)));
            $timeToHireDays = round($totalDays / $hired->count(), 1);
        }

        $respondedOffers = (clone $offerQuery)
            ->whereIn('status', ['accepted', 'rejected'])
            ->where('responded_at', '>=', $windowStart)
            ->get(['status']);
        $offersResponded = $respondedOffers->count();
        $offerAcceptanceRate = $offersResponded > 0
            ? round($respondedOffers->where('status', 'accepted')->count() / $offersResponded * 100, 1)
            : null;

        $sources = (clone $candidateQuery)
            ->where('created_at', '>=', $windowStart)
            ->selectRaw("source, COUNT(*) as applied, COUNT(CASE WHEN stage = 'offer_accepted' THEN 1 END) as hired")
            ->groupBy('source')
            ->get()
            ->map(fn ($row) => [
                'source' => $row->source,
                'applied' => (int) $row->applied,
                'hired' => (int) $row->hired,
                'conversion_pct' => $row->applied > 0 ? round($row->hired / $row->applied * 100, 1) : 0,
            ])
            ->values();

        return [
            'window_days' => $windowDays,
            'hires' => $hired->count(),
            'time_to_hire_days' => $timeToHireDays,
            'offers_responded' => $offersResponded,
            'offer_acceptance_rate' => $offerAcceptanceRate,
            'sources' => $sources,
        ];
    }
}
