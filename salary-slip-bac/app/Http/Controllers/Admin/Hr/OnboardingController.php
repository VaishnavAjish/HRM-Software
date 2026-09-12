<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\CandidateDocument;
use App\Models\Offer;
use App\Models\User;
use App\Services\Documents\DocumentService;
use App\Services\Provisioning\UserProvisioningService;
use App\Support\DocumentType;
use App\Support\ProvisioningContext;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class OnboardingController extends Controller
{
    use ScopesCompany;

    public function __construct(
        private readonly UserProvisioningService $provisioning,
    ) {
    }

    public function dashboard(Request $request)
    {
        $candidatesQuery = Candidate::whereIn('stage', ['onboarding', 'hired', 'offer_accepted']);
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
                        'email' => $c->email ?? '',
                        'code' => 'CND' . str_pad($o->candidate_id, 5, '0', STR_PAD_LEFT),
                        'role' => $o->designation,
                        'dept' => $c?->requisition?->department?->name ?? 'General',
                        'progress' => $progress,
                        'status' => $progress === 100 && $docs->count() > 0 ? 'PROBATION' : ($progress > 0 ? 'IN_PROGRESS' : 'PRE_BOARDING'),
                    ];
                })->values();
            }
        }

        $byJob = [];
        foreach ($candidates as $c) {
            $offer = $offers->firstWhere('candidate_id', $c->id);
            $docs = $documents->where('candidate_id', $c->id);
            $progress = $docs->count() ? (int) round($docs->where('status', 'VERIFIED')->count() / $docs->count() * 100) : 0;
            $job = $c->requisition?->designation ?? $offer?->designation ?? 'Unassigned role';

            $byJob[$job][] = [
                'id' => $c->id,
                'name' => $c->name ?? 'Candidate',
                'email' => $c->email ?? '',
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

        $joinersSeries = [];
        $verifiedSeries = [];
        for ($i = 6; $i >= 0; $i--) {
            $day = $today->copy()->subDays($i);
            $joinersSeries[] = $offers->filter(fn ($o) => $o->responded_at && Carbon::parse($o->responded_at)->isSameDay($day))->count();
            $verifiedSeries[] = $documents->filter(fn ($d) => $d->reviewed_at && Carbon::parse($d->reviewed_at)->isSameDay($day) && $d->status === 'VERIFIED')->count();
        }

        $activity = [];
        foreach ($documents->whereIn('status', ['VERIFIED', 'REJECTED'])->sortByDesc('reviewed_at')->take(5) as $doc) {
            $candidateName = $candidates->firstWhere('id', $doc->candidate_id)->name ?? 'Candidate';
            $activity[] = [
                'tone' => $doc->status === 'VERIFIED' ? 'ok' : 'bad',
                'title' => $doc->document_type . ' ' . ($doc->status === 'VERIFIED' ? 'Verified' : 'Rejected'),
                'description' => $candidateName . ($doc->reviewedBy?->name ? ' • by ' . $doc->reviewedBy->name : ''),
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
        $query = Candidate::whereIn('stage', ['onboarding', 'hired', 'offer_accepted'])->with(['requisition.department']);
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
                'email' => $c->email ?? '',
                'code' => 'CND' . str_pad($c->id, 5, '0', STR_PAD_LEFT),
                'role' => $c->requisition->designation ?? $offer?->designation ?? 'New Hire',
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
            'email' => $candidate->email ?? '',
            'code' => 'CND' . str_pad($candidate->id, 5, '0', STR_PAD_LEFT),
            'role' => $candidate->requisition->designation ?? $offer?->designation ?? 'New Hire',
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

    public function sendReminderEmail(Request $request, $id)
    {
        $candidate = Candidate::find($id);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate journey not found.'], 404);
        }

        $email = $request->input('email') ?: $candidate->email;
        if (!$email) {
            return response()->json(['status' => false, 'message' => 'No email address found for this user.'], 422);
        }

        $subject = $request->input('subject', 'Reminder: Upload Remaining Onboarding Documents');
        $body = $request->input('body', "Dear {$candidate->name},\n\nWe noticed that your onboarding document submission is currently pending. Please log in to the employee portal and upload your remaining mandatory documents (Aadhaar Card, PAN Card, Degree Certificates, Relieving & Experience Letters) at your earliest convenience to complete your onboarding verification.\n\nBest regards,\nHR Team - NISS HRMS");

        try {
            Mail::raw($body, function ($message) use ($email, $subject) {
                $message->to($email)->subject($subject);
            });

            return response()->json([
                'status' => true,
                'message' => "Reminder email sent successfully to {$email}.",
                'email' => $email,
            ]);
        } catch (\Exception $e) {
            Log::error("Failed to send onboarding reminder email: " . $e->getMessage());
            return response()->json([
                'status' => false,
                'message' => "Failed to send email to {$email}: " . $e->getMessage(),
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function documents(Request $request)
    {
        $candidatesQuery = Candidate::whereIn('stage', ['onboarding', 'hired', 'offer_accepted']);
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

    public function reviewDocument(Request $request, $id, $decision)
    {
        return app(CandidateDocumentController::class)->review($request, $id, $decision);
    }

    public function processJourney(Request $request, $id)
    {
        $candidate = Candidate::find($id);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $fromStage = $candidate->stage;
        $candidate->update([
            'onboarding_status' => 'IN_PROGRESS',
            'onboarding_initiated_at' => now(),
            'stage' => 'onboarding',
        ]);

        $candidate->stageHistory()->create([
            'from_stage' => $fromStage,
            'to_stage' => 'onboarding',
            'notes' => 'Onboarding process initiated by HR. Candidate invited to submit appointment & onboarding details.',
            'changed_by' => auth('api')->id(),
            'created_at' => now(),
        ]);

        return response()->json([
            'status' => true,
            'message' => 'Onboarding process started successfully. Candidate can now submit onboarding details in the Careers portal.',
            'data' => $candidate->fresh(['requisition.department']),
        ]);
    }

    /**
     * Rejects a candidate's onboarding submission by wiping it outright —
     * their previously-entered form details and every uploaded document are
     * deleted (files included), so a re-submission via the Careers Portal
     * always starts from a clean slate instead of merging with stale data.
     */
    public function rejectOnboarding(Request $request, $id)
    {
        $candidate = Candidate::find($id);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $reason = $request->input('reason', 'Onboarding details/documents rejected by HR for correction.');

        \Illuminate\Support\Facades\DB::transaction(function () use ($candidate, $reason) {
            $documents = CandidateDocument::where('candidate_id', $candidate->id)->get();
            foreach ($documents as $doc) {
                \Illuminate\Support\Facades\Storage::disk('public')->delete($doc->file_path);
                $doc->delete();
            }

            // Set status to REJECTED so the Careers Portal's ONBOARDING_LOCKED_STATUSES
            // check passes and unlocks the form; clearing onboarding_details means
            // the candidate re-submits from scratch. onboarding_initiated_at is left
            // untouched — it only records that HR has processed this candidate, and
            // must stay set so the onboarding tab doesn't disappear from the portal
            // or make the candidate look "unprocessed" again on the Employees tab.
            $candidate->update([
                'onboarding_status' => 'REJECTED',
                'onboarding_details' => null,
                'onboarding_completed_at' => null,
            ]);

            $candidate->stageHistory()->create([
                'from_stage' => $candidate->stage,
                'to_stage' => $candidate->stage,
                'notes' => 'Onboarding rejected by HR: ' . $reason . ' (previous details & documents deleted; candidate must re-submit from the Careers Portal).',
                'changed_by' => auth('api')->id(),
                'created_at' => now(),
            ]);
        });

        return response()->json([
            'status' => true,
            'message' => 'Onboarding rejected. Previous details and documents were deleted — candidate must re-submit from scratch via the Careers Portal.',
            'data' => $candidate->fresh(),
        ]);
    }

    /** Mirrors CandidateApplicationController::documentMatchesRule() and the
     *  admin UI's isDocMatchingRule() (DocumentsTab.jsx) so a document
     *  verified under an old/renamed type string is still recognised as
     *  satisfying the currently-configured mandatory rule — keeping this
     *  gate consistent with what the Approve button's own compliance
     *  check (which uses the same fuzzy matching) shows HR on screen. */
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

    // Mirrors CandidateApplicationController::DEFAULT_DOC_TYPES — the
    // fallback used only if HR has never saved a custom list in
    // Settings > HR > Documents yet.
    private const DEFAULT_DOC_TYPES = [
        ['id' => 'aadhaar', 'name' => 'Aadhaar Card', 'mandatory' => true],
        ['id' => 'pan', 'name' => 'PAN Card', 'mandatory' => true],
        ['id' => 'passport', 'name' => 'Passport', 'mandatory' => false],
        ['id' => 'driving', 'name' => 'Driving License', 'mandatory' => false],
        ['id' => 'education', 'name' => 'Degree Certificates', 'mandatory' => true],
        ['id' => 'experience', 'name' => 'Relieving & Experience Letters', 'mandatory' => true],
    ];

    /**
     * Final HR sign-off on a candidate's whole onboarding submission
     * (details + documents) — the counterpart to rejectOnboarding(). Locks
     * the Careers Portal form/documents (onboarding_status lands in
     * ONBOARDING_LOCKED_STATUSES on the candidate side) once every
     * mandatory document configured in Settings > HR > Documents is VERIFIED.
     *
     * Beyond locking the form, this is also the hand-off point into the
     * SAME Trial Form -> Appointment -> Employee pipeline every other new
     * hire goes through: it creates a real Appointment (`users`, type =
     * 'appointment') from the candidate's onboarding details, carries their
     * verified documents over, and marks the candidate 'hired' — so from
     * here on, converting them into a full employee is the exact same
     * "assign an emp_code" step HR already uses on the Appointments page
     * for anyone else, not a separate Careers Portal-only process.
     *
     * Idempotent: re-approving an already-converted candidate (checked via
     * converted_appointment_user_id) re-affirms VERIFIED/hired without
     * minting a second Appointment row.
     */
    public function approveOnboarding(Request $request, $id)
    {
        $candidate = Candidate::find($id);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $setting = \App\Models\Setting::where('group', 'hr')->where('key', 'hr.doc_types')->first();
        $docTypes = self::DEFAULT_DOC_TYPES;
        if ($setting && $setting->value) {
            $decoded = json_decode($setting->value, true);
            if (is_array($decoded)) {
                $docTypes = $decoded;
            }
        }

        $mandatoryRules = collect($docTypes)->filter(fn ($d) => !empty($d['mandatory']))->values();
        $verifiedTypes = CandidateDocument::where('candidate_id', $candidate->id)
            ->where('status', 'VERIFIED')
            ->pluck('document_type');

        $missing = $mandatoryRules
            ->filter(fn ($rule) => !$verifiedTypes->contains(fn ($type) => $this->documentMatchesRule((string) $type, $rule)))
            ->pluck('name')
            ->filter()
            ->values();

        if ($missing->isNotEmpty()) {
            return response()->json([
                'status' => false,
                'message' => 'Cannot approve — the following mandatory documents are not yet verified: ' . $missing->implode(', '),
            ], 422);
        }

        $actor = auth('api')->user();
        $hasTrackingColumn = Schema::hasColumn('candidates', 'converted_appointment_user_id');

        Log::info('approveOnboarding: starting', [
            'candidateId' => $candidate->id,
            'actorId' => $actor?->id,
            'hasTrackingColumn' => $hasTrackingColumn,
        ]);

        try {
            $appointment = null;

            DB::transaction(function () use ($candidate, $actor, $hasTrackingColumn, &$appointment) {
                $candidate->update([
                    'onboarding_status' => 'VERIFIED',
                    'onboarding_completed_at' => now(),
                ]);

                $alreadyConverted = $hasTrackingColumn && $candidate->converted_appointment_user_id;

                if (!$alreadyConverted) {
                    $appointment = $this->createAppointmentFromCandidate($candidate, $actor);

                    if ($hasTrackingColumn) {
                        $candidate->converted_appointment_user_id = $appointment->id;
                    }

                    $this->copyCandidateDocumentsToAppointment($candidate, $appointment, $actor);
                }

                $fromStage = $candidate->stage;
                $candidate->stage = 'hired';
                $candidate->save();

                $candidate->stageHistory()->create([
                    'from_stage' => $fromStage,
                    'to_stage' => 'hired',
                    'notes' => $appointment
                        ? 'Onboarding approved by HR — candidate details & documents verified, sent to Appointment #' . $appointment->id . ', and marked Hired.'
                        : 'Onboarding approved by HR — already sent to Appointment earlier, re-affirmed Hired.',
                    'changed_by' => $actor?->id,
                    'created_at' => now(),
                ]);
            });

            Log::info('approveOnboarding: success', [
                'candidateId' => $candidate->id,
                'appointmentUserId' => $appointment?->id,
            ]);
        } catch (\Throwable $e) {
            Log::error('approveOnboarding: failed', [
                'candidateId' => $candidate->id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'status' => false,
                'message' => 'Could not send this candidate to Appointment: ' . $e->getMessage(),
            ], 500);
        }

        if (!$hasTrackingColumn) {
            Log::warning('approveOnboarding: candidates.converted_appointment_user_id column is missing — run pending migrations on the live server. Re-clicking Approve for the same candidate will create a duplicate Appointment until this is fixed.');
        }

        return response()->json([
            'status' => true,
            'message' => 'Candidate approved, sent to Appointment, and marked Hired.',
            'data' => $candidate->fresh(),
        ]);
    }

    /**
     * Carries a candidate's already-verified onboarding documents into an
     * Appointment's own document list — used by the "Onboarding Appointment"
     * tab (TimelineTab.jsx -> ViewAppointmentModal) once HR saves the
     * appointment form, so the candidate's Careers Portal documents show up
     * directly in that appointment's Upload Documents section instead of a
     * separate read-only panel. Idempotent (see the idempotency key passed
     * into DocumentService::upload in copyCandidateDocumentsToAppointment
     * below) — safe to call again for an appointment that already has them.
     */
    public function copyDocumentsToAppointment(Request $request, $id)
    {
        $candidate = Candidate::find($id);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $appointment = User::find($request->input('appointment_id'));
        if (!$appointment) {
            return response()->json(['status' => false, 'message' => 'Appointment not found'], 404);
        }

        $this->copyCandidateDocumentsToAppointment($candidate, $appointment, auth('api')->user());

        return response()->json(['status' => true, 'message' => 'Documents copied to the appointment.']);
    }

    /**
     * Builds an Appointment (`users` row, type='appointment') from a
     * candidate's Careers Portal onboarding submission — the same schema
     * UserController::appointmentStore()'s APPOINTMENT_FIELDS expects, so
     * the resulting row flows through the existing Appointments review UI
     * and "assign emp_code" employee conversion completely unchanged.
     *
     * Fields with no home on Appointment (permanent address, address
     * state/pincode, bank branch name) are folded into the free-text
     * `address` line rather than silently dropped where there's no better
     * place for them.
     */
    private function createAppointmentFromCandidate(Candidate $candidate, ?User $actor): User
    {
        $d = is_array($candidate->onboarding_details) ? $candidate->onboarding_details : [];

        $fullName = trim(implode(' ', array_filter([
            $d['first_name'] ?? null,
            $d['middle_name'] ?? null,
            $d['surname'] ?? null,
        ])));

        $addressLine = trim(implode(', ', array_filter([
            $d['present_address'] ?? null,
            $d['present_state'] ?? null,
            $d['present_pincode'] ?? null,
        ])));

        $gender = strtoupper((string) ($d['gender'] ?? ''));
        $gender = in_array($gender, ['MALE', 'FEMALE', 'OTHER'], true) ? $gender : null;

        $familyMembers = is_array($d['family_members'] ?? null) ? $d['family_members'] : [];

        $data = array_filter([
            'name' => $fullName ?: $candidate->name,
            'email' => $d['email'] ?? $candidate->email,
            'mobile_number' => $d['mobile_number'] ?? $candidate->phone,
            'emp_whatsapp_no' => $d['emp_whatsapp_no'] ?? null,
            'dob' => $d['dob'] ?? null,
            'birth_place' => $d['birth_place'] ?? null,
            'gender' => $gender,
            'cast' => $d['cast'] ?? null,
            'marital_status' => $d['marital_status'] ?? null,
            'blood_group' => $d['blood_group'] ?? null,
            'address' => $addressLine ?: null,
            'village' => $d['present_village'] ?? null,
            'taluka' => $d['present_taluka'] ?? null,
            'district' => $d['present_district'] ?? null,
            'bank_name' => $d['bank_name'] ?? null,
            'bank_account_no' => $d['account_number'] ?? null,
            'bank_ifsc_code' => $d['ifsc_code'] ?? null,
            'aadhar_card_no' => $d['aadhaar_number'] ?? null,
            'pan_card_no' => $d['pan_number'] ?? null,
            'reference_name' => $d['emergency_name'] ?? null,
            'reference_mobile_no' => $d['emergency_phone'] ?? null,
            'members' => !empty($familyMembers) ? json_encode($familyMembers) : null,
            'department' => $candidate->requisition?->department?->name,
            'designation' => $candidate->requisition?->designation ?? $candidate->current_designation,
            'company_code' => $candidate->company_code ?? $actor?->company_code,
            'unit' => $candidate->unit ?? $actor?->unit,
        ], fn ($value) => $value !== null && $value !== '');

        // users.email is unique — a candidate who already exists in `users`
        // under this email (an earlier trial/appointment row, most likely)
        // must not block hiring; the appointment simply starts with no
        // email rather than failing the whole approval over a collision.
        if (!empty($data['email']) && User::where('email', $data['email'])->exists()) {
            unset($data['email']);
        }

        $data['password'] = bin2hex(random_bytes(16));
        $data['role'] = 3;
        $data['type'] = 'appointment';
        $data['status'] = 0;
        $data['is_deleted'] = '0';

        $appointment = User::create($data);

        $this->provisioning->provisionEmployee($appointment, ProvisioningContext::APPOINTMENT, $actor);

        return $appointment;
    }

    /**
     * Carries every VERIFIED candidate document over to the new Appointment
     * through the same versioned document system (DocumentService) the
     * Appointments page's own document uploads use — so they show up there
     * exactly like any document uploaded directly against an appointment,
     * not just the two (Aadhaar/PAN) that happen to have a flat `users`
     * column. One document failing to copy (a bad file, an unrecognised
     * type) is logged and skipped rather than aborting the whole approval —
     * HR already verified these on the Careers Portal side; losing the
     * hand-off copy is a recoverable inconvenience, not a reason to block
     * hiring.
     */
    private function copyCandidateDocumentsToAppointment(Candidate $candidate, User $appointment, ?User $actor): void
    {
        $documents = CandidateDocument::where('candidate_id', $candidate->id)
            ->where('status', 'VERIFIED')
            ->get();

        foreach ($documents as $doc) {
            if (!$doc->file_path || !Storage::disk('public')->exists($doc->file_path)) {
                continue;
            }

            try {
                $absolutePath = Storage::disk('public')->path($doc->file_path);
                $mime = Storage::disk('public')->mimeType($doc->file_path) ?: 'application/octet-stream';
                $uploadedFile = new UploadedFile(
                    $absolutePath,
                    $doc->original_filename ?: basename($doc->file_path),
                    $mime,
                    null,
                    true
                );

                DocumentService::make()->upload(
                    $uploadedFile,
                    $appointment,
                    DocumentType::normalise($doc->document_type),
                    $actor?->id,
                    'candidate-doc-carryover-' . $doc->id . '-appointment-' . $appointment->id,
                    'Carried over from Careers Portal onboarding: ' . $doc->document_type
                );
            } catch (\Throwable $e) {
                Log::warning('Could not carry a candidate document over to its Appointment', [
                    'candidateId' => $candidate->id,
                    'appointmentUserId' => $appointment->id,
                    'candidateDocumentId' => $doc->id,
                    'documentType' => $doc->document_type,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }
}
