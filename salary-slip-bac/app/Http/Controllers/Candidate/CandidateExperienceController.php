<?php

namespace App\Http\Controllers\Candidate;

use App\Http\Controllers\Controller;
use App\Models\CandidateExperience;
use Illuminate\Http\Request;

class CandidateExperienceController extends Controller
{
    public function index(Request $request)
    {
        return response()->json(['status' => true, 'data' => $request->user()->experiences]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $experience = $request->user()->experiences()->create($data);

        return response()->json(['status' => true, 'message' => 'Experience added', 'data' => $experience], 201);
    }

    public function update(Request $request, $id)
    {
        $experience = $this->loadOwned($request, $id);
        if (! $experience) {
            return response()->json(['status' => false, 'message' => 'Experience not found'], 404);
        }

        $experience->update($this->validated($request, $experience));

        return response()->json(['status' => true, 'message' => 'Experience updated', 'data' => $experience]);
    }

    public function destroy(Request $request, $id)
    {
        $experience = $this->loadOwned($request, $id);
        if (! $experience) {
            return response()->json(['status' => false, 'message' => 'Experience not found'], 404);
        }

        $experience->delete();

        return response()->json(['status' => true, 'message' => 'Experience removed']);
    }

    private function loadOwned(Request $request, $id): ?CandidateExperience
    {
        return CandidateExperience::where('candidate_account_id', $request->user()->id)->where('id', $id)->first();
    }

    private function validated(Request $request, ?CandidateExperience $existing = null): array
    {
        $isCurrent = $request->boolean('is_current');

        $data = $request->validate([
            'company' => 'required|string|max:255',
            'designation' => 'required|string|max:255',
            'location' => 'nullable|string|max:255',
            'start_date' => 'required|date',
            'end_date' => $isCurrent ? 'nullable' : 'required|date|after_or_equal:start_date',
            'is_current' => 'boolean',
            'description' => 'nullable|string|max:2000',
        ]);

        $data['is_current'] = $isCurrent;
        if ($isCurrent) {
            $data['end_date'] = null;
        }

        return $data;
    }
}
