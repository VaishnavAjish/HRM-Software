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
        $query = TrainingQuiz::with(['requisition', 'creator', 'interview.candidate'])
            ->withCount('attempts');
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
            'interview_id' => 'nullable|exists:interviews,id',
            'passing_score' => 'nullable|numeric|min:0',
            'duration_minutes' => 'nullable|integer|min:1|max:480',
            'max_violations' => 'nullable|integer|min:1|max:50',
            'is_active' => 'nullable|boolean',
            'questions' => 'required|array|min:1',
            'questions.*.text' => 'required|string',
            'questions.*.type' => 'nullable|in:mcq,msq',
            'questions.*.marks' => 'nullable|numeric|min:0.1',
            'questions.*.options' => 'required|array|min:2',
            'questions.*.options.*' => 'required|string',
            'questions.*.option_marks' => 'nullable|array',
            'questions.*.option_marks.*' => 'nullable|numeric|min:0',
            'questions.*.correct_index' => 'nullable|integer|min:0',
            'questions.*.correct_indices' => 'nullable|array',
            'questions.*.correct_indices.*' => 'integer|min:0',
        ]);

        // Normalize questions
        if (isset($data['questions']) && is_array($data['questions'])) {
            $data['questions'] = array_map(function ($q) {
                $type = $q['type'] ?? 'mcq';
                $marks = isset($q['marks']) && is_numeric($q['marks']) ? max(0.1, (float) $q['marks']) : 1.0;
                $options = array_values($q['options'] ?? []);
                
                $correctIndices = [];
                if ($type === 'msq') {
                    if (isset($q['correct_indices']) && is_array($q['correct_indices'])) {
                        $correctIndices = array_values(array_unique(array_map('intval', $q['correct_indices'])));
                    } elseif (isset($q['correct_index'])) {
                        $correctIndices = [(int) $q['correct_index']];
                    }
                } else {
                    $correctIndex = isset($q['correct_index']) ? (int) $q['correct_index'] : (isset($q['correct_indices'][0]) ? (int) $q['correct_indices'][0] : 0);
                    $correctIndices = [$correctIndex];
                }

                // Option marks allocation
                $optionMarks = [];
                if (isset($q['option_marks']) && is_array($q['option_marks'])) {
                    $optionMarks = array_map(function ($m) {
                        return max(0.0, (float) $m);
                    }, array_values($q['option_marks']));
                    while (count($optionMarks) < count($options)) {
                        $optionMarks[] = 0.0;
                    }
                    $optionMarks = array_slice($optionMarks, 0, count($options));

                    // Check total option marks constraint
                    $optSum = array_sum($optionMarks);
                    if ($optSum > $marks + 0.01 && $optSum > 0) {
                        // Normalize proportionally to question marks limit if exceeded
                        $scale = $marks / $optSum;
                        $optionMarks = array_map(fn($m) => round($m * $scale, 2), $optionMarks);
                    }
                } else {
                    $optionMarks = array_fill(0, count($options), 0.0);
                    if ($type === 'msq') {
                        $numCorrect = count($correctIndices);
                        $perOpt = $numCorrect > 0 ? round($marks / $numCorrect, 2) : 0.0;
                        foreach ($correctIndices as $ci) {
                            if (isset($optionMarks[$ci])) {
                                $optionMarks[$ci] = $perOpt;
                            }
                        }
                    } else {
                        $ci = $correctIndices[0] ?? 0;
                        if (isset($optionMarks[$ci])) {
                            $optionMarks[$ci] = $marks;
                        }
                    }
                }

                return [
                    'text' => trim($q['text'] ?? ''),
                    'type' => $type,
                    'marks' => $marks,
                    'options' => $options,
                    'option_marks' => $optionMarks,
                    'correct_index' => $correctIndices[0] ?? 0,
                    'correct_indices' => $correctIndices,
                ];
            }, $data['questions']);
        }

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
            'interview_id' => 'nullable|exists:interviews,id',
            'passing_score' => 'nullable|numeric|min:0',
            'duration_minutes' => 'nullable|integer|min:1|max:480',
            'max_violations' => 'nullable|integer|min:1|max:50',
            'is_active' => 'nullable|boolean',
            'questions' => 'sometimes|required|array|min:1',
            'questions.*.text' => 'required|string',
            'questions.*.type' => 'nullable|in:mcq,msq',
            'questions.*.marks' => 'nullable|numeric|min:0.1',
            'questions.*.options' => 'required|array|min:2',
            'questions.*.options.*' => 'required|string',
            'questions.*.option_marks' => 'nullable|array',
            'questions.*.option_marks.*' => 'nullable|numeric|min:0',
            'questions.*.correct_index' => 'nullable|integer|min:0',
            'questions.*.correct_indices' => 'nullable|array',
            'questions.*.correct_indices.*' => 'integer|min:0',
        ]);

        // Normalize questions if provided
        if (isset($data['questions']) && is_array($data['questions'])) {
            $data['questions'] = array_map(function ($q) {
                $type = $q['type'] ?? 'mcq';
                $marks = isset($q['marks']) && is_numeric($q['marks']) ? max(0.1, (float) $q['marks']) : 1.0;
                $options = array_values($q['options'] ?? []);
                
                $correctIndices = [];
                if ($type === 'msq') {
                    if (isset($q['correct_indices']) && is_array($q['correct_indices'])) {
                        $correctIndices = array_values(array_unique(array_map('intval', $q['correct_indices'])));
                    } elseif (isset($q['correct_index'])) {
                        $correctIndices = [(int) $q['correct_index']];
                    }
                } else {
                    $correctIndex = isset($q['correct_index']) ? (int) $q['correct_index'] : (isset($q['correct_indices'][0]) ? (int) $q['correct_indices'][0] : 0);
                    $correctIndices = [$correctIndex];
                }

                // Option marks allocation
                $optionMarks = [];
                if (isset($q['option_marks']) && is_array($q['option_marks'])) {
                    $optionMarks = array_map(function ($m) {
                        return max(0.0, (float) $m);
                    }, array_values($q['option_marks']));
                    while (count($optionMarks) < count($options)) {
                        $optionMarks[] = 0.0;
                    }
                    $optionMarks = array_slice($optionMarks, 0, count($options));

                    // Check total option marks constraint
                    $optSum = array_sum($optionMarks);
                    if ($optSum > $marks + 0.01 && $optSum > 0) {
                        $scale = $marks / $optSum;
                        $optionMarks = array_map(fn($m) => round($m * $scale, 2), $optionMarks);
                    }
                } else {
                    $optionMarks = array_fill(0, count($options), 0.0);
                    if ($type === 'msq') {
                        $numCorrect = count($correctIndices);
                        $perOpt = $numCorrect > 0 ? round($marks / $numCorrect, 2) : 0.0;
                        foreach ($correctIndices as $ci) {
                            if (isset($optionMarks[$ci])) {
                                $optionMarks[$ci] = $perOpt;
                            }
                        }
                    } else {
                        $ci = $correctIndices[0] ?? 0;
                        if (isset($optionMarks[$ci])) {
                            $optionMarks[$ci] = $marks;
                        }
                    }
                }

                return [
                    'text' => trim($q['text'] ?? ''),
                    'type' => $type,
                    'marks' => $marks,
                    'options' => $options,
                    'option_marks' => $optionMarks,
                    'correct_index' => $correctIndices[0] ?? 0,
                    'correct_indices' => $correctIndices,
                ];
            }, $data['questions']);
        }

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
