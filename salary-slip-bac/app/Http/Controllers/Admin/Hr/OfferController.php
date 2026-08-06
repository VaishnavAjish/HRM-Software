<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Controller;
use App\Mail\OfferMail;
use App\Models\Offer;
use App\Models\OfferRevision;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class OfferController extends Controller
{
    public function index(Request $request)
    {
        $query = Offer::with(['candidate', 'requisition']);

        if ($request->candidate_id) {
            $query->where('candidate_id', $request->candidate_id);
        }
        if ($request->status) {
            $query->whereIn('status', explode(',', $request->status));
        }

        $offers = $query->orderByDesc('id')->paginate($request->per_page ?? 25);

        return response()->json(['status' => true, 'data' => $offers]);
    }

    public function show($id)
    {
        $offer = Offer::with(['candidate', 'requisition', 'revisions'])->find($id);
        if (!$offer) {
            return response()->json(['status' => false, 'message' => 'Offer not found'], 404);
        }

        return response()->json(['status' => true, 'data' => $offer]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'candidate_id' => 'required|exists:candidates,id',
            'requisition_id' => 'nullable|exists:job_requisitions,id',
            'designation' => 'required|string|max:255',
            'ctc_annual' => 'required|numeric|min:0',
            'salary_breakup' => 'nullable|array',
            'joining_date' => 'nullable|date',
            'expiry_date' => 'nullable|date',
            'notes' => 'nullable|string',
        ]);

        $offer = Offer::create($data + [
            'status' => 'draft',
            'version' => 1,
            'created_by' => auth('api')->id(),
        ]);

        OfferRevision::create([
            'offer_id' => $offer->id,
            'version' => 1,
            'snapshot' => $offer->toArray(),
            'changed_by' => auth('api')->id(),
            'reason' => 'Initial offer created',
            'created_at' => now(),
        ]);

        $offer->candidate()->update(['stage' => 'offer_sent']);

        return response()->json(['status' => true, 'message' => 'Offer created', 'data' => $offer], 201);
    }

    public function update(Request $request, $id)
    {
        $offer = Offer::find($id);
        if (!$offer) {
            return response()->json(['status' => false, 'message' => 'Offer not found'], 404);
        }

        $data = $request->validate([
            'designation' => 'sometimes|required|string|max:255',
            'ctc_annual' => 'sometimes|required|numeric|min:0',
            'salary_breakup' => 'nullable|array',
            'joining_date' => 'nullable|date',
            'expiry_date' => 'nullable|date',
            'notes' => 'nullable|string',
            'reason' => 'nullable|string',
        ]);

        $reason = $data['reason'] ?? 'Offer revised';
        unset($data['reason']);

        $offer->update($data + ['version' => $offer->version + 1, 'status' => 'draft']);

        OfferRevision::create([
            'offer_id' => $offer->id,
            'version' => $offer->version,
            'snapshot' => $offer->toArray(),
            'changed_by' => auth('api')->id(),
            'reason' => $reason,
            'created_at' => now(),
        ]);

        return response()->json(['status' => true, 'message' => 'Offer updated', 'data' => $offer]);
    }

    public function approve($id)
    {
        $offer = Offer::find($id);
        if (!$offer) {
            return response()->json(['status' => false, 'message' => 'Offer not found'], 404);
        }

        $offer->update(['status' => 'approved', 'approved_by' => auth('api')->id(), 'approved_at' => now()]);

        return response()->json(['status' => true, 'message' => 'Offer approved', 'data' => $offer]);
    }

    public function release($id)
    {
        $offer = Offer::find($id);
        if (!$offer) {
            return response()->json(['status' => false, 'message' => 'Offer not found'], 404);
        }
        if ($offer->status !== 'approved') {
            return response()->json(['status' => false, 'message' => 'Only approved offers can be released'], 422);
        }

        $offer->update(['status' => 'released', 'released_by' => auth('api')->id(), 'released_at' => now()]);

        $this->sendOfferMail($offer->load('candidate'));

        return response()->json(['status' => true, 'message' => 'Offer released', 'data' => $offer]);
    }

    /** Best-effort — see the identical comment on QuizAttemptController::sendAssessmentInvite. */
    private function sendOfferMail(Offer $offer): void
    {
        $candidate = $offer->candidate;
        if (!$candidate || !$candidate->email) {
            return;
        }

        try {
            Mail::to($candidate->email)->send(new OfferMail(
                candidateName: $candidate->name,
                designation: $offer->designation,
                ctcFormatted: '₹' . number_format((float) $offer->ctc_annual, 0) . ' per annum',
                joiningDateFormatted: $offer->joining_date?->format('d M Y'),
                expiryDateFormatted: $offer->expiry_date?->format('d M Y'),
            ));
        } catch (\Throwable $e) {
            Log::error('offer_mail_failed', ['offer_id' => $offer->id, 'error' => $e->getMessage()]);
        }
    }

    public function respond(Request $request, $id)
    {
        $offer = Offer::find($id);
        if (!$offer) {
            return response()->json(['status' => false, 'message' => 'Offer not found'], 404);
        }

        $data = $request->validate(['status' => 'required|in:accepted,rejected']);
        $offer->update(['status' => $data['status'], 'responded_at' => now()]);
        $offer->candidate()->update(['stage' => $data['status'] === 'accepted' ? 'offer_accepted' : 'rejected']);

        return response()->json(['status' => true, 'message' => 'Offer response recorded', 'data' => $offer]);
    }

    public function destroy($id)
    {
        $offer = Offer::find($id);
        if (!$offer) {
            return response()->json(['status' => false, 'message' => 'Offer not found'], 404);
        }

        $offer->update(['status' => 'withdrawn']);

        return response()->json(['status' => true, 'message' => 'Offer withdrawn']);
    }
}
