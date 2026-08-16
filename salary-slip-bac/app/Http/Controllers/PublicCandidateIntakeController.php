<?php

namespace App\Http\Controllers;

use App\Models\Candidate;
use App\Models\CandidateStageHistory;
use App\Models\JobRequisition;
use App\Services\Recruitment\AtsScoringService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Receives a Google Forms submission (relayed by the Apps Script attached to
 * the shared job-application form) and turns it straight into a Candidate,
 * skipping the manual "add candidate one by one" step this whole endpoint
 * exists to remove. Candidates are not users and have no login, so — like
 * PublicQuizController — this sits outside the jwt.auth group entirely, and
 * a shared token in the URL (config('services.candidate_intake.token')) is
 * the only credential. Treat that token like a password: anyone who has it
 * can create candidate rows.
 */
class PublicCandidateIntakeController extends Controller
{
    private const MAX_RESUME_BYTES = 10 * 1024 * 1024; // 10 MB, matches the Form's file-upload limit
    private const ALLOWED_RESUME_EXTENSIONS = ['pdf', 'doc', 'docx'];

    public function __construct(
        private readonly AtsScoringService $atsScoring,
    ) {
    }

    public function store(Request $request, string $token)
    {
        $expected = config('services.candidate_intake.token');
        if (!$expected || !hash_equals($expected, $token)) {
            return response()->json(['status' => false, 'message' => 'Invalid intake token'], 403);
        }

        // Temporary diagnostic logging while tracing the Apps Script -> here
        // payload-loss bug. Logs exactly what Laravel received, independent
        // of what the Apps Script's own logs claim it sent — remove once the
        // intake is confirmed stable.
        $rawBody = $request->getContent();
        $jsonAll = null;
        $jsonError = null;
        try {
            // Symfony's Request::json() decodes the raw body regardless of
            // Content-Type — if the Apps Script sent a non-stringified
            // payload (the classic UrlFetchApp mistake: contentType set to
            // 'application/json' but `payload` left as a JS object, which
            // Apps Script then silently form-encodes instead), this throws,
            // and that thrown message IS the root cause.
            $jsonAll = $request->json()->all();
        } catch (\Throwable $e) {
            $jsonError = $e->getMessage();
        }

        Log::info('candidate_intake.raw_request', [
            'content_type' => $request->header('Content-Type'),
            'content_length' => $request->header('Content-Length'),
            // Truncated: the resume's base64 payload alone can be several MB
            // and isn't relevant to a field-mapping bug — this is enough to
            // see whether the body is even valid JSON and which top-level
            // keys/values arrived.
            'raw_body_preview' => Str::limit($rawBody, 2000),
            'request_all' => collect($request->all())->except(['resume_base64'])->all(),
            'json_all' => $jsonAll ? collect($jsonAll)->except(['resume_base64'])->all() : null,
            'json_decode_error' => $jsonError,
        ]);

        $data = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:30',
            'position' => 'nullable|string|max:255',
            'experience_years' => 'nullable|numeric|min:0|max:60',
            'current_company' => 'nullable|string|max:255',
            'current_designation' => 'nullable|string|max:255',
            'skills' => 'nullable|string|max:2000',
            'resume_base64' => 'nullable|string',
            'resume_filename' => 'nullable|string|max:255',
        ]);

        $requisition = null;
        if (!empty($data['position'])) {
            $requisition = JobRequisition::whereRaw('LOWER(title) = ?', [Str::lower(trim($data['position']))])->first();
        }

        [$resumePath, $resumeOriginalName] = $this->storeResume($data['resume_base64'] ?? null, $data['resume_filename'] ?? null);

        $skills = !empty($data['skills'])
            ? array_values(array_filter(array_map('trim', explode(',', $data['skills']))))
            : null;

        $notes = null;
        if (!empty($data['position']) && !$requisition) {
            $notes = "Unmatched position from Google Form: \"{$data['position']}\" — link to the correct requisition manually.";
        }

        $candidate = Candidate::create([
            'requisition_id' => $requisition?->id,
            'name' => $data['name'],
            'email' => $data['email'] ?? null,
            'phone' => $data['phone'] ?? null,
            'experience_years' => $data['experience_years'] ?? null,
            'current_company' => $data['current_company'] ?? null,
            'current_designation' => $data['current_designation'] ?? null,
            'skills' => $skills,
            'resume_path' => $resumePath,
            'resume_original_name' => $resumeOriginalName,
            'source' => 'google_form',
            'stage' => 'applied',
            'company_code' => $requisition?->company_code,
            'unit' => $requisition?->unit,
            'notes' => $notes,
        ]);

        CandidateStageHistory::create([
            'candidate_id' => $candidate->id,
            'from_stage' => null,
            'to_stage' => 'applied',
            'changed_by' => null,
            'notes' => 'Submitted via Google Form',
            'created_at' => now(),
        ]);

        if ($requisition) {
            try {
                $this->atsScoring->score($candidate);
            } catch (\Throwable $e) {
                Log::warning('ats_scoring_failed', ['candidate_id' => $candidate->id, 'error' => $e->getMessage()]);
            }
        }

        return response()->json(['status' => true, 'message' => 'Candidate created', 'data' => ['id' => $candidate->id]], 201);
    }

    /** @return array{0: ?string, 1: ?string} [stored path, original filename] */
    private function storeResume(?string $base64, ?string $originalName): array
    {
        if (!$base64) {
            return [null, null];
        }

        $binary = base64_decode($base64, true);
        if ($binary === false) {
            throw ValidationException::withMessages(['resume_base64' => 'Resume file could not be decoded']);
        }
        if (strlen($binary) > self::MAX_RESUME_BYTES) {
            throw ValidationException::withMessages(['resume_base64' => 'Resume file exceeds the 10 MB limit']);
        }

        $extension = Str::lower(pathinfo($originalName ?? '', PATHINFO_EXTENSION)) ?: 'pdf';
        if (!in_array($extension, self::ALLOWED_RESUME_EXTENSIONS, true)) {
            throw ValidationException::withMessages(['resume_base64' => 'Resume must be a PDF, DOC, or DOCX file']);
        }

        $path = 'candidate-documents/' . Str::uuid() . '.' . $extension;
        Storage::disk('public')->put($path, $binary);

        return [$path, $originalName];
    }
}
