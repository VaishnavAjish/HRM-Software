<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\CandidateDocument;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Lightweight document storage scoped to a candidate — deliberately not the
 * full versioned/quarantine-scanned Document system used by the Appointment
 * flow (that one belongs to `users` rows; a Candidate is a separate table).
 * One current file per record, stored on the `public` disk the same way
 * employee photos already are.
 *
 * Every method here is company-scoped: candidate identity documents
 * (Aadhaar, PAN, passport, bank details) are exactly the kind of record
 * that must never cross a tenant boundary, so every lookup goes through
 * `candidateWithinActorScope()`/`documentWithinActorScope()` before any
 * read or write, matching the pattern the rest of the Hr\* controllers use.
 */
class CandidateDocumentController extends Controller
{
    use ScopesCompany;

    private const ALLOWED_MIMES = ['pdf', 'jpg', 'jpeg', 'png'];
    private const MAX_KB = 10240;

    public function index($candidateId)
    {
        $candidate = $this->loadScopedCandidate($candidateId);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $documents = CandidateDocument::with(['uploadedBy', 'reviewedBy'])
            ->where('candidate_id', $candidateId)
            ->orderByDesc('id')
            ->get();

        return response()->json(['status' => true, 'data' => $documents]);
    }

    public function store(Request $request, $candidateId)
    {
        $candidate = $this->loadScopedCandidate($candidateId);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $data = $request->validate([
            'document_type' => 'required|string|max:100',
            'file' => 'required|file|max:' . self::MAX_KB . '|mimes:' . implode(',', self::ALLOWED_MIMES),
            'notes' => 'nullable|string',
        ]);

        // The uploaded file's own name is never trusted as a storage path —
        // Storage::store() below generates a random hashed filename; the
        // client-supplied name is kept only as display metadata.
        $document = DB::transaction(function () use ($request, $candidateId, $data) {
            $path = $request->file('file')->store('candidate-documents', 'public');

            try {
                return CandidateDocument::create([
                    'candidate_id' => $candidateId,
                    'document_type' => $data['document_type'],
                    'original_filename' => $request->file('file')->getClientOriginalName(),
                    'file_path' => $path,
                    'status' => 'PENDING',
                    'uploaded_by' => auth('api')->id(),
                    'notes' => $data['notes'] ?? null,
                ]);
            } catch (\Throwable $e) {
                // The DB write failed after the file already landed on disk —
                // clean it up so it doesn't linger as an orphan with no record.
                Storage::disk('public')->delete($path);
                throw $e;
            }
        });

        AuditLogger::log($request, 'CANDIDATE_DOCUMENT_UPLOADED', 'CandidateDocument', null, [
            'id' => $document->id,
            'candidate_id' => $candidateId,
            'document_type' => $document->document_type,
        ]);

        return response()->json(['status' => true, 'message' => 'Document uploaded', 'data' => $document], 201);
    }

    /** Real verify/reject — replaces the fabricated-document review flow the
     *  Onboarding module used to run against auto-generated stub records. */
    public function review(Request $request, $id, $decision)
    {
        $document = $this->loadScopedDocument($id);
        if (!$document) {
            return response()->json(['status' => false, 'message' => 'Document not found'], 404);
        }
        if (!in_array($decision, ['approve', 'reject'], true)) {
            return response()->json(['status' => false, 'message' => 'Invalid decision'], 422);
        }

        $data = $request->validate(['remarks' => 'nullable|string']);
        $before = $document->only(['status', 'reviewed_by', 'review_notes']);

        $document->update([
            'status' => $decision === 'approve' ? 'VERIFIED' : 'REJECTED',
            'reviewed_by' => auth('api')->id(),
            'reviewed_at' => now(),
            'review_notes' => $data['remarks'] ?? null,
        ]);

        AuditLogger::log($request, 'CANDIDATE_DOCUMENT_REVIEWED', 'CandidateDocument', $before, [
            'status' => $document->status,
            'reviewed_by' => $document->reviewed_by,
            'review_notes' => $document->review_notes,
        ]);

        return response()->json(['status' => true, 'message' => 'Document ' . ($decision === 'approve' ? 'verified' : 'rejected'), 'data' => $document]);
    }

    public function destroy(Request $request, $id)
    {
        $document = $this->loadScopedDocument($id);
        if (!$document) {
            return response()->json(['status' => false, 'message' => 'Document not found'], 404);
        }

        $snapshot = $document->only(['id', 'candidate_id', 'document_type', 'file_path']);

        DB::transaction(function () use ($document) {
            // Delete the DB row first — if the file delete below throws, the
            // record is already gone rather than left pointing at a file we
            // then failed to remove (an orphaned file with no record beats an
            // orphaned record pointing at a file that may or may not exist).
            $document->delete();
            Storage::disk('public')->delete($document->file_path);
        });

        AuditLogger::log($request, 'CANDIDATE_DOCUMENT_DELETED', 'CandidateDocument', $snapshot, null);

        return response()->json(['status' => true, 'message' => 'Document deleted']);
    }

    private function loadScopedCandidate($candidateId): ?Candidate
    {
        $candidate = Candidate::find($candidateId);
        if (!$candidate || !$this->companyCodeWithinActorScope($candidate->company_code)) {
            return null;
        }

        return $candidate;
    }

    private function loadScopedDocument($id): ?CandidateDocument
    {
        $document = CandidateDocument::with('candidate')->find($id);
        if (!$document || !$document->candidate || !$this->companyCodeWithinActorScope($document->candidate->company_code)) {
            return null;
        }

        return $document;
    }
}
