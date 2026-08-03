<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Models\Asset;
use App\Models\AssetAllocation;
use App\Models\Candidate;
use App\Models\Interview;
use App\Models\JobRequisition;
use App\Models\PerformanceReview;
use App\Models\User;
use Illuminate\Http\Request;

class HrReportController extends Controller
{
    use ScopesCompany;

    private const TYPES = [
        'hiring', 'interview', 'joining', 'attrition', 'asset_allocation',
        'performance', 'department', 'hr_kpi',
    ];

    public function generate(Request $request)
    {
        $type = $request->type;
        if (!in_array($type, self::TYPES, true)) {
            return response()->json(['status' => false, 'message' => 'Unknown report type'], 422);
        }

        $report = match ($type) {
            'hiring' => $this->hiringReport($request),
            'interview' => $this->interviewReport($request),
            'joining' => $this->joiningReport($request),
            'attrition' => $this->attritionReport($request),
            'asset_allocation' => $this->assetAllocationReport($request),
            'performance' => $this->performanceReport($request),
            'department' => $this->departmentReport($request),
            'hr_kpi' => $this->hrKpiReport($request),
        };

        return response()->json(['status' => true, 'data' => $report]);
    }

    private function dateRange(Request $request, string $column, $query)
    {
        if ($request->from) {
            $query->whereDate($column, '>=', $request->from);
        }
        if ($request->to) {
            $query->whereDate($column, '<=', $request->to);
        }

        return $query;
    }

    private function hiringReport(Request $request): array
    {
        $query = JobRequisition::with('department')->withCount('candidates');
        $this->applyCompanyScope($query, $request);
        $this->dateRange($request, 'created_at', $query);

        $rows = $query->get()->map(fn ($r) => [
            'Title' => $r->title,
            'Department' => $r->department->name ?? '—',
            'Openings' => $r->openings,
            'Status' => $r->status,
            'Candidates' => $r->candidates_count,
            'Created' => optional($r->created_at)->format('Y-m-d'),
        ]);

        return ['columns' => ['Title', 'Department', 'Openings', 'Status', 'Candidates', 'Created'], 'rows' => $rows];
    }

    private function interviewReport(Request $request): array
    {
        $query = Interview::with(['candidate', 'feedback']);
        $this->dateRange($request, 'scheduled_at', $query);

        $rows = $query->get()->map(fn ($i) => [
            'Candidate' => $i->candidate->name ?? '—',
            'Round' => $i->round_name,
            'Scheduled' => optional($i->scheduled_at)->format('Y-m-d H:i'),
            'Mode' => $i->mode,
            'Status' => $i->status,
            'Avg Rating' => $i->feedback->count() ? round($i->feedback->avg('rating'), 2) : '—',
        ]);

        return ['columns' => ['Candidate', 'Round', 'Scheduled', 'Mode', 'Status', 'Avg Rating'], 'rows' => $rows];
    }

    private function joiningReport(Request $request): array
    {
        $query = User::where('is_deleted', 0)->whereNotNull('joining_date');
        $this->applyCompanyScope($query, $request);
        $this->dateRange($request, 'joining_date', $query);

        $rows = $query->get()->map(fn ($u) => [
            'Name' => $u->name,
            'Emp Code' => $u->emp_code,
            'Department' => $u->department,
            'Designation' => $u->designation,
            'Joining Date' => $u->joining_date,
        ]);

        return ['columns' => ['Name', 'Emp Code', 'Department', 'Designation', 'Joining Date'], 'rows' => $rows];
    }

    private function attritionReport(Request $request): array
    {
        $query = User::whereNotNull('resignation_date');
        $this->applyCompanyScope($query, $request);
        $this->dateRange($request, 'resignation_date', $query);

        $rows = $query->get()->map(fn ($u) => [
            'Name' => $u->name,
            'Emp Code' => $u->emp_code,
            'Department' => $u->department,
            'Designation' => $u->designation,
            'Joining Date' => $u->joining_date,
            'Resignation Date' => $u->resignation_date,
        ]);

        return ['columns' => ['Name', 'Emp Code', 'Department', 'Designation', 'Joining Date', 'Resignation Date'], 'rows' => $rows];
    }

    private function assetAllocationReport(Request $request): array
    {
        $query = AssetAllocation::with(['asset', 'user']);
        $this->dateRange($request, 'allocated_at', $query);

        $rows = $query->get()->map(fn ($a) => [
            'Asset Tag' => $a->asset->asset_tag ?? '—',
            'Category' => $a->asset->category ?? '—',
            'Assigned To' => $a->user->name ?? '—',
            'Allocated On' => optional($a->allocated_at)->format('Y-m-d'),
            'Status' => $a->status,
            'Returned On' => optional($a->returned_at)->format('Y-m-d'),
        ]);

        return ['columns' => ['Asset Tag', 'Category', 'Assigned To', 'Allocated On', 'Status', 'Returned On'], 'rows' => $rows];
    }

    private function performanceReport(Request $request): array
    {
        $query = PerformanceReview::with(['user', 'cycle'])->where('review_type', 'manager');
        if ($request->cycle_id) {
            $query->where('cycle_id', $request->cycle_id);
        }

        $rows = $query->get()->map(fn ($r) => [
            'Employee' => $r->user->name ?? '—',
            'Cycle' => $r->cycle->name ?? '—',
            'Overall Rating' => $r->overall_rating ?? '—',
            'Potential Rating' => $r->potential_rating ?? '—',
            'Status' => $r->status,
        ]);

        return ['columns' => ['Employee', 'Cycle', 'Overall Rating', 'Potential Rating', 'Status'], 'rows' => $rows];
    }

    private function departmentReport(Request $request): array
    {
        $query = User::where('is_deleted', 0)->whereNotNull('department')->where('department', '!=', '');
        $this->applyCompanyScope($query, $request);

        $rows = $query->selectRaw('department, COUNT(*) as headcount')
            ->groupBy('department')
            ->get()
            ->map(fn ($row) => ['Department' => $row->department, 'Headcount' => $row->headcount]);

        return ['columns' => ['Department', 'Headcount'], 'rows' => $rows];
    }

    private function hrKpiReport(Request $request): array
    {
        $userQuery = User::where('is_deleted', 0);
        $this->applyCompanyScope($userQuery, $request);

        $openRequisitions = JobRequisition::whereIn('status', ['approved', 'posted'])->count();
        $activeCandidates = Candidate::whereNotIn('stage', ['selected', 'rejected', 'offer_accepted'])->count();
        $interviewsScheduled = Interview::where('status', 'scheduled')->count();
        $assetsAssigned = Asset::where('status', 'assigned')->count();

        $rows = collect([
            ['KPI' => 'Total Employees', 'Value' => (clone $userQuery)->count()],
            ['KPI' => 'Open Requisitions', 'Value' => $openRequisitions],
            ['KPI' => 'Active Candidates in Pipeline', 'Value' => $activeCandidates],
            ['KPI' => 'Interviews Scheduled', 'Value' => $interviewsScheduled],
            ['KPI' => 'Assets Assigned', 'Value' => $assetsAssigned],
        ]);

        return ['columns' => ['KPI', 'Value'], 'rows' => $rows];
    }
}
