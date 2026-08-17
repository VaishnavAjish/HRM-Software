<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\JobRequisition;
use Illuminate\Http\Request;

class PublicJobController extends Controller
{
    public function index(Request $request)
    {
        $query = JobRequisition::query()
            ->where('status', 'published')
            ->where(function ($q) {
                $q->whereNull('target_closing_date')
                    ->orWhere('target_closing_date', '>=', now()->toDateString());
            })
            ->with(['department:id,name']);

        if ($request->filled('company_code')) {
            $query->where('company_code', $request->company_code);
        }

        if ($request->filled('department_id')) {
            $query->where('department_id', $request->department_id);
        }

        if ($request->filled('employment_type')) {
            $query->where('employment_type', $request->employment_type);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhere('designation', 'like', "%{$search}%");
            });
        }

        $jobs = $query->orderByDesc('posted_at')->orderByDesc('id')
            ->paginate($request->per_page ?? 20)
            ->through(fn (JobRequisition $job) => $this->publicSafeJob($job));

        return response()->json(['status' => true, 'data' => $jobs]);
    }

    public function show(Request $request, $slug)
    {
        $query = JobRequisition::query()
            ->where('status', 'published')
            ->with(['department:id,name']);

        if (is_numeric($slug)) {
            $job = $query->where('id', $slug)->first();
        } else {
            $job = $query->where('id', $slug)->orWhere('title', str_replace('-', ' ', $slug))->first();
        }

        if (! $job) {
            return response()->json(['status' => false, 'message' => 'Job listing not found or no longer active.'], 404);
        }

        return response()->json(['status' => true, 'data' => $this->publicSafeJob($job)]);
    }

    /**
     * The anonymous, unauthenticated public surface — deliberately narrow.
     * `JobRequisition` also carries `requested_by`/`approved_by`/
     * `department_manager_id`/`hiring_manager_id`/`director_id`/
     * `hr_manager_id`/`current_approval_cycle_id` (internal staff identity
     * and approval-chain data) and `indeed_job_id`/`published_to_indeed*`
     * (external channel bookkeeping) — none of that belongs on a public
     * response, and none of it is read by the Career Portal frontend.
     */
    private function publicSafeJob(JobRequisition $job): array
    {
        return [
            'id' => $job->id,
            'title' => $job->title,
            'designation' => $job->designation,
            'employment_type' => $job->employment_type,
            'min_experience' => $job->min_experience,
            'max_experience' => $job->max_experience,
            'description' => $job->description,
            'requirements' => $job->requirements,
            'company_code' => $job->company_code,
            'unit' => $job->unit,
            'target_closing_date' => $job->target_closing_date,
            'posted_at' => $job->posted_at,
            'department' => $job->department ? ['id' => $job->department->id, 'name' => $job->department->name] : null,
        ];
    }
}
