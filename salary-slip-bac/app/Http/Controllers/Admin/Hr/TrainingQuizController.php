<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Models\TrainingQuiz;
use Illuminate\Http\Request;

class TrainingQuizController extends Controller
{
    use ScopesCompany;

    public function index(Request $request)
    {
        $query = TrainingQuiz::with(['requisition', 'creator']);
        $this->applyCompanyScope($query, $request);

        if ($request->search) {
            $query->where('title', 'like', '%' . $request->search . '%');
        }

        if ($request->requisition_id) {
            $query->where('requisition_id', $request->requisition_id);
        }

        $quizzes = $query->orderByDesc('id')->paginate($request->per_page ?? 25);

        return response()->json(['status' => true, 'data' => $quizzes]);
    }

    public function show($id)
    {
        $quiz = TrainingQuiz::with(['requisition', 'creator'])->find($id);
        if (!$quiz) {
            return response()->json(['status' => false, 'message' => 'Training quiz not found'], 404);
        }

        return response()->json(['status' => true, 'data' => $quiz]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'requisition_id' => 'nullable|exists:job_requisitions,id',
            'passing_score' => 'nullable|integer|min:0|max:100',
            'questions' => 'required|array',
            'questions.*.text' => 'required|string',
            'questions.*.options' => 'required|array|min:2',
            'questions.*.options.*' => 'required|string',
            'questions.*.correct_index' => 'required|integer|min:0',
        ]);

        $context = $this->defaultCompanyContext($request);
        $quiz = TrainingQuiz::create($data + [
            'company_code' => $context['company_code'],
            'unit' => $context['unit'],
            'created_by' => auth('api')->id(),
        ]);

        return response()->json(['status' => true, 'message' => 'Training quiz created', 'data' => $quiz], 201);
    }

    public function update(Request $request, $id)
    {
        $quiz = TrainingQuiz::find($id);
        if (!$quiz) {
            return response()->json(['status' => false, 'message' => 'Training quiz not found'], 404);
        }

        $data = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'requisition_id' => 'nullable|exists:job_requisitions,id',
            'passing_score' => 'nullable|integer|min:0|max:100',
            'questions' => 'sometimes|required|array',
            'questions.*.text' => 'required|string',
            'questions.*.options' => 'required|array|min:2',
            'questions.*.options.*' => 'required|string',
            'questions.*.correct_index' => 'required|integer|min:0',
        ]);

        $quiz->update($data);

        return response()->json(['status' => true, 'message' => 'Training quiz updated', 'data' => $quiz]);
    }

    public function destroy($id)
    {
        $quiz = TrainingQuiz::find($id);
        if (!$quiz) {
            return response()->json(['status' => false, 'message' => 'Training quiz not found'], 404);
        }

        $quiz->delete();

        return response()->json(['status' => true, 'message' => 'Training quiz deleted']);
    }
}
