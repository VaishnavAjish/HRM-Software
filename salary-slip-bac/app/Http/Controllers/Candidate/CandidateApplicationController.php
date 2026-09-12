<?php

namespace App\Http\Controllers\Candidate;

use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\JobRequisition;
use App\Services\Recruitment\AtsScoringService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class CandidateApplicationController extends Controller
{
    public function __construct(
        private readonly AtsScoringService $atsScoring,
    ) {
    }

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
            'from_stage' => null,
            'to_stage' => 'applied',
            'notes' => 'Applied via Public Job Portal',
            'created_at' => now(),
        ]);

        try {
            $this->atsScoring->score($candidate);
        } catch (\Throwable $e) {
            Log::warning('ats_scoring_failed', ['candidate_id' => $candidate->id, 'error' => $e->getMessage()]);
        }

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
            ->with([
                'requisition:id,title,company_code,unit,department_id',
                'requisition.department:id,name',
                'offers' => fn ($q) => $q->whereIn('status', ['released', 'approved', 'accepted', 'rejected']),
                'interviews' => fn ($q) => $q->whereIn('status', ['scheduled', 'rescheduled', 'completed']),
            ])
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
            ->with([
                'requisition:id,title,company_code,unit,department_id',
                'requisition.department:id,name',
                'stageHistory',
                'offers' => fn ($q) => $q->whereNotIn('status', ['withdrawn'])->orderByDesc('id'),
                'interviews' => fn ($q) => $q->orderBy('scheduled_at'),
                'communications' => fn ($q) => $q->where('status', '!=', 'failed')->orderByDesc('created_at'),
                'quizAttempts.quiz',
                'documents',
            ])
            ->first();

        if (! $candidate) {
            return response()->json(['status' => false, 'message' => 'Application not found'], 404);
        }

        $visibleOffers = $candidate->offers->map(fn ($o) => $this->candidateSafeOffer($o));
        $latestOffer = $visibleOffers->first();

        return response()->json(['status' => true, 'data' => [
            ...$this->candidateSafeApplication($candidate),
            'timeline' => $this->candidateSafeTimeline($candidate),
            'offers' => $visibleOffers,
            'latest_offer' => $latestOffer,
            'interviews' => $candidate->interviews->map(fn ($i) => $this->candidateSafeInterview($i)),
            'communications' => $candidate->communications->map(fn ($c) => $this->candidateSafeCommunication($c)),
            'assessments' => $candidate->quizAttempts->map(fn ($q) => $this->candidateSafeQuizAttempt($q)),
            'has_assessments' => $candidate->quizAttempts->isNotEmpty(),
            'onboarding_details' => $candidate->onboarding_details,
            'onboarding_status' => $candidate->onboarding_status ?? 'NOT_STARTED',
            'onboarding_initiated_at' => $candidate->onboarding_initiated_at?->toIso8601String(),
            'onboarding_completed_at' => $candidate->onboarding_completed_at?->toIso8601String(),
            // Onboarding only becomes visible to the candidate once HR has
            // actually clicked "Process" on the Onboarding > Employee page
            // (OnboardingController::processJourney sets onboarding_initiated_at).
            // Merely reaching an offer/onboarding-adjacent stage is not enough.
            'is_onboarding_available' => !empty($candidate->onboarding_initiated_at),
            'documents' => $candidate->documents->map(fn ($d) => [
                'id' => $d->id,
                'document_type' => $d->document_type,
                'original_filename' => $d->original_filename,
                'file_path' => $d->file_path,
                'file_url' => asset('storage/' . $d->file_path),
                'status' => $d->status,
                'review_notes' => $d->review_notes,
                'created_at' => $d->created_at?->toIso8601String(),
            ]),
        ]]);
    }

    public function respondOffer(Request $request, $id)
    {
        $account = $request->user();
        $candidate = Candidate::where('candidate_account_id', $account->id)
            ->where('id', $id)
            ->first();

        if (! $candidate) {
            return response()->json(['status' => false, 'message' => 'Application not found'], 404);
        }

        $data = $request->validate([
            'status' => 'required|in:accepted,rejected',
            'notes' => 'nullable|string|max:1000',
        ]);

        // Find active offer
        $offer = $candidate->offers()
            ->whereNotIn('status', ['withdrawn', 'rejected'])
            ->orderByDesc('id')
            ->first();

        if (! $offer) {
            $responded = $candidate->offers()->whereIn('status', ['accepted', 'rejected'])->latest()->first();
            if ($responded) {
                return response()->json([
                    'status' => false,
                    'message' => 'This offer has already been ' . $responded->status . '.',
                ], 422);
            }
            return response()->json(['status' => false, 'message' => 'No active offer found awaiting response.'], 404);
        }

        $isAccepted = $data['status'] === 'accepted';
        $offer->update([
            'status' => $data['status'],
            'responded_at' => now(),
            'notes' => !empty($data['notes'])
                ? ($offer->notes ? $offer->notes . "\nCandidate response: " . $data['notes'] : "Candidate response: " . $data['notes'])
                : $offer->notes,
        ]);

        $newStage = $isAccepted ? 'offer_accepted' : 'rejected';
        $candidate->update(['stage' => $newStage]);

        $candidate->stageHistory()->create([
            'from_stage' => $candidate->stage,
            'to_stage' => $newStage,
            'notes' => $isAccepted
                ? 'Offer accepted by candidate via Candidate Portal'
                : 'Offer declined by candidate via Candidate Portal' . (!empty($data['notes']) ? ': ' . $data['notes'] : ''),
            'created_at' => now(),
        ]);

        return response()->json([
            'status' => true,
            'message' => $isAccepted ? 'Congratulations! Offer accepted successfully.' : 'Offer response recorded.',
            'data' => [
                'offer' => $this->candidateSafeOffer($offer),
                'application_status' => self::STAGE_LABELS[$newStage] ?? 'Hired',
                'candidate_stage' => $newStage,
            ],
        ]);
    }

    public function getCommunications(Request $request, $id)
    {
        $account = $request->user();
        $candidate = Candidate::where('candidate_account_id', $account->id)
            ->where('id', $id)
            ->first();

        if (! $candidate) {
            return response()->json(['status' => false, 'message' => 'Application not found'], 404);
        }

        $comms = $candidate->communications()
            ->where('status', '!=', 'failed')
            ->orderByDesc('created_at')
            ->get()
            ->map(fn ($c) => $this->candidateSafeCommunication($c));

        return response()->json(['status' => true, 'data' => $comms]);
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

    private const STAGE_LABELS = [
        'applied' => 'Submitted',
        'screening' => 'Under Review',
        'shortlisted' => 'Under Review',
        'on_hold' => 'Under Review',
        'assessment' => 'Assessment',
        'interview' => 'Interview',
        'selected' => 'Offer',
        'offer_sent' => 'Offer',
        'offer_accepted' => 'Pending Onboarding',
        'onboarding' => 'Onboarding',
        'hired' => 'Hired',
        'rejected' => 'Closed',
    ];

    private function candidateSafeApplication(Candidate $candidate): array
    {
        $activeOffers = $candidate->relationLoaded('offers') ? $candidate->offers : collect();
        $pendingOffer = $activeOffers->first(fn ($o) => in_array($o->status, ['released', 'approved']));
        $acceptedOffer = $activeOffers->first(fn ($o) => $o->status === 'accepted');

        return [
            'id' => $candidate->id,
            'requisition_id' => $candidate->requisition_id,
            'job_title' => $candidate->requisition?->title ?? 'Position',
            'department_name' => $candidate->requisition?->department?->name ?? null,
            'company_code' => $candidate->company_code,
            'candidate_name' => $candidate->name,
            'candidate_email' => $candidate->email,
            'candidate_phone' => $candidate->phone,
            'skills' => $candidate->skills ?? [],
            'stage' => $candidate->stage,
            'status_label' => self::STAGE_LABELS[$candidate->stage] ?? 'Under Review',
            'applied_at' => $candidate->created_at?->toIso8601String(),
            'resume_name' => $candidate->resume_original_name,
            'experience_years' => $candidate->experience_years,
            'current_company' => $candidate->current_company,
            'current_designation' => $candidate->current_designation,
            'has_pending_offer' => (bool) $pendingOffer,
            'is_offer_accepted' => (bool) $acceptedOffer || $candidate->stage === 'offer_accepted',
            'pending_offer_id' => $pendingOffer?->id,
        ];
    }

    private function candidateSafeOffer($offer): array
    {
        return [
            'id' => $offer->id,
            'designation' => $offer->designation,
            'ctc_annual' => (float) $offer->ctc_annual,
            'ctc_formatted' => '₹' . number_format((float) $offer->ctc_annual, 0, '.', ','),
            'monthly_ctc_formatted' => '₹' . number_format((float) ($offer->ctc_annual / 12), 0, '.', ','),
            'salary_breakup' => $offer->salary_breakup ?? [],
            'joining_date' => $offer->joining_date ? (is_string($offer->joining_date) ? $offer->joining_date : $offer->joining_date->format('Y-m-d')) : null,
            'joining_date_formatted' => $offer->joining_date ? (is_string($offer->joining_date) ? date('d M Y', strtotime($offer->joining_date)) : $offer->joining_date->format('d M Y')) : null,
            'expiry_date' => $offer->expiry_date ? (is_string($offer->expiry_date) ? $offer->expiry_date : $offer->expiry_date->format('Y-m-d')) : null,
            'expiry_date_formatted' => $offer->expiry_date ? (is_string($offer->expiry_date) ? date('d M Y', strtotime($offer->expiry_date)) : $offer->expiry_date->format('d M Y')) : null,
            'status' => $offer->status,
            'notes' => $offer->notes,
            'released_at' => $offer->released_at?->toIso8601String(),
            'responded_at' => $offer->responded_at?->toIso8601String(),
        ];
    }

    private function candidateSafeInterview($interview): array
    {
        return [
            'id' => $interview->id,
            'round_name' => $interview->round_name,
            'scheduled_at' => $interview->scheduled_at?->toIso8601String(),
            'duration_minutes' => $interview->duration_minutes,
            'mode' => $interview->mode,
            'meeting_link' => $interview->meeting_link,
            'status' => $interview->status,
            'notes' => $interview->notes,
        ];
    }

    private function candidateSafeCommunication($communication): array
    {
        return [
            'id' => $communication->id,
            'type' => $communication->type,
            'subject' => $communication->subject ?: 'Message from Recruitment Team',
            'body' => $communication->body,
            'sent_at' => ($communication->sent_at ?? $communication->created_at)?->toIso8601String(),
            'status' => $communication->status,
        ];
    }

    /**
     * Candidate-safe progress timeline — real transitions from
     * `candidate_stage_history`, collapsed to the same public-facing labels
     * `candidateSafeApplication()` uses so a "screening -> shortlisted" move
     * (an internal distinction) doesn't appear as two identical "Under
     * Review" timeline entries. `notes`/`changed_by` are never exposed —
     * those carry recruiter commentary and internal ranking context.
     */
    private function candidateSafeTimeline(Candidate $candidate): array
    {
        $timeline = [];

        foreach ($candidate->stageHistory as $entry) {
            $label = self::STAGE_LABELS[$entry->to_stage] ?? null;
            if (! $label) {
                continue;
            }

            $last = end($timeline);
            if ($last && $last['status_label'] === $label) {
                continue;
            }

            $timeline[] = [
                'status_label' => $label,
                'occurred_at' => $entry->created_at->toIso8601String(),
            ];
        }

        return $timeline;
    }

    private const ONBOARDING_LOCKED_STATUSES = ['SUBMITTED', 'VERIFIED', 'COMPLETED'];

    // Mirrors SettingsController::DEFAULTS['hr.doc_types'] — used only if HR
    // has never saved a custom list in Settings > HR > Documents yet.
    private const DEFAULT_DOC_TYPES = [
        ['id' => 'aadhaar', 'name' => 'Aadhaar Card', 'mandatory' => true, 'allowed' => 'PDF, JPG, PNG', 'maxSize' => '5 MB'],
        ['id' => 'pan', 'name' => 'PAN Card', 'mandatory' => true, 'allowed' => 'PDF, JPG, PNG', 'maxSize' => '5 MB'],
        ['id' => 'passport', 'name' => 'Passport', 'mandatory' => false, 'allowed' => 'PDF', 'maxSize' => '10 MB'],
        ['id' => 'driving', 'name' => 'Driving License', 'mandatory' => false, 'allowed' => 'PDF, JPG', 'maxSize' => '5 MB'],
        ['id' => 'education', 'name' => 'Degree Certificates', 'mandatory' => true, 'allowed' => 'PDF', 'maxSize' => '10 MB'],
        ['id' => 'experience', 'name' => 'Relieving & Experience Letters', 'mandatory' => true, 'allowed' => 'PDF', 'maxSize' => '10 MB'],
    ];

    /** Raw HR doc-type rules (id/name/mandatory/allowed/maxSize), as configured
     *  in Settings > HR > Documents, falling back to DEFAULT_DOC_TYPES. */
    private function hrDocTypeRules(): array
    {
        $setting = \App\Models\Setting::where('group', 'hr')->where('key', 'hr.doc_types')->first();

        $docTypes = self::DEFAULT_DOC_TYPES;
        if ($setting && $setting->value) {
            $decoded = json_decode($setting->value, true);
            if (is_array($decoded)) {
                $docTypes = $decoded;
            }
        }

        return $docTypes;
    }

    /** Mirrors the admin UI's isDocMatchingRule() fuzzy matcher (DocumentsTab.jsx)
     *  so a document uploaded under an old/renamed type string still gets
     *  recognised as "the same slot" as the currently-configured rule name. */
    private function documentMatchesRule(string $documentType, array $rule): bool
    {
        $type = strtolower(trim($documentType));
        $name = strtolower(trim($rule['name'] ?? ''));
        $id = strtolower(trim($rule['id'] ?? ''));

        if ($type === '' || ($type !== $name && $type !== $id)) {
            if ($id === 'aadhaar' || str_contains($name, 'aadhaar')) {
                return str_contains($type, 'aadhaar') || str_contains($type, 'adhar');
            }
            if ($id === 'pan' || str_contains($name, 'pan')) {
                return str_contains($type, 'pan');
            }
            if ($id === 'passport' || str_contains($name, 'passport')) {
                return str_contains($type, 'passport');
            }
            if ($id === 'driving' || str_contains($name, 'driving')) {
                return str_contains($type, 'driving') || str_contains($type, 'license') || str_contains($type, 'dl');
            }
            if ($id === 'education' || str_contains($name, 'degree') || str_contains($name, 'education')) {
                return str_contains($type, 'degree') || str_contains($type, 'education') || str_contains($type, 'certificate') || str_contains($type, 'mark');
            }
            if ($id === 'experience' || str_contains($name, 'experience') || str_contains($name, 'relieving')) {
                return str_contains($type, 'experience') || str_contains($type, 'relieving') || str_contains($type, 'letter');
            }
            return false;
        }

        return true;
    }

    /**
     * The list of document types the candidate onboarding form should ask
     * for — sourced from Settings > HR > Documents (`hr.doc_types`) instead
     * of a hardcoded list, so what candidates are asked to upload always
     * matches what HR has actually configured.
     */
    public function onboardingDocumentTypes(Request $request)
    {
        $docTypes = $this->hrDocTypeRules();

        $docTypes = array_values(array_filter(array_map(function ($doc) {
            if (empty($doc['name'])) {
                return null;
            }
            return [
                'id' => $doc['id'] ?? \Illuminate\Support\Str::slug($doc['name']),
                'label' => $doc['name'],
                'type' => $doc['name'],
                'required' => (bool) ($doc['mandatory'] ?? false),
                'allowed' => $doc['allowed'] ?? 'PDF, JPG, PNG',
                'max_size' => $doc['maxSize'] ?? '5 MB',
            ];
        }, $docTypes)));

        return response()->json(['status' => true, 'data' => $docTypes]);
    }

    public function saveOnboarding(Request $request, $id)
    {
        $account = $request->user();
        $candidate = Candidate::where('candidate_account_id', $account->id)->where('id', $id)->first();
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Application not found'], 404);
        }

        if (in_array($candidate->onboarding_status, self::ONBOARDING_LOCKED_STATUSES, true)) {
            return response()->json([
                'status' => false,
                'message' => 'Your onboarding details have already been submitted and can no longer be edited. Please contact HR if a correction is needed.',
            ], 422);
        }

        $data = $request->validate([
            'first_name' => 'nullable|string|max:100|regex:/^[A-Za-z\s\.]*$/',
            'middle_name' => 'nullable|string|max:100|regex:/^[A-Za-z\s\.]*$/',
            'surname' => 'nullable|string|max:100|regex:/^[A-Za-z\s\.]*$/',
            'email' => 'nullable|email:filter|max:255',
            'mobile_number' => 'nullable|digits:10',
            'emp_whatsapp_no' => 'nullable|digits:10',
            'dob' => 'nullable|date|before:today',
            'birth_place' => 'nullable|string|max:150',
            'gender' => 'nullable|in:Male,Female,Other',
            'cast' => 'nullable|string|max:100',
            'marital_status' => 'nullable|in:Single,Married,Divorced,Widowed',
            'blood_group' => 'nullable|in:A+,A-,B+,B-,AB+,AB-,O+,O-',

            'same_as_present' => 'nullable|boolean',
            'present_address' => 'nullable|string|max:500',
            'present_village' => 'nullable|string|max:150',
            'present_taluka' => 'nullable|string|max:150',
            'present_district' => 'nullable|string|max:150',
            'present_state' => 'nullable|string|max:100',
            'present_pincode' => 'nullable|digits:6',

            'permanent_address' => 'nullable|string|max:500',
            'permanent_village' => 'nullable|string|max:150',
            'permanent_taluka' => 'nullable|string|max:150',
            'permanent_district' => 'nullable|string|max:150',
            'permanent_state' => 'nullable|string|max:100',
            'permanent_pincode' => 'nullable|digits:6',

            'bank_name' => 'nullable|string|max:150',
            'account_number' => 'nullable|digits_between:9,18',
            'ifsc_code' => 'nullable|regex:/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/',
            'branch_name' => 'nullable|string|max:150',

            'aadhaar_number' => 'nullable|digits:12',
            'pan_number' => 'nullable|regex:/^[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}$/',

            'emergency_name' => 'nullable|string|max:150',
            'emergency_relation' => 'nullable|string|max:100',
            'emergency_phone' => 'nullable|digits:10',
            'emergency_address' => 'nullable|string|max:500',

            'family_members' => 'nullable|array',
            'family_members.*.name' => 'nullable|string|max:150',
            'family_members.*.relation' => 'nullable|string|max:50',
            'family_members.*.dob' => 'nullable|date|before:today',
            'family_members.*.mobile' => 'nullable|digits:10',
            'family_members.*.occupation' => 'nullable|string|max:150',

            'is_submitted' => 'nullable|boolean',
        ], [
            'first_name.regex' => 'First name may only contain letters and spaces.',
            'middle_name.regex' => 'Middle name may only contain letters and spaces.',
            'surname.regex' => 'Surname may only contain letters and spaces.',
            'mobile_number.digits' => 'Mobile number must be exactly 10 digits.',
            'emp_whatsapp_no.digits' => 'WhatsApp number must be exactly 10 digits.',
            'dob.before' => 'Date of birth must be in the past.',
            'present_pincode.digits' => 'Pincode must be exactly 6 digits.',
            'permanent_pincode.digits' => 'Pincode must be exactly 6 digits.',
            'account_number.digits_between' => 'Account number must be between 9 and 18 digits.',
            'ifsc_code.regex' => 'Enter a valid IFSC code (e.g. HDFC0001234).',
            'aadhaar_number.digits' => 'Aadhaar number must be exactly 12 digits.',
            'pan_number.regex' => 'Enter a valid PAN number (e.g. ABCDE1234F).',
            'emergency_phone.digits' => 'Emergency contact number must be exactly 10 digits.',
        ]);

        $isSubmitted = (bool) ($data['is_submitted'] ?? false);

        if ($isSubmitted) {
            $missing = [];
            if (empty($data['first_name'])) $missing[] = 'First Name';
            if (empty($data['email'])) $missing[] = 'Email';
            if (empty($data['mobile_number'])) $missing[] = 'Mobile Number';
            if (empty($data['present_address'])) $missing[] = 'Present Address';
            if (empty($data['present_state'])) $missing[] = 'Present State';
            if (empty($data['present_pincode'])) $missing[] = 'Present Pincode';
            if (empty($data['bank_name'])) $missing[] = 'Bank Name';
            if (empty($data['account_number'])) $missing[] = 'Account Number';
            if (empty($data['ifsc_code'])) $missing[] = 'IFSC Code';
            if (empty($data['aadhaar_number'])) $missing[] = 'Aadhaar Number';
            if (empty($data['pan_number'])) $missing[] = 'PAN Number';

            if ($missing) {
                return response()->json([
                    'status' => false,
                    'message' => 'Please fill in the following mandatory fields before submitting: ' . implode(', ', $missing),
                ], 422);
            }
        }

        $data['ifsc_code'] = isset($data['ifsc_code']) ? strtoupper($data['ifsc_code']) : $data['ifsc_code'] ?? null;
        $data['pan_number'] = isset($data['pan_number']) ? strtoupper($data['pan_number']) : $data['pan_number'] ?? null;

        $candidate->update([
            'onboarding_details' => $data,
            'onboarding_status' => $isSubmitted ? 'SUBMITTED' : 'DRAFT',
            'onboarding_initiated_at' => $candidate->onboarding_initiated_at ?? now(),
            'onboarding_completed_at' => $isSubmitted ? now() : null,
        ]);

        $candidate->stageHistory()->create([
            'from_stage' => $candidate->stage,
            'to_stage' => $candidate->stage,
            'notes' => $isSubmitted
                ? 'Candidate submitted onboarding appointment details & information via Careers Portal'
                : 'Candidate saved onboarding draft via Careers Portal',
            'created_at' => now(),
        ]);

        return response()->json([
            'status' => true,
            'message' => $isSubmitted
                ? 'Onboarding appointment details submitted successfully!'
                : 'Onboarding draft saved successfully!',
            'data' => [
                'onboarding_details' => $candidate->onboarding_details,
                'onboarding_status' => $candidate->onboarding_status,
                'onboarding_completed_at' => $candidate->onboarding_completed_at?->toIso8601String(),
            ],
        ]);
    }

    public function uploadOnboardingDocument(Request $request, $id)
    {
        $account = $request->user();
        $candidate = Candidate::where('candidate_account_id', $account->id)->where('id', $id)->first();
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Application not found'], 404);
        }

        $data = $request->validate([
            'document_type' => 'required|string|max:100',
            'file' => 'required|file|max:10240|mimes:pdf,jpg,jpeg,png',
            'notes' => 'nullable|string',
        ]);

        // One row per document type — re-uploading (e.g. after HR rejects a
        // document) replaces whatever was there before instead of stacking
        // duplicate rows that the "which document is this?" UI can't tell apart.
        // Matched fuzzily (not just exact string equality) so a document
        // uploaded under an old/renamed type label is still recognised as
        // "the same slot" and gets superseded rather than duplicated.
        $matchingRule = collect($this->hrDocTypeRules())->first(fn ($rule) => $this->documentMatchesRule($data['document_type'], $rule));

        $existingDocs = \App\Models\CandidateDocument::where('candidate_id', $candidate->id)
            ->get()
            ->filter(fn ($d) => $d->document_type === $data['document_type'] || ($matchingRule && $this->documentMatchesRule($d->document_type, $matchingRule)));

        $existing = $existingDocs->first();

        $isLocked = in_array($candidate->onboarding_status, self::ONBOARDING_LOCKED_STATUSES, true);
        $isReplacingRejected = $existing && $existing->status === 'REJECTED';

        // Once onboarding is submitted the form is locked, EXCEPT a document
        // HR has rejected — the candidate must still be able to fix that one.
        if ($isLocked && !$isReplacingRejected) {
            return response()->json([
                'status' => false,
                'message' => 'Your onboarding details have already been submitted. Documents can no longer be changed.',
            ], 422);
        }

        $path = $request->file('file')->store('candidate-documents', 'public');

        if ($existing) {
            foreach ($existingDocs->skip(1) as $extra) {
                \Illuminate\Support\Facades\Storage::disk('public')->delete($extra->file_path);
                $extra->delete();
            }

            \Illuminate\Support\Facades\Storage::disk('public')->delete($existing->file_path);
            $existing->update([
                'document_type' => $data['document_type'],
                'original_filename' => $request->file('file')->getClientOriginalName(),
                'file_path' => $path,
                'status' => 'PENDING',
                'notes' => $data['notes'] ?? null,
                'review_notes' => null,
                'reviewed_by' => null,
                'reviewed_at' => null,
            ]);
            $doc = $existing->fresh();
        } else {
            $doc = \App\Models\CandidateDocument::create([
                'candidate_id' => $candidate->id,
                'document_type' => $data['document_type'],
                'original_filename' => $request->file('file')->getClientOriginalName(),
                'file_path' => $path,
                'status' => 'PENDING',
                'notes' => $data['notes'] ?? null,
            ]);
        }

        return response()->json([
            'status' => true,
            'message' => 'Document uploaded successfully',
            'data' => [
                'id' => $doc->id,
                'document_type' => $doc->document_type,
                'original_filename' => $doc->original_filename,
                'file_path' => $doc->file_path,
                'file_url' => asset('storage/' . $doc->file_path),
                'status' => $doc->status,
                'created_at' => $doc->created_at?->toIso8601String(),
            ],
        ], 201);
    }

    public function deleteOnboardingDocument(Request $request, $id, $docId)
    {
        $account = $request->user();
        $candidate = Candidate::where('candidate_account_id', $account->id)->where('id', $id)->first();
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Application not found'], 404);
        }

        $doc = \App\Models\CandidateDocument::where('candidate_id', $candidate->id)->where('id', $docId)->first();
        if (!$doc) {
            return response()->json(['status' => false, 'message' => 'Document not found'], 404);
        }

        $isLocked = in_array($candidate->onboarding_status, self::ONBOARDING_LOCKED_STATUSES, true);
        if ($isLocked && $doc->status !== 'REJECTED') {
            return response()->json([
                'status' => false,
                'message' => 'Your onboarding details have already been submitted. Documents can no longer be changed.',
            ], 422);
        }

        \Illuminate\Support\Facades\Storage::disk('public')->delete($doc->file_path);
        $doc->delete();

        return response()->json(['status' => true, 'message' => 'Document deleted']);
    }

    private function candidateSafeQuizAttempt($attempt): array
    {
        $quiz = $attempt->quiz;
        return [
            'id' => $attempt->id,
            'quiz_id' => $attempt->quiz_id,
            'title' => $quiz?->title ?? 'Technical / Skill Assessment',
            'description' => $quiz?->description,
            'duration_minutes' => $attempt->duration_minutes ?? $quiz?->duration_minutes ?? 30,
            'passing_score' => $quiz?->passing_score ?? 60,
            'total_questions' => $attempt->total_questions ?? count($quiz?->questions ?? []),
            'score' => $attempt->score,
            'correct_count' => $attempt->correct_count,
            'passed' => (bool) $attempt->passed,
            'status' => $attempt->status,
            'started_at' => $attempt->started_at?->toIso8601String(),
            'submitted_at' => $attempt->submitted_at?->toIso8601String(),
            'link_expires_at' => $attempt->link_expires_at?->toIso8601String(),
            'quiz_url' => url('/candidate-quiz/' . $attempt->access_token),
            'access_token' => $attempt->access_token,
        ];
    }

}
