<?php

namespace App\Http\Controllers\Candidate;

use App\Http\Controllers\Controller;
use App\Models\CandidateSavedJob;
use App\Models\JobRequisition;
use Illuminate\Http\Request;

class CandidateSavedJobController extends Controller
{
    public function index(Request $request)
    {
        $account = $request->user();

        $saved = CandidateSavedJob::where('candidate_account_id', $account->id)
            ->with(['requisition:id,title,designation,employment_type,min_experience,max_experience,status,target_closing_date,company_code,unit,department_id,posted_at', 'requisition.department:id,name'])
            ->orderByDesc('created_at')
            ->get()
            ->filter(fn (CandidateSavedJob $row) => $row->requisition !== null)
            ->map(function (CandidateSavedJob $row) {
                $job = $row->requisition;
                $isOpen = $job->status === 'published'
                    && (! $job->target_closing_date || ! $job->target_closing_date->isPast());

                return [
                    'saved_job_id' => $row->id,
                    'saved_at' => $row->created_at->toIso8601String(),
                    'is_open' => $isOpen,
                    'job' => [
                        'id' => $job->id,
                        'title' => $job->title,
                        'designation' => $job->designation,
                        'department' => $job->department ? ['id' => $job->department->id, 'name' => $job->department->name] : null,
                        'employment_type' => $job->employment_type,
                        'min_experience' => $job->min_experience,
                        'max_experience' => $job->max_experience,
                        'company_code' => $job->company_code,
                        'unit' => $job->unit,
                        'target_closing_date' => $job->target_closing_date,
                        'posted_at' => $job->posted_at,
                    ],
                ];
            })
            ->values();

        return response()->json(['status' => true, 'data' => $saved]);
    }

    public function store(Request $request, $slug)
    {
        $account = $request->user();
        $job = $this->findPublishedJob($slug);

        if (! $job) {
            return response()->json(['status' => false, 'message' => 'Job listing not found or is no longer accepting applications.'], 404);
        }

        $saved = CandidateSavedJob::firstOrCreate([
            'candidate_account_id' => $account->id,
            'job_requisition_id' => $job->id,
        ]);

        return response()->json(['status' => true, 'message' => 'Job saved.', 'data' => ['saved_job_id' => $saved->id]], 201);
    }

    public function destroy(Request $request, $slug)
    {
        $account = $request->user();

        // No `published` gate here — a job can be unsaved even after it closes
        // or is unpublished, otherwise a candidate could never clear a stale
        // saved entry once the listing leaves the public job feed.
        $job = is_numeric($slug)
            ? JobRequisition::find($slug)
            : JobRequisition::where('title', str_replace('-', ' ', $slug))->first();

        if (! $job) {
            return response()->json(['status' => false, 'message' => 'Job listing not found.'], 404);
        }

        CandidateSavedJob::where('candidate_account_id', $account->id)
            ->where('job_requisition_id', $job->id)
            ->delete();

        return response()->json(['status' => true, 'message' => 'Job removed from saved jobs.']);
    }

    private function findPublishedJob($slug): ?JobRequisition
    {
        $query = JobRequisition::query()->where('status', 'published');

        if (is_numeric($slug)) {
            return $query->where('id', $slug)->first();
        }

        return $query->where('id', $slug)->orWhere('title', str_replace('-', ' ', $slug))->first();
    }
}
