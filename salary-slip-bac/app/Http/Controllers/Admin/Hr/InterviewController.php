<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Controller;
use App\Models\Interview;
use App\Models\InterviewFeedback;
use App\Models\InterviewPanelist;
use Illuminate\Http\Request;

class InterviewController extends Controller
{
    public function index(Request $request)
    {
        $query = Interview::with(['candidate', 'requisition', 'panelists.user', 'feedback']);

        if ($request->candidate_id) {
            $query->where('candidate_id', $request->candidate_id);
        }
        if ($request->status) {
            $query->whereIn('status', explode(',', $request->status));
        }
        if ($request->date) {
            $query->whereDate('scheduled_at', $request->date);
        }

        $interviews = $query->orderBy('scheduled_at')->paginate($request->per_page ?? 25);

        return response()->json(['status' => true, 'data' => $interviews]);
    }

    public function show($id)
    {
        $interview = Interview::with(['candidate', 'requisition', 'panelists.user', 'feedback.panelist'])->find($id);
        if (!$interview) {
            return response()->json(['status' => false, 'message' => 'Interview not found'], 404);
        }

        return response()->json(['status' => true, 'data' => $interview]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'candidate_id' => 'required|exists:candidates,id',
            'requisition_id' => 'nullable|exists:job_requisitions,id',
            'round_name' => 'required|string|max:100',
            'scheduled_at' => 'required|date',
            'duration_minutes' => 'nullable|integer|min:5',
            'mode' => 'nullable|in:onsite,video,phone',
            'meeting_link' => 'nullable|string|max:500',
            'notes' => 'nullable|string',
            'panelist_ids' => 'nullable|array',
            'panelist_ids.*' => 'exists:users,id',
            'lead_panelist_id' => 'nullable|exists:users,id',
        ]);

        $interview = Interview::create([
            'candidate_id' => $data['candidate_id'],
            'requisition_id' => $data['requisition_id'] ?? null,
            'round_name' => $data['round_name'],
            'scheduled_at' => $data['scheduled_at'],
            'duration_minutes' => $data['duration_minutes'] ?? 30,
            'mode' => $data['mode'] ?? 'video',
            'meeting_link' => $data['meeting_link'] ?? null,
            'status' => 'scheduled',
            'notes' => $data['notes'] ?? null,
            'created_by' => auth('api')->id(),
        ]);

        foreach ($data['panelist_ids'] ?? [] as $userId) {
            InterviewPanelist::create([
                'interview_id' => $interview->id,
                'user_id' => $userId,
                'is_lead' => $userId == ($data['lead_panelist_id'] ?? null),
            ]);
        }

        return response()->json(['status' => true, 'message' => 'Interview scheduled', 'data' => $interview->load('panelists.user')], 201);
    }

    public function update(Request $request, $id)
    {
        $interview = Interview::find($id);
        if (!$interview) {
            return response()->json(['status' => false, 'message' => 'Interview not found'], 404);
        }

        $data = $request->validate([
            'round_name' => 'sometimes|required|string|max:100',
            'scheduled_at' => 'sometimes|required|date',
            'duration_minutes' => 'nullable|integer|min:5',
            'mode' => 'nullable|in:onsite,video,phone',
            'meeting_link' => 'nullable|string|max:500',
            'status' => 'nullable|in:scheduled,completed,cancelled,rescheduled,no_show',
            'notes' => 'nullable|string',
        ]);

        $interview->update($data);

        return response()->json(['status' => true, 'message' => 'Interview updated', 'data' => $interview]);
    }

    public function reschedule(Request $request, $id)
    {
        $interview = Interview::find($id);
        if (!$interview) {
            return response()->json(['status' => false, 'message' => 'Interview not found'], 404);
        }

        $data = $request->validate(['scheduled_at' => 'required|date']);
        $interview->update(['scheduled_at' => $data['scheduled_at'], 'status' => 'rescheduled']);

        return response()->json(['status' => true, 'message' => 'Interview rescheduled', 'data' => $interview]);
    }

    public function destroy($id)
    {
        $interview = Interview::find($id);
        if (!$interview) {
            return response()->json(['status' => false, 'message' => 'Interview not found'], 404);
        }

        $interview->update(['status' => 'cancelled']);

        return response()->json(['status' => true, 'message' => 'Interview cancelled']);
    }

    public function feedback(Request $request, $id)
    {
        $interview = Interview::find($id);
        if (!$interview) {
            return response()->json(['status' => false, 'message' => 'Interview not found'], 404);
        }

        $data = $request->validate([
            'panelist_id' => 'nullable|exists:users,id',
            'rating' => 'required|integer|min:1|max:5',
            'recommendation' => 'required|in:strong_yes,yes,no,strong_no',
            'strengths' => 'nullable|string',
            'concerns' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        $panelistId = $data['panelist_id'] ?? auth('api')->id();

        $feedback = InterviewFeedback::updateOrCreate(
            ['interview_id' => $interview->id, 'panelist_id' => $panelistId],
            [
                'rating' => $data['rating'],
                'recommendation' => $data['recommendation'],
                'strengths' => $data['strengths'] ?? null,
                'concerns' => $data['concerns'] ?? null,
                'notes' => $data['notes'] ?? null,
                'submitted_at' => now(),
            ]
        );

        if ($interview->status === 'scheduled') {
            $interview->update(['status' => 'completed']);
        }

        return response()->json(['status' => true, 'message' => 'Feedback submitted', 'data' => $feedback]);
    }
}
