<?php

namespace App\Http\Controllers\Candidate;

use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\JobRequisition;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class CandidateApplicationController extends Controller
{
    public function apply(Request $request, $slug)
    {
        $account = $request->user();

        if (! $account->email_verified_at) {
            return response()->json([
                'status' => false,
                'message' => 'Please verify your email address before applying for jobs.',
            ], 403);
        }

        $query = JobRequisition::query()->where('status', 'published');
        if (is_numeric($slug)) {
            $requisition = $query->where('id', $slug)->first();
        } else {
            $requisition = $query->where('id', $slug)->orWhere('title', str_replace('-', ' ', $slug))->first();
        }

        if (! $requisition) {
            return response()->json(['status' => false, 'message' => 'Job listing not found or is no longer accepting applications.'], 404);
        }

        if ($requisition->target_closing_date && $requisition->target_closing_date->isPast()) {
            return response()->json(['status' => false, 'message' => 'The closing date for this job listing has passed.'], 422);
        }

        // Prevent duplicate applications
        $existing = Candidate::where('candidate_account_id', $account->id)
            ->where('requisition_id', $requisition->id)
            ->first();

        if ($existing) {
            return response()->json(['status' => false, 'message' => 'You have already applied for this job requisition.'], 422);
        }

        $data = $request->validate([
            'phone' => 'nullable|string|max:30',
            'experience_years' => 'nullable|numeric|min:0',
            'current_company' => 'nullable|string|max:255',
            'current_designation' => 'nullable|string|max:255',
            'skills' => 'nullable|array',
            'resume' => 'required|file|mimes:pdf,doc,docx|max:10240', // 10MB
        ]);

        $resumePath = null;
        $resumeOriginalName = null;
        if ($request->hasFile('resume')) {
            $file = $request->file('resume');
            $resumeOriginalName = $file->getClientOriginalName();
            $resumePath = $file->store('resumes/candidates', 'local');
        }

        $candidate = Candidate::create([
            'requisition_id' => $requisition->id,
            'candidate_account_id' => $account->id,
            'name' => $account->name,
            'email' => $account->email,
            'phone' => $data['phone'] ?? $account->phone,
            'experience_years' => $data['experience_years'] ?? $account->experience_years ?? 0,
            'current_company' => $data['current_company'] ?? $account->current_company,
            'current_designation' => $data['current_designation'] ?? $account->current_designation,
            'skills' => $data['skills'] ?? $account->skills ?? [],
            'resume_path' => $resumePath,
            'resume_original_name' => $resumeOriginalName,
            'source' => 'job_portal',
            'stage' => 'applied',
            'company_code' => $requisition->company_code,
            'unit' => $requisition->unit,
        ]);

        // Create initial stage history entry
        $candidate->stageHistory()->create([
            'stage' => 'applied',
            'notes' => 'Applied via Public Job Portal',
        ]);

        return response()->json([
            'status' => true,
            'message' => 'Your application has been submitted successfully!',
            'data' => $this->candidateSafeApplication($candidate->fresh(['requisition:id,title,company_code,unit'])),
        ], 201);
    }

    public function index(Request $request)
    {
        $account = $request->user();
        $applications = Candidate::where('candidate_account_id', $account->id)
            ->with(['requisition:id,title,company_code,unit,department_id', 'requisition.department:id,name'])
            ->orderByDesc('id')
            ->get()
            ->map(fn (Candidate $candidate) => $this->candidateSafeApplication($candidate));

        return response()->json(['status' => true, 'data' => $applications]);
    }

    public function show(Request $request, $id)
    {
        $account = $request->user();
        $candidate = Candidate::where('candidate_account_id', $account->id)
            ->where('id', $id)
            ->with(['requisition:id,title,company_code,unit,department_id', 'requisition.department:id,name'])
            ->first();

        if (! $candidate) {
            return response()->json(['status' => false, 'message' => 'Application not found'], 404);
        }

        return response()->json(['status' => true, 'data' => $this->candidateSafeApplication($candidate)]);
    }

    public function downloadResume(Request $request, $id)
    {
        $account = $request->user();
        $candidate = Candidate::where('candidate_account_id', $account->id)
            ->where('id', $id)
            ->first();

        if (! $candidate || ! $candidate->resume_path || ! Storage::disk('local')->exists($candidate->resume_path)) {
            return response()->json(['status' => false, 'message' => 'Resume file not found'], 404);
        }

        return Storage::disk('local')->download($candidate->resume_path, $candidate->resume_original_name ?? 'resume.pdf');
    }

    private function candidateSafeApplication(Candidate $candidate): array
    {
        $stageMap = [
            'applied' => 'Submitted',
            'screening' => 'Under Review',
            'shortlisted' => 'Under Review',
            'on_hold' => 'Under Review',
            'assessment' => 'Assessment',
            'interview' => 'Interview',
            'selected' => 'Offer',
            'offer_sent' => 'Offer',
            'offer_accepted' => 'Hired',
            'rejected' => 'Closed',
        ];

        return [
            'id' => $candidate->id,
            'requisition_id' => $candidate->requisition_id,
            'job_title' => $candidate->requisition?->title ?? 'Position',
            'department_name' => $candidate->requisition?->department?->name ?? null,
            'company_code' => $candidate->company_code,
            'status_label' => $stageMap[$candidate->stage] ?? 'Under Review',
            'applied_at' => $candidate->created_at->toIso8601String(),
            'resume_name' => $candidate->resume_original_name,
            'experience_years' => $candidate->experience_years,
            'current_company' => $candidate->current_company,
            'current_designation' => $candidate->current_designation,
        ];
    }
}
