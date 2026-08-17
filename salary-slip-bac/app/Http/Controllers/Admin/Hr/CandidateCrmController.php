<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Mail\CandidateMessageMail;
use App\Models\Candidate;
use App\Models\CandidateCommunication;
use App\Models\CandidateNote;
use App\Models\CandidateTag;
use App\Models\TalentPool;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Wave 4 — Candidate CRM: managed tags, the private recruiter note trail,
 * named talent pools, and an outbound communication log.
 *
 * All reads and writes are admin endpoints gated on `permission:hr.candidate.*`
 * middleware, so candidate-facing tokens can never reach them — recruiter notes
 * and tags stay private to the recruiting side (never returned by any public
 * candidate portal endpoint).
 */
class CandidateCrmController extends Controller
{
    use ScopesCompany;

    /* ---------------------------------------------------------------- tags */

    public function tags(Request $request)
    {
        $query = CandidateTag::query();
        $this->applyCompanyScope($query, $request);
        if ($request->search) {
            $query->where('name', 'like', '%' . $request->search . '%');
        }

        return response()->json(['status' => true, 'data' => $query->orderBy('name')->get()]);
    }

    public function storeTag(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:100',
            'color' => 'nullable|string|max:20',
        ]);

        $context = $this->defaultCompanyContext($request);
        $tag = CandidateTag::create([
            'name' => $data['name'],
            'color' => $data['color'] ?? '#6366f1',
            'company_code' => $context['company_code'],
            'unit' => $context['unit'],
            'created_by' => auth('api')->id(),
        ]);

        return response()->json(['status' => true, 'message' => 'Tag created', 'data' => $tag], 201);
    }

    public function updateTag(Request $request, $id)
    {
        $tag = CandidateTag::find($id);
        if (!$tag || !$this->companyCodeWithinActorScope($tag->company_code)) {
            return response()->json(['status' => false, 'message' => 'Tag not found'], 404);
        }

        $data = $request->validate([
            'name' => 'sometimes|required|string|max:100',
            'color' => 'nullable|string|max:20',
        ]);

        $tag->update($data);

        return response()->json(['status' => true, 'message' => 'Tag updated', 'data' => $tag]);
    }

    public function destroyTag($id)
    {
        $tag = CandidateTag::find($id);
        if (!$tag || !$this->companyCodeWithinActorScope($tag->company_code)) {
            return response()->json(['status' => false, 'message' => 'Tag not found'], 404);
        }

        $tag->delete();

        return response()->json(['status' => true, 'message' => 'Tag deleted']);
    }

    public function candidateTags($candidateId)
    {
        $candidate = $this->loadScopedCandidate($candidateId);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        return response()->json(['status' => true, 'data' => $candidate->tags()->orderBy('name')->get()]);
    }

    public function syncCandidateTags(Request $request, $candidateId)
    {
        $candidate = $this->loadScopedCandidate($candidateId);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $data = $request->validate([
            'tag_ids' => 'nullable|array',
            'tag_ids.*' => 'integer',
        ]);

        $allowed = $this->scopedTagIds($request);
        $tagIds = collect($data['tag_ids'] ?? [])
            ->map(fn ($id) => (int) $id)
            ->intersect($allowed)
            ->values();

        $candidate->tags()->sync($tagIds);

        return response()->json([
            'status' => true,
            'message' => 'Tags updated',
            'data' => $candidate->tags()->get(),
        ]);
    }

    /* --------------------------------------------------------------- notes */

    public function notes($candidateId)
    {
        $candidate = $this->loadScopedCandidate($candidateId);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $notes = CandidateNote::with('createdBy')
            ->where('candidate_id', $candidateId)
            ->orderByDesc('created_at')
            ->get();

        return response()->json(['status' => true, 'data' => $notes]);
    }

    public function storeNote(Request $request, $candidateId)
    {
        $candidate = $this->loadScopedCandidate($candidateId);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $data = $request->validate(['note' => 'required|string|max:5000']);

        $note = CandidateNote::create([
            'candidate_id' => $candidateId,
            'note' => $data['note'],
            'created_by' => auth('api')->id(),
        ]);

        $note->load('createdBy');

        return response()->json(['status' => true, 'message' => 'Note added', 'data' => $note], 201);
    }

    public function destroyNote($noteId)
    {
        $note = CandidateNote::find($noteId);
        if (!$note || !$this->candidateWithinActorScope($note->candidate)) {
            return response()->json(['status' => false, 'message' => 'Note not found'], 404);
        }

        $note->delete();

        return response()->json(['status' => true, 'message' => 'Note deleted']);
    }

    /* ---------------------------------------------------------- talent pools */

    public function pools(Request $request)
    {
        $query = TalentPool::withCount('candidates');
        $this->applyCompanyScope($query, $request);
        if ($request->search) {
            $query->where('name', 'like', '%' . $request->search . '%');
        }

        return response()->json(['status' => true, 'data' => $query->orderBy('name')->get()]);
    }

    public function storePool(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:150',
            'description' => 'nullable|string|max:2000',
            'color' => 'nullable|string|max:20',
        ]);

        $context = $this->defaultCompanyContext($request);
        $pool = TalentPool::create([
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'color' => $data['color'] ?? '#0ea5e9',
            'company_code' => $context['company_code'],
            'unit' => $context['unit'],
            'created_by' => auth('api')->id(),
        ]);

        return response()->json(['status' => true, 'message' => 'Talent pool created', 'data' => $pool], 201);
    }

    public function updatePool(Request $request, $id)
    {
        $pool = TalentPool::find($id);
        if (!$pool || !$this->companyCodeWithinActorScope($pool->company_code)) {
            return response()->json(['status' => false, 'message' => 'Talent pool not found'], 404);
        }

        $data = $request->validate([
            'name' => 'sometimes|required|string|max:150',
            'description' => 'nullable|string|max:2000',
            'color' => 'nullable|string|max:20',
        ]);

        $pool->update($data);

        return response()->json(['status' => true, 'message' => 'Talent pool updated', 'data' => $pool]);
    }

    public function destroyPool($id)
    {
        $pool = TalentPool::find($id);
        if (!$pool || !$this->companyCodeWithinActorScope($pool->company_code)) {
            return response()->json(['status' => false, 'message' => 'Talent pool not found'], 404);
        }

        $pool->delete();

        return response()->json(['status' => true, 'message' => 'Talent pool deleted']);
    }

    public function poolCandidates(Request $request, $poolId)
    {
        $pool = TalentPool::with('candidates')->find($poolId);
        if (!$pool || !$this->companyCodeWithinActorScope($pool->company_code)) {
            return response()->json(['status' => false, 'message' => 'Talent pool not found'], 404);
        }

        $candidates = $pool->candidates()
            ->with(['requisition', 'recruiter'])
            ->orderByDesc('pivot_created_at')
            ->get();

        return response()->json(['status' => true, 'data' => $candidates]);
    }

    public function syncCandidatePools(Request $request, $candidateId)
    {
        $candidate = $this->loadScopedCandidate($candidateId);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $data = $request->validate([
            'pool_ids' => 'nullable|array',
            'pool_ids.*' => 'integer',
        ]);

        $allowed = $this->scopedPoolIds($request);
        $poolIds = collect($data['pool_ids'] ?? [])
            ->map(fn ($id) => (int) $id)
            ->intersect($allowed)
            ->values();

        $candidate->talentPools()->sync($poolIds);

        return response()->json([
            'status' => true,
            'message' => 'Talent pool membership updated',
            'data' => $candidate->talentPools()->get(),
        ]);
    }

    public function addCandidateToPool(Request $request, $candidateId, $poolId)
    {
        $candidate = $this->loadScopedCandidate($candidateId);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $poolIds = $this->scopedPoolIds($request);
        if (!in_array((int) $poolId, $poolIds, true)) {
            return response()->json(['status' => false, 'message' => 'Talent pool not found'], 404);
        }

        $candidate->talentPools()->syncWithoutDetaching([(int) $poolId]);

        return response()->json(['status' => true, 'message' => 'Candidate added to pool']);
    }

    public function removeCandidateFromPool(Request $request, $candidateId, $poolId)
    {
        $candidate = $this->loadScopedCandidate($candidateId);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $candidate->talentPools()->detach((int) $poolId);

        return response()->json(['status' => true, 'message' => 'Candidate removed from pool']);
    }

    /* ------------------------------------------------------ communications */

    public function communications($candidateId)
    {
        $candidate = $this->loadScopedCandidate($candidateId);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $communications = CandidateCommunication::with('sentBy')
            ->where('candidate_id', $candidateId)
            ->orderByDesc('created_at')
            ->get();

        return response()->json(['status' => true, 'data' => $communications]);
    }

    public function storeCommunication(Request $request, $candidateId)
    {
        $candidate = $this->loadScopedCandidate($candidateId);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $data = $request->validate([
            'type' => 'required|in:email,sms,phone,other',
            'subject' => 'nullable|string|max:255',
            'body' => 'required|string|max:10000',
        ]);

        $communication = CandidateCommunication::create([
            'candidate_id' => $candidateId,
            'type' => $data['type'],
            'direction' => 'outbound',
            'subject' => $data['subject'] ?? null,
            'body' => $data['body'],
            'status' => CandidateCommunication::STATUS_QUEUED,
            'sent_by' => auth('api')->id(),
        ]);

        $this->deliverCommunication($candidate, $communication);

        $communication->load('sentBy');

        return response()->json(['status' => true, 'message' => 'Message logged', 'data' => $communication], 201);
    }

    /** Best-effort — mirrors the InterviewController::sendScheduleMail pattern. */
    private function deliverCommunication(Candidate $candidate, CandidateCommunication $communication): void
    {
        if ($communication->type !== CandidateCommunication::TYPE_EMAIL) {
            $communication->update(['status' => CandidateCommunication::STATUS_SENT, 'sent_at' => now()]);
            return;
        }

        $recipient = $candidate->email;
        if (!$recipient) {
            $communication->update([
                'status' => CandidateCommunication::STATUS_FAILED,
                'error_message' => 'No candidate email address on file',
            ]);
            return;
        }

        try {
            Mail::to($recipient)->send(new CandidateMessageMail(
                candidateName: $candidate->name ?: 'there',
                messageSubject: $communication->subject ?? 'A message from our recruitment team',
                body: $communication->body,
            ));
            $communication->update([
                'status' => CandidateCommunication::STATUS_SENT,
                'sent_at' => now(),
                'error_message' => null,
            ]);
        } catch (\Throwable $e) {
            Log::error('candidate_message_mail_failed', [
                'communication_id' => $communication->id,
                'candidate_id' => $candidate->id,
                'error' => $e->getMessage(),
            ]);
            $communication->update([
                'status' => CandidateCommunication::STATUS_FAILED,
                'error_message' => substr($e->getMessage(), 0, 2000),
            ]);
        }
    }

    /* -------------------------------------------------------------- helpers */

    private function loadScopedCandidate($candidateId): ?Candidate
    {
        $candidate = Candidate::find($candidateId);
        if (!$candidate || !$this->candidateWithinActorScope($candidate)) {
            return null;
        }

        return $candidate;
    }

    private function scopedTagIds(Request $request): array
    {
        $query = CandidateTag::query();
        $this->applyCompanyScope($query, $request);

        return $query->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    private function scopedPoolIds(Request $request): array
    {
        $query = TalentPool::query();
        $this->applyCompanyScope($query, $request);

        return $query->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    protected function candidateWithinActorScope(Candidate $candidate): bool
    {
        return $this->companyCodeWithinActorScope($candidate->company_code);
    }
}