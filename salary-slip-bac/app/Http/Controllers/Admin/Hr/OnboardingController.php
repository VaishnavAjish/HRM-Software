<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\CandidateDocument;
use App\Models\Offer;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Every number here now comes from real rows — offer-accepted candidates,
 * their real accepted offers, and CandidateDocument uploads. This used to
 * auto-generate fake Aadhaar/PAN/Degree Certificate documents (with
 * hardcoded VERIFIED/PENDING statuses) whenever a candidate had none, and
 * mixed in literal placeholder numbers ("+5", "76%", a hardcoded "Mon 04 /
 * Tue 05" week) — all of that is gone. Where there's genuinely no data yet
 * (nobody's uploaded a document, nobody's joining this week), the response
 * just says so instead of inventing something to display.
 */
class OnboardingController extends Controller
{
    use ScopesCompany;

    public function dashboard(Request $request)
    {
        $candidatesQuery = Candidate::where('stage', 'offer_accepted');
        $this->applyCompanyScope($candidatesQuery, $request);
        $candidates = $candidatesQuery->get();
        $candidates->load('requisition.department');

        $totalCandidates = $candidates->count();
        $candidateIds = $candidates->pluck('id')->toArray();

        $documents = CandidateDocument::whereIn('candidate_id', $candidateIds)->get();
        $docsPending = $documents->where('status', 'PENDING')->count();
        $docsVerified = $documents->where('status', 'VERIFIED')->count();

        $offers = Offer::whereIn('candidate_id', $candidateIds)->where('status', 'accepted')->get();

        $kpis = [
            [
                'key' => 'pending_onboarding',
                'label' => 'Pending onboarding',
                'value' => $totalCandidates,
                'tone' => 'warn',
            ],
            [
                'key' => 'docs_pending',
                'label' => 'Documents pending',
                'value' => $docsPending,
                'tone' => 'bad',
            ],
            [
                'key' => 'docs_verified',
                'label' => 'Documents verified',
                'value' => $docsVerified,
                'tone' => 'ok',
            ],
        ];

        // Real joining week — the next 7 calendar days, each showing how
        // many accepted offers actually have that joining_date.
        $today = Carbon::today();
        $joiningWeek = [];
        $todayJoining = [];
        for ($i = 0; $i < 7; $i++) {
            $day = $today->copy()->addDays($i);
            $dayOffers = $offers->filter(fn ($o) => $o->joining_date && Carbon::parse($o->joining_date)->isSameDay($day));
            $joiningWeek[] = [
                'label' => $day->format('D d'),
                'caption' => $dayOffers->count() . ' joining',
                'state' => $i === 0 ? 'now' : ($dayOffers->count() ? '' : 'idle'),
            ];
            if ($i === 0) {
                $todayJoining = $dayOffers->map(function ($o) use ($candidates, $documents) {
                    $c = $candidates->firstWhere('id', $o->candidate_id);
                    $c?->load('requisition.department');
                    $docs = $documents->where('candidate_id', $o->candidate_id);
                    $progress = $docs->count() ? (int) round($docs->where('status', 'VERIFIED')->count() / $docs->count() * 100) : 0;

                    return [
                        'id' => $o->candidate_id,
                        'name' => $c->name ?? 'Candidate',
                        'code' => 'CND' . str_pad($o->candidate_id, 5, '0', STR_PAD_LEFT),
                        'role' => $o->designation,
                        'dept' => $c?->requisition?->department?->name ?? 'General',
                        'progress' => $progress,
                        'status' => $progress === 100 && $docs->count() > 0 ? 'PROBATION' : ($progress > 0 ? 'IN_PROGRESS' : 'PRE_BOARDING'),
                    ];
                })->values();
            }
        }

        // Every offer-accepted candidate, grouped by the job they were hired
        // for — not just whoever happens to join today. This is the
        // authoritative "who's onboarding right now, for which role" view.
        $byJob = [];
        foreach ($candidates as $c) {
            $offer = $offers->firstWhere('candidate_id', $c->id);
            $docs = $documents->where('candidate_id', $c->id);
            $progress = $docs->count() ? (int) round($docs->where('status', 'VERIFIED')->count() / $docs->count() * 100) : 0;
            $job = $c->requisition?->designation ?? $offer?->designation ?? 'Unassigned role';

            $byJob[$job][] = [
                'id' => $c->id,
                'name' => $c->name ?? 'Candidate',
                'code' => 'CND' . str_pad($c->id, 5, '0', STR_PAD_LEFT),
                'role' => $job,
                'dept' => $c->requisition?->department?->name ?? 'General',
                'joiningDate' => $offer?->joining_date ? Carbon::parse($offer->joining_date)->format('d M Y') : 'TBD',
                'progress' => $progress,
                'status' => $progress === 100 && $docs->count() > 0 ? 'PROBATION' : ($progress > 0 ? 'IN_PROGRESS' : 'PRE_BOARDING'),
            ];
        }
        $candidatesByJob = [];
        foreach ($byJob as $job => $list) {
            $candidatesByJob[] = ['job' => $job, 'candidates' => $list];
        }
        usort($candidatesByJob, fn ($a, $b) => count($b['candidates']) <=> count($a['candidates']));

        $funnel = [
            ['label' => 'Offer accepted', 'value' => $totalCandidates, 'tone' => 'brand'],
            ['label' => 'Documents uploaded', 'value' => $documents->pluck('candidate_id')->unique()->count(), 'tone' => 'brand'],
            ['label' => 'Documents verified', 'value' => $docsVerified, 'tone' => 'brand'],
        ];

        $byDept = [];
        $depts = $candidates->load('requisition.department')->pluck('requisition.department.name')->filter();
        $deptCounts = array_count_values($depts->toArray());
        foreach ($deptCounts as $dept => $count) {
            $byDept[] = ['label' => $dept, 'value' => $count];
        }
        if (empty($byDept) && $totalCandidates > 0) {
            $byDept[] = ['label' => 'General', 'value' => $totalCandidates];
        }

        // Real last-7-days trend — counted from actual timestamps, not a
        // fabricated series with one real number tacked onto the end.
        $joinersSeries = [];
        $verifiedSeries = [];
        for ($i = 6; $i >= 0; $i--) {
            $day = $today->copy()->subDays($i);
            $joinersSeries[] = $offers->filter(fn ($o) => $o->responded_at && Carbon::parse($o->responded_at)->isSameDay($day))->count();
            $verifiedSeries[] = $documents->filter(fn ($d) => $d->reviewed_at && Carbon::parse($d->reviewed_at)->isSameDay($day) && $d->status === 'VERIFIED')->count();
        }

        // Real activity — actual verify/reject events on real uploads.
        $activity = [];
        foreach ($documents->whereIn('status', ['VERIFIED', 'REJECTED'])->sortByDesc('reviewed_at')->take(5) as $doc) {
            $candidateName = $candidates->firstWhere('id', $doc->candidate_id)->name ?? 'Candidate';
            $activity[] = [
                'tone' => $doc->status === 'VERIFIED' ? 'ok' : 'bad',
                'title' => $doc->document_type . ' ' . ($doc->status === 'VERIFIED' ? 'Verified' : 'Rejected'),
                'description' => $candidateName . ($doc->reviewedBy?->name ? ' · by ' . $doc->reviewedBy->name : ''),
                'at' => $doc->reviewed_at ? $doc->reviewed_at->diffForHumans() : '',
            ];
        }

        return response()->json(['status' => true, 'data' => [
            'kpis' => $kpis,
            'joiningWeek' => $joiningWeek,
            'todayJoining' => $todayJoining,
            'candidatesByJob' => $candidatesByJob,
            'funnel' => $funnel,
            'byDepartment' => $byDept,
            'weekly' => [
                ['label' => 'Joiners (7d)', 'value' => array_sum($joinersSeries), 'series' => $joinersSeries],
                ['label' => 'Documents verified (7d)', 'value' => array_sum($verifiedSeries), 'series' => $verifiedSeries],
            ],
            'activity' => $activity,
        ]]);
    }

    public function journeys(Request $request)
    {
        $query = Candidate::where('stage', 'offer_accepted')->with(['requisition.department']);
        $this->applyCompanyScope($query, $request);
        $candidates = $query->get();

        $journeys = [];
        foreach ($candidates as $c) {
            $offer = Offer::where('candidate_id', $c->id)->orderByDesc('id')->first();
            $docs = CandidateDocument::where('candidate_id', $c->id)->get();
            $totalDocsCount = $docs->count();
            $verifiedDocsCount = $docs->where('status', 'VERIFIED')->count();
            $progress = $totalDocsCount ? (int) round(($verifiedDocsCount / $totalDocsCount) * 100) : 0;

            $status = 'PRE_BOARDING';
            if ($progress === 100 && $totalDocsCount > 0) {
                $status = 'PROBATION';
            } elseif ($progress > 0) {
                $status = 'IN_PROGRESS';
            }

            $journeys[] = [
                'id' => $c->id,
                'name' => $c->name,
                'code' => 'CND' . str_pad($c->id, 5, '0', STR_PAD_LEFT),
                'role' => $c->requisition->designation ?? $offer->designation ?? 'New Hire',
                'dept' => $c->requisition->department->name ?? 'General',
                'joiningDate' => $offer?->joining_date ? date('d M', strtotime($offer->joining_date)) : 'TBD',
                'location' => $c->unit ?? '—',
                'mode' => ($c->requisition && $c->requisition->employment_type === 'remote') ? 'REMOTE' : 'OFFICE',
                'progress' => $progress,
                'status' => $status,
                'slaBreached' => ($offer?->joining_date && strtotime($offer->joining_date) < time() && $progress < 100),
            ];
        }

        return response()->json(['status' => true, 'data' => $journeys]);
    }

    public function showJourney($id)
    {
        $candidate = Candidate::with(['requisition.department'])->find($id);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate journey not found'], 404);
        }

        $offer = Offer::where('candidate_id', $candidate->id)->orderByDesc('id')->first();
        $docs = CandidateDocument::where('candidate_id', $candidate->id)->get();

        $verifiedCount = $docs->where('status', 'VERIFIED')->count();
        $totalCount = $docs->count();
        $progress = $totalCount ? (int) round(($verifiedCount / $totalCount) * 100) : 0;

        $journey = [
            'id' => $candidate->id,
            'name' => $candidate->name,
            'code' => 'CND' . str_pad($candidate->id, 5, '0', STR_PAD_LEFT),
            'role' => $candidate->requisition->designation ?? $offer->designation ?? 'New Hire',
            'dept' => $candidate->requisition->department->name ?? 'General',
            'joiningDate' => $offer?->joining_date ? date('d M', strtotime($offer->joining_date)) : 'TBD',
            'location' => $candidate->unit ?? '—',
            'mode' => 'OFFICE',
            'progress' => $progress,
            'status' => $progress === 100 && $totalCount > 0 ? 'PROBATION' : ($progress > 0 ? 'IN_PROGRESS' : 'PRE_BOARDING'),
            'slaBreached' => false,
            'manager' => $candidate->recruiter->name ?? '—',
        ];

        return response()->json(['status' => true, 'data' => $journey]);
    }

    public function documents(Request $request)
    {
        $candidatesQuery = Candidate::where('stage', 'offer_accepted');
        $this->applyCompanyScope($candidatesQuery, $request);
        $candidates = $candidatesQuery->get();

        $documents = CandidateDocument::whereIn('candidate_id', $candidates->pluck('id'))
            ->orderByDesc('id')
            ->get();

        $mappedDocs = $documents->map(function ($doc) use ($candidates) {
            $candidateName = $candidates->firstWhere('id', $doc->candidate_id)->name ?? 'Candidate';

            $kind = 'ID';
            $typeLower = strtolower($doc->document_type);
            if (str_contains($typeLower, 'cheque') || str_contains($typeLower, 'bank')) {
                $kind = 'BANK';
            } elseif (str_contains($typeLower, 'degree') || str_contains($typeLower, 'certificate')) {
                $kind = 'EDU';
            } elseif (str_contains($typeLower, 'experience') || str_contains($typeLower, 'letter')) {
                $kind = 'EXP';
            }

            return [
                'id' => $doc->id,
                'type' => $doc->document_type,
                'owner' => $candidateName,
                'status' => $doc->status,
                'uploadedAt' => $doc->created_at->format('d M'),
                'kind' => $kind,
                'summary' => $doc->original_filename,
                'url' => $doc->url,
            ];
        })->values();

        return response()->json(['status' => true, 'data' => $mappedDocs]);
    }

    /** Delegates to the real per-candidate document review — kept under this
     *  route too since the Documents page already calls it this way. */
    public function reviewDocument(Request $request, $id, $decision)
    {
        return app(CandidateDocumentController::class)->review($request, $id, $decision);
    }
}
