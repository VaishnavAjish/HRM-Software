<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Models\Asset;
use App\Models\Candidate;
use App\Models\Interview;
use App\Models\JobRequisition;
use App\Models\Offer;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class HrDashboardController extends Controller
{
    use ScopesCompany;

    public function index(Request $request)
    {
        $userQuery = User::where('is_deleted', 0)
            ->where('role', '!=', 0)
            ->where(function ($q) {
                $q->whereNull('type')->orWhereNotIn('type', ['appointment', 'agent']);
            });
        $this->applyCompanyScope($userQuery, $request);

        $today = Carbon::today();
        $in30Days = Carbon::today()->addDays(30);

        $cards = [
            'total_employees' => (clone $userQuery)->count(),
            'active_employees' => (clone $userQuery)->where('status', 0)->count(),
            'new_joiners' => (clone $userQuery)->whereDate('joining_date', '>=', $today->copy()->subDays(30))->count(),
            'employees_on_notice_period' => (clone $userQuery)->whereNotNull('resignation_date')->whereDate('resignation_date', '>=', $today)->count(),
            'pending_resignations' => (clone $userQuery)->whereNotNull('resignation_date')->whereDate('resignation_date', '>=', $today)->count(),
            'open_job_positions' => JobRequisition::whereIn('status', ['approved', 'posted'])->sum('openings'),
            'interviews_today' => Interview::whereDate('scheduled_at', $today)->where('status', 'scheduled')->count(),
            'assets_pending_allocation' => Asset::where('status', 'available')->count(),
            'pending_approvals' => JobRequisition::whereIn('status', ['pending_hr_review', 'pending_director_review'])->count()
                + Offer::where('status', 'draft')->count(),
            'upcoming_confirmations' => 0,
            'employees_on_leave' => 0,
        ];

        $upcomingBirthdays = (clone $userQuery)->whereNotNull('dob')
            ->get(['id', 'name', 'dob'])
            ->filter(function ($u) use ($today, $in30Days) {
                $next = Carbon::parse($u->dob)->year($today->year);
                if ($next->lt($today)) {
                    $next->addYear();
                }
                return $next->between($today, $in30Days);
            })
            ->map(fn ($u) => ['id' => $u->id, 'name' => $u->name, 'date' => Carbon::parse($u->dob)->format('M d')])
            ->values();

        $upcomingAnniversaries = (clone $userQuery)->whereNotNull('joining_date')
            ->get(['id', 'name', 'joining_date'])
            ->filter(function ($u) use ($today, $in30Days) {
                $next = Carbon::parse($u->joining_date)->year($today->year);
                if ($next->lt($today)) {
                    $next->addYear();
                }
                return $next->between($today, $in30Days);
            })
            ->map(fn ($u) => ['id' => $u->id, 'name' => $u->name, 'date' => Carbon::parse($u->joining_date)->format('M d')])
            ->values();

        $cards['upcoming_birthdays'] = $upcomingBirthdays->count();
        $cards['upcoming_work_anniversaries'] = $upcomingAnniversaries->count();

        $hiringFunnel = Candidate::selectRaw('stage, COUNT(*) as total')->groupBy('stage')->pluck('total', 'stage');

        $months = collect(range(5, 0))->map(fn ($i) => Carbon::today()->subMonths($i)->format('Y-m'));
        // No driver-specific date functions here: joining_date is a varchar
        // holding 'YYYY-MM-DD', so a prefix match is exact, while
        // resignation_date is a real date column matched by month range.
        $employeeGrowth = $months->map(function ($month) use ($userQuery) {
            $count = (clone $userQuery)->where('joining_date', 'like', $month.'%')->count();
            return ['month' => $month, 'count' => $count];
        });
        $attritionTrend = $months->map(function ($month) use ($userQuery) {
            $start = Carbon::createFromFormat('Y-m', $month)->startOfMonth();
            $count = (clone $userQuery)->whereBetween('resignation_date', [
                $start->toDateString(),
                $start->copy()->endOfMonth()->toDateString(),
            ])->count();
            return ['month' => $month, 'count' => $count];
        });

        $departmentDistribution = (clone $userQuery)
            ->whereNotNull('department')->where('department', '!=', '')
            ->selectRaw('department, COUNT(*) as total')
            ->groupBy('department')
            ->get();

        $genderDiversity = (clone $userQuery)
            ->whereNotNull('gender')->where('gender', '!=', '')
            ->selectRaw('gender, COUNT(*) as total')
            ->groupBy('gender')
            ->get();

        $ageBuckets = ['<25' => 0, '25-34' => 0, '35-44' => 0, '45-54' => 0, '55+' => 0];
        (clone $userQuery)->whereNotNull('dob')->get(['dob'])->each(function ($u) use (&$ageBuckets) {
            $age = Carbon::parse($u->dob)->age;
            $key = $age < 25 ? '<25' : ($age < 35 ? '25-34' : ($age < 45 ? '35-44' : ($age < 55 ? '45-54' : '55+')));
            $ageBuckets[$key]++;
        });

        $recentActivities = collect()
            ->concat(Candidate::latest()->take(5)->get()->map(fn ($c) => [
                'type' => 'candidate', 'text' => "{$c->name} added to pipeline ({$c->stage})", 'at' => $c->created_at,
            ]))
            ->concat(Interview::with('candidate')->latest()->take(5)->get()->map(fn ($i) => [
                'type' => 'interview', 'text' => ($i->candidate->name ?? 'Candidate') . " — {$i->round_name} interview {$i->status}", 'at' => $i->created_at,
            ]))
            ->concat(Offer::with('candidate')->latest()->take(5)->get()->map(fn ($o) => [
                'type' => 'offer', 'text' => 'Offer ' . $o->status . ' for ' . ($o->candidate->name ?? 'candidate'), 'at' => $o->created_at,
            ]))
            ->sortByDesc('at')->take(10)->values();

        $pendingTasks = collect()
            ->concat(JobRequisition::whereIn('status', ['pending_hr_review', 'pending_director_review'])->get()->map(fn ($r) => ['type' => 'requisition_approval', 'text' => "Review requisition: {$r->title}", 'id' => $r->id]))
            ->concat(Offer::where('status', 'draft')->get()->map(fn ($o) => ['type' => 'offer_approval', 'text' => 'Approve offer #' . $o->id, 'id' => $o->id]))
            ->concat(Interview::where('status', 'scheduled')->whereDoesntHave('feedback')->whereDate('scheduled_at', '<', $today)->get()->map(fn ($i) => ['type' => 'interview_feedback', 'text' => 'Feedback pending for interview #' . $i->id, 'id' => $i->id]))
            ->values();

        return response()->json(['status' => true, 'data' => [
            'cards' => $cards,
            'upcoming_birthdays' => $upcomingBirthdays,
            'upcoming_anniversaries' => $upcomingAnniversaries,
            'charts' => [
                'hiring_funnel' => $hiringFunnel,
                'employee_growth' => $employeeGrowth,
                'attrition_trend' => $attritionTrend,
                'department_distribution' => $departmentDistribution,
                'gender_diversity' => $genderDiversity,
                'age_distribution' => collect($ageBuckets)->map(fn ($v, $k) => ['band' => $k, 'count' => $v])->values(),
            ],
            'recent_activities' => $recentActivities,
            'pending_tasks' => $pendingTasks,
        ]]);
    }
}
