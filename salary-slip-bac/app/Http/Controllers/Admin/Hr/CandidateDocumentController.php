<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\CandidateDocument;
use Illuminate\Http\Request;

/**
 * Lightweight document storage scoped to a candidate — deliberately not the
 * full versioned/quarantine-scanned Document system used by the Appointment
 * flow (that one belongs to `users` rows; a Candidate is a separate table).
 * One current file per record, stored on the `public` disk the same way
 * employee photos already are.
 */
class CandidateDocumentController extends Controller
{
    public function index($candidateId)
    {
        $candidate = Candidate::find($candidateId);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $documents = CandidateDocument::with('uploadedBy')
            ->where('candidate_id', $candidateId)
            ->orderByDesc('id')
            ->get();

        return response()->json(['status' => true, 'data' => $documents]);
    }

    public function store(Request $request, $candidateId)
    {
        $candidate = Candidate::find($candidateId);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $data = $request->validate([
            'document_type' => 'required|string|max:100',
            'file' => 'required|file|max:10240',
            'notes' => 'nullable|string',
        ]);

        $path = $request->file('file')->store('candidate-documents', 'public');

        $document = CandidateDocument::create([
            'candidate_id' => $candidateId,
            'document_type' => $data['document_type'],
            'original_filename' => $request->file('file')->getClientOriginalName(),
            'file_path' => $path,
            'uploaded_by' => auth('api')->id(),
            'notes' => $data['notes'] ?? null,
        ]);

        return response()->json(['status' => true, 'message' => 'Document uploaded', 'data' => $document], 201);
    }

    public function destroy($id)
    {
        $document = CandidateDocument::find($id);
        if (!$document) {
            return response()->json(['status' => false, 'message' => 'Document not found'], 404);
        }

        \Illuminate\Support\Facades\Storage::disk('public')->delete($document->file_path);
        $document->delete();

        return response()->json(['status' => true, 'message' => 'Document deleted']);
    }
}
