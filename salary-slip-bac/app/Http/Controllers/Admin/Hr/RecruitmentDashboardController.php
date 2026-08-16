<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\CandidateDocument;
use App\Models\Interview;
use App\Models\JobRequisition;
use App\Models\Offer;
use App\Models\Referral;
use App\Models\RecruitmentAgency;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class RecruitmentDashboardController extends Controller
{
    use ScopesCompany;

    public function index(Request $request)
    {
        $this->applyCompanyScopeQuery($request);

        $today = Carbon::today();
        $startOfMonth = Carbon::today()->startOfMonth();
        $startOfQuarter = Carbon::today()->startOfQuarter();
        $startOfYear = Carbon::today()->startOfYear();
        $thirtyDaysAgo = Carbon::today()->subDays(30);
        $ninetyDaysAgo = Carbon::today()->subDays(90);

        // Base queries with company scope
        $candidateQuery = Candidate::query();
        $this->applyCompanyScope($candidateQuery, $request);

        $requisitionQuery = JobRequisition::query();
        $this->applyCompanyScope($requisitionQuery, $request);

        $offerQuery = Offer::query();
        $this->applyCompanyScope($offerQuery, $request);

        $interviewQuery = Interview::query();
        $this->applyCompanyScope($interviewQuery, $request);

        $candidateQueryBase = (clone $candidateQuery);
        $requisitionQueryBase = (clone $requisitionQuery);
        $offerQueryBase = (clone $offerQuery);
        $interviewQueryBase = (clone $interviewQuery);

        // KPI Cards
        $cards = [
            'open_requisitions' => (clone $requisitionQueryBase)->whereIn('status', ['approved', 'published'])->count(),
            'open_positions' => (clone $requisitionQueryBase)->whereIn('status', ['approved', 'published'])->sum('openings'),
            'total_candidates' => (clone $candidateQueryBase)->count(),
            'candidates_this_month' => (clone $candidateQueryBase)->where('created_at', '>=', $startOfMonth)->count(),
            'active_candidates' => (clone $candidateQueryBase)->whereIn('stage', ['screening', 'shortlisted', 'assessment', 'interview', 'selected'])->count(),
            'candidates_in_interview' => (clone $candidateQueryBase)->where('stage', 'interview')->count(),
            'offers_pending' => (clone $offerQueryBase)->whereIn('status', ['draft', 'pending_approval', 'approved'])->count(),
            'offers_sent' => (clone $offerQueryBase)->where('status', 'sent')->count(),
            'offers_accepted_this_month' => (clone $offerQueryBase)->where('status', 'accepted')->where('created_at', '>=', $startOfMonth)->count(),
            'offers_rejected_this_month' => (clone $offerQueryBase)->where('status', 'rejected')->where('created_at', '>=', $startOfMonth)->count(),
            'interviews_today' => (clone $interviewQueryBase)->whereDate('scheduled_at', Carbon::today())->where('status', 'scheduled')->count(),
            'interviews_this_week' => (clone $interviewQueryBase)->whereBetween('scheduled_at', [Carbon::today()->startOfWeek(), Carbon::today()->endOfWeek()])->where('status', 'scheduled')->count(),
            'interviews_pending_feedback' => (clone $interviewQueryBase)->where('status', 'completed')->whereDoesntHave('feedback')->count(),
            'offers_expiring_soon' => (clone $offerQueryBase)->where('status', 'sent')->where('expiry_date', '>=', $today)->where('expiry_date', '<=', $today->copy()->addDays(7))->count(),
            'bgv_pending' => Candidate::whereIn('stage', ['offer_sent', 'offer_accepted'])->whereHas('documents', function ($q) {
                $q->where('status', 'pending');
            })->count(),
            'joining_this_month' => (clone $offerQueryBase)->where('status', 'accepted')->where('joining_date', '>=', $startOfMonth)->where('joining_date', '<=', $startOfMonth->copy()->endOfMonth())->count(),
            'time_to_fill_avg_days' => $this->calculateAvgTimeToFill($requisitionQueryBase),
            'time_to_hire_avg_days' => $this->calculateAvgTimeToHire($candidateQueryBase),
            'offer_acceptance_rate' => $this->calculateOfferAcceptanceRate($offerQueryBase),
            'joining_rate' => $this->calculateJoiningRate($offerQueryBase),
        ];

        // Hiring Funnel
        $hiringFunnel = Candidate::selectRaw('stage, COUNT(*) as total')
            ->groupBy('stage')
            ->pluck('total', 'stage');

        // Source Effectiveness
        $sourceEffectiveness = Candidate::selectRaw("source, COUNT(*) as total, COUNT(CASE WHEN stage IN ('selected', 'offer_sent', 'offer_accepted') THEN 1 END) as conversions")
            ->groupBy('source')
            ->get()
            ->map(function ($item) {
                $conversionRate = $item->total > 0 ? round(($item->conversions / $item->total) * 100, 1) : 0;
                return [
                    'source' => $item->source,
                    'total' => $item->total,
                    'conversions' => $item->conversions,
                    'conversion_rate' => $conversionRate,
                ];
            });

        // Time to Fill Trend (last 6 months)
        $months = collect(range(5, 0))->map(fn ($i) => Carbon::today()->subMonths($i)->format('Y-m'));
        $timeToFillTrend = $months->map(function ($month) use ($requisitionQueryBase) {
            $start = Carbon::createFromFormat('Y-m', $month)->startOfMonth();
            $end = $start->copy()->endOfMonth();
            $filledRequisitions = (clone $requisitionQueryBase)
                ->where('status', 'closed')
                ->whereBetween('closed_at', [$start->toDateString(), $end->toDateString()])
                ->whereNotNull('closed_at')
                ->get(['created_at', 'closed_at']);
            
            $avgDays = 0;
            if ($filledRequisitions->count() > 0) {
                $totalDays = $filledRequisitions->sum(function ($r) {
                    return Carbon::parse($r->created_at)->diffInDays(Carbon::parse($r->closed_at));
                });
                $avgDays = round($totalDays / $filledRequisitions->count(), 1);
            }
            
            return [
                'month' => $month,
                'avg_days' => $avgDays,
                'filled_count' => $filledRequisitions->count(),
            ];
        });

        // Time to Hire Trend
        $timeToHireTrend = $months->map(function ($month) use ($candidateQueryBase) {
            $start = Carbon::createFromFormat('Y-m', $month)->startOfMonth();
            $end = $start->copy()->endOfMonth();
            $hiredCandidates = (clone $candidateQueryBase)
                ->where('stage', 'offer_accepted')
                ->whereBetween('updated_at', [$start->toDateString(), $end->toDateString()])
                ->get(['created_at', 'updated_at']);
            
            $avgDays = 0;
            if ($hiredCandidates->count() > 0) {
                $totalDays = $hiredCandidates->sum(function ($c) {
                    return Carbon::parse($c->created_at)->diffInDays(Carbon::parse($c->updated_at));
                });
                $avgDays = round($totalDays / $hiredCandidates->count(), 1);
            }
            
            return [
                'month' => $month,
                'avg_days' => $avgDays,
                'hired_count' => $hiredCandidates->count(),
            ];
        });

        // Source Effectiveness Detail
        $sourceDetail = Candidate::selectRaw('source, stage, COUNT(*) as total')
            ->groupBy('source', 'stage')
            ->get()
            ->groupBy('source')
            ->map(function ($items) {
                $stages = $items->pluck('total', 'stage')->toArray();
                $total = array_sum($stages);
                $conversions = ($stages['selected'] ?? 0) + ($stages['offer_sent'] ?? 0) + ($stages['offer_accepted'] ?? 0);
                return [
                    'source' => $items->first()->source,
                    'total' => $total,
                    'conversions' => $conversions,
                    'conversion_rate' => $total > 0 ? round(($conversions / $total) * 100, 1) : 0,
                    'stages' => $stages,
                ];
            })->values();

        // Recruiter Performance
        $recruiterPerformance = Candidate::whereNotNull('recruiter_id')
            ->selectRaw("recruiter_id, COUNT(*) as total_candidates,
                COUNT(CASE WHEN stage IN ('selected', 'offer_sent', 'offer_accepted') THEN 1 END) as conversions,
                AVG(CASE WHEN stage = 'offer_accepted' THEN EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400 END) as avg_time_to_hire")
            ->groupBy('recruiter_id')
            ->with('recruiter:id,name,email')
            ->get()
            ->map(function ($r) {
                return [
                    'recruiter_id' => $r->recruiter_id,
                    'recruiter_name' => $r->recruiter?->name ?? 'Unknown',
                    'total_candidates' => (int) $r->total_candidates,
                    'conversions' => (int) $r->conversions,
                    'conversion_rate' => $r->total_candidates > 0 ? round(($r->conversions / $r->total_candidates) * 100, 1) : 0,
                    'avg_time_to_hire' => $r->avg_time_to_hire ? round($r->avg_time_to_hire, 1) : null,
                ];
            });

        // Department Hiring
        $departmentHiring = JobRequisition::with('department')
            ->whereIn('status', ['approved', 'published', 'open', 'closed'])
            ->get()
            ->groupBy('department.name')
            ->map(function ($items) {
                $totalOpenings = $items->sum('openings');
                $filled = $items->where('status', 'closed')->count();
                $open = $items->whereIn('status', ['approved', 'published', 'open'])->count();
                return [
                    'department' => $items->first()->department?->name ?? 'Unassigned',
                    'total_requisitions' => $items->count(),
                    'total_openings' => $totalOpenings,
                    'filled' => $filled,
                    'open' => $open,
                    'fill_rate' => $totalOpenings > 0 ? round(($filled / $totalOpenings) * 100, 1) : 0,
                ];
            })->values();

        // Source Effectiveness for Chart
        $sourceChart = Candidate::selectRaw('source, COUNT(*) as total')
            ->groupBy('source')
            ->get()
            ->map(function ($item) {
                return ['source' => $item->source, 'total' => $item->total];
            });

        // Stage Distribution for Funnel Chart
        $stageOrder = collect(['applied', 'screening', 'shortlisted', 'assessment', 'interview', 'selected', 'offer_sent', 'offer_accepted', 'rejected', 'on_hold']);
        $funnelData = $stageOrder->map(function ($stage) use ($hiringFunnel) {
            return [
                'stage' => $stage,
                'label' => ucfirst(str_replace('_', ' ', $stage)),
                'count' => $hiringFunnel[$stage] ?? 0,
            ];
        });

        // Recent Activities
        $recentActivities = collect()
            ->concat(Candidate::latest()->take(5)->get()->map(fn ($c) => [
                'type' => 'candidate',
                'text' => "{$c->name} added to pipeline ({$c->stage})",
                'at' => $c->created_at,
            ]))
            ->concat(Interview::with('candidate')->latest()->take(5)->get()->map(fn ($i) => [
                'type' => 'interview',
                'text' => ($i->candidate->name ?? 'Candidate') . " — {$i->round_name} interview {$i->status}",
                'at' => $i->created_at,
            ]))
            ->concat(Offer::with('candidate')->latest()->take(5)->get()->map(fn ($o) => [
                'type' => 'offer',
                'text' => 'Offer ' . $o->status . ' for ' . ($o->candidate->name ?? 'candidate'),
                'at' => $o->created_at,
            ]))
            ->sortByDesc('at')->take(10)->values();

        // Alerts
        $alerts = collect();

        // Requisition overdue (target_closing_date passed and still open)
        $overdueRequisitions = JobRequisition::whereIn('status', ['approved', 'published', 'open'])
            ->whereNotNull('target_closing_date')
            ->where('target_closing_date', '<', $today)
            ->count();
        if ($overdueRequisitions > 0) {
            $alerts->push([
                'type' => 'requisition_overdue',
                'severity' => 'high',
                'message' => "{$overdueRequisitions} requisition(s) past target closing date",
                'count' => $overdueRequisitions,
            ]);
        }

        // Interview feedback overdue
        $overdueFeedback = Interview::where('status', 'completed')
            ->whereDoesntHave('feedback')
            ->whereDate('scheduled_at', '<', $today)
            ->count();
        if ($overdueFeedback > 0) {
            $alerts->push([
                'type' => 'interview_feedback_overdue',
                'severity' => 'high',
                'message' => "{$overdueFeedback} interview(s) pending feedback",
                'count' => $overdueFeedback,
            ]);
        }

        // Offers expiring
        $expiringOffers = Offer::where('status', 'sent')
            ->whereNotNull('expiry_date')
            ->whereBetween('expiry_date', [$today, $today->copy()->addDays(7)])
            ->count();
        if ($expiringOffers > 0) {
            $alerts->push([
                'type' => 'offer_expiring',
                'severity' => 'medium',
                'message' => "{$expiringOffers} offer(s) expiring within 7 days",
                'count' => $expiringOffers,
            ]);
        }

        // BGV delayed
        $bgvDelayed = Candidate::whereIn('stage', ['offer_sent', 'offer_accepted'])
            ->whereHas('documents', function ($q) {
                $q->where('status', 'pending');
            })
            ->where('updated_at', '<', $thirtyDaysAgo)
            ->count();
        if ($bgvDelayed > 0) {
            $alerts->push([
                'type' => 'bgv_delayed',
                'severity' => 'medium',
                'message' => "{$bgvDelayed} candidate(s) with pending BGV > 30 days",
                'count' => $bgvDelayed,
            ]);
        }

        // Joining risk
        $joiningRisk = Offer::where('status', 'accepted')
            ->whereNotNull('joining_date')
            ->whereBetween('joining_date', [$today, $today->copy()->addDays(14)])
            ->whereDoesntHave('candidate.documents', function ($q) {
                $q->where('status', 'approved');
            })
            ->count();
        if ($joiningRisk > 0) {
            $alerts->push([
                'type' => 'joining_risk',
                'severity' => 'high',
                'message' => "{$joiningRisk} candidate(s) joining within 14 days with incomplete documents",
                'count' => $joiningRisk,
            ]);
        }

        // Pending Tasks
        $pendingTasks = collect()
            ->concat(JobRequisition::where('status', 'pending_approval')->get()->map(fn ($r) => ['type' => 'requisition_approval', 'text' => "Approve requisition: {$r->title}", 'id' => $r->id]))
            ->concat(Offer::where('status', 'pending_approval')->get()->map(fn ($o) => ['type' => 'offer_approval', 'text' => 'Approve offer #' . $o->id, 'id' => $o->id]))
            ->concat(Interview::where('status', 'scheduled')->whereDoesntHave('feedback')->whereDate('scheduled_at', '<', $today)->get()->map(fn ($i) => ['type' => 'interview_feedback', 'text' => 'Feedback pending for interview #' . $i->id, 'id' => $i->id]))
            ->values();

        // Recruiter Workload
        $recruiterWorkload = Candidate::whereNotNull('recruiter_id')
            ->selectRaw('recruiter_id, COUNT(*) as active_candidates')
            ->whereIn('stage', ['applied', 'screening', 'shortlisted', 'assessment', 'interview', 'selected'])
            ->groupBy('recruiter_id')
            ->with('recruiter:id,name,email')
            ->get()
            ->map(function ($r) {
                return [
                    'recruiter_id' => $r->recruiter_id,
                    'recruiter_name' => $r->recruiter?->name ?? 'Unknown',
                    'active_candidates' => $r->active_candidates,
                ];
            });

        // Upcoming Interviews
        $upcomingInterviews = Interview::with('candidate')
            ->where('status', 'scheduled')
            ->where('scheduled_at', '>=', $today)
            ->orderBy('scheduled_at')
            ->take(10)
            ->get()
            ->map(function ($i) {
                return [
                    'id' => $i->id,
                    'candidate_name' => $i->candidate->name ?? 'Unknown',
                    'round_name' => $i->round_name,
                    'scheduled_at' => $i->scheduled_at,
                    'mode' => $i->mode,
                    'meeting_link' => $i->meeting_link,
                ];
            });

        return response()->json(['status' => true, 'data' => [
            'cards' => $cards,
            'charts' => [
                'hiring_funnel' => $funnelData->values()->toArray(),
                'time_to_fill_trend' => $timeToFillTrend,
                'time_to_hire_trend' => $timeToHireTrend,
                'source_effectiveness' => $sourceDetail,
                'source_chart' => $sourceChart,
                'department_hiring' => $departmentHiring,
                'recruiter_performance' => $recruiterPerformance,
                'recruiter_workload' => $recruiterWorkload,
            ],
            'recruiter_performance' => $recruiterPerformance,
            'recruiter_workload' => $recruiterWorkload,
            'recent_activities' => $recentActivities,
            'alerts' => $alerts,
            'pending_tasks' => $pendingTasks,
            'upcoming_interviews' => $upcomingInterviews,
            'department_hiring' => $departmentHiring,
            'source_effectiveness' => $sourceEffectiveness,
            'source_chart' => $sourceChart,
            'funnel_data' => $funnelData,
            'time_to_fill_trend' => $timeToFillTrend,
            'time_to_hire_trend' => $timeToHireTrend,
        ]]);
    }

    private function calculateAvgTimeToFill($query)
    {
        $filled = (clone $query)->where('status', 'closed')->whereNotNull('closed_at')->get(['created_at', 'closed_at']);
        if ($filled->count() === 0) return 0;
        $totalDays = $filled->sum(function ($r) {
            return Carbon::parse($r->created_at)->diffInDays(Carbon::parse($r->closed_at));
        });
        return round($totalDays / $filled->count(), 1);
    }

    private function calculateAvgTimeToHire($query)
    {
        $hired = (clone $query)->where('stage', 'offer_accepted')->get(['created_at', 'updated_at']);
        if ($hired->count() === 0) return 0;
        $totalDays = $hired->sum(function ($c) {
            return Carbon::parse($c->created_at)->diffInDays(Carbon::parse($c->updated_at));
        });
        return round($totalDays / $hired->count(), 1);
    }

    private function calculateOfferAcceptanceRate($query)
    {
        $total = (clone $query)->whereIn('status', ['sent', 'accepted', 'rejected'])->count();
        $accepted = (clone $query)->where('status', 'accepted')->count();
        return $total > 0 ? round(($accepted / $total) * 100, 1) : 0;
    }

    private function calculateJoiningRate($query)
    {
        $accepted = (clone $query)->where('status', 'accepted')->count();
        $joined = (clone $query)->where('status', 'accepted')
            ->whereNotNull('joining_date')
            ->where('joining_date', '<=', now()->toDateString())
            ->count();
        return $accepted > 0 ? round(($joined / $accepted) * 100, 1) : 0;
    }

    private function applyCompanyScopeQuery($request)
    {
        // This is handled by the ScopesCompany trait
    }
}