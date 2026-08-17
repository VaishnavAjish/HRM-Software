<?php

namespace App\Http\Controllers\Candidate;

use App\Http\Controllers\Controller;
use App\Models\CandidateEducation;
use Illuminate\Http\Request;

class CandidateEducationController extends Controller
{
    public function index(Request $request)
    {
        return response()->json(['status' => true, 'data' => $request->user()->educations]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $education = $request->user()->educations()->create($data);

        return response()->json(['status' => true, 'message' => 'Education added', 'data' => $education], 201);
    }

    public function update(Request $request, $id)
    {
        $education = $this->loadOwned($request, $id);
        if (! $education) {
            return response()->json(['status' => false, 'message' => 'Education not found'], 404);
        }

        $education->update($this->validated($request));

        return response()->json(['status' => true, 'message' => 'Education updated', 'data' => $education]);
    }

    public function destroy(Request $request, $id)
    {
        $education = $this->loadOwned($request, $id);
        if (! $education) {
            return response()->json(['status' => false, 'message' => 'Education not found'], 404);
        }

        $education->delete();

        return response()->json(['status' => true, 'message' => 'Education removed']);
    }

    private function loadOwned(Request $request, $id): ?CandidateEducation
    {
        return CandidateEducation::where('candidate_account_id', $request->user()->id)->where('id', $id)->first();
    }

    private function validated(Request $request): array
    {
        $currentYear = (int) now()->format('Y');

        return $request->validate([
            'institution' => 'required|string|max:255',
            'degree' => 'required|string|max:255',
            'field_of_study' => 'nullable|string|max:255',
            'start_year' => 'required|integer|min:1950|max:' . ($currentYear + 1),
            'end_year' => 'nullable|integer|min:1950|max:' . ($currentYear + 10),
            'grade' => 'nullable|string|max:100',
            'description' => 'nullable|string|max:2000',
        ]);
    }
}
