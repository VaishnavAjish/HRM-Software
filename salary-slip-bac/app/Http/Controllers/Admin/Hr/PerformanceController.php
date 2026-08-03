<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Controller;
use App\Models\PerformanceCycle;
use App\Models\PerformanceGoal;
use App\Models\PerformanceReview;
use App\Models\User;
use Illuminate\Http\Request;

class PerformanceController extends Controller
{
    // ── Cycles ──────────────────────────────────────────────────────────

    public function cycles(Request $request)
    {
        $cycles = PerformanceCycle::orderByDesc('period_start')->get();

        return response()->json(['status' => true, 'data' => $cycles]);
    }

    public function storeCycle(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'period_start' => 'required|date',
            'period_end' => 'required|date|after_or_equal:period_start',
            'type' => 'nullable|in:annual,half_yearly,quarterly',
        ]);

        $cycle = PerformanceCycle::create($data + ['status' => 'draft']);

        return response()->json(['status' => true, 'message' => 'Performance cycle created', 'data' => $cycle], 201);
    }

    public function updateCycle(Request $request, $id)
    {
        $cycle = PerformanceCycle::find($id);
        if (!$cycle) {
            return response()->json(['status' => false, 'message' => 'Cycle not found'], 404);
        }

        $data = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'period_start' => 'nullable|date',
            'period_end' => 'nullable|date',
            'type' => 'nullable|in:annual,half_yearly,quarterly',
            'status' => 'nullable|in:draft,active,closed',
        ]);

        $cycle->update($data);

        return response()->json(['status' => true, 'message' => 'Cycle updated', 'data' => $cycle]);
    }

    public function destroyCycle($id)
    {
        $cycle = PerformanceCycle::find($id);
        if (!$cycle) {
            return response()->json(['status' => false, 'message' => 'Cycle not found'], 404);
        }

        $cycle->delete();

        return response()->json(['status' => true, 'message' => 'Cycle deleted']);
    }

    // ── Goals (KPI / KRA / OKR) ─────────────────────────────────────────

    public function goals(Request $request)
    {
        $query = PerformanceGoal::with(['user', 'cycle']);
        if ($request->cycle_id) {
            $query->where('cycle_id', $request->cycle_id);
        }
        if ($request->user_id) {
            $query->where('user_id', $request->user_id);
        }

        return response()->json(['status' => true, 'data' => $query->orderByDesc('id')->get()]);
    }

    public function storeGoal(Request $request)
    {
        $data = $request->validate([
            'cycle_id' => 'required|exists:performance_cycles,id',
            'user_id' => 'required|exists:users,id',
            'type' => 'required|in:KPI,KRA,OKR',
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'weight' => 'nullable|numeric|min:0|max:100',
            'target_value' => 'nullable|string|max:255',
        ]);

        $goal = PerformanceGoal::create($data + ['status' => 'not_started', 'created_by' => auth('api')->id()]);

        return response()->json(['status' => true, 'message' => 'Goal created', 'data' => $goal], 201);
    }

    public function updateGoal(Request $request, $id)
    {
        $goal = PerformanceGoal::find($id);
        if (!$goal) {
            return response()->json(['status' => false, 'message' => 'Goal not found'], 404);
        }

        $data = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'weight' => 'nullable|numeric|min:0|max:100',
            'target_value' => 'nullable|string|max:255',
            'achieved_value' => 'nullable|string|max:255',
            'status' => 'nullable|in:not_started,in_progress,completed,missed',
        ]);

        $goal->update($data);

        return response()->json(['status' => true, 'message' => 'Goal updated', 'data' => $goal]);
    }

    public function destroyGoal($id)
    {
        $goal = PerformanceGoal::find($id);
        if (!$goal) {
            return response()->json(['status' => false, 'message' => 'Goal not found'], 404);
        }

        $goal->delete();

        return response()->json(['status' => true, 'message' => 'Goal deleted']);
    }

    // ── Reviews (self / manager / peer / 360) ───────────────────────────

    public function reviews(Request $request)
    {
        $query = PerformanceReview::with(['user', 'reviewer', 'cycle']);
        if ($request->cycle_id) {
            $query->where('cycle_id', $request->cycle_id);
        }
        if ($request->user_id) {
            $query->where('user_id', $request->user_id);
        }
        if ($request->review_type) {
            $query->where('review_type', $request->review_type);
        }

        return response()->json(['status' => true, 'data' => $query->orderByDesc('id')->get()]);
    }

    public function storeReview(Request $request)
    {
        $data = $request->validate([
            'cycle_id' => 'required|exists:performance_cycles,id',
            'user_id' => 'required|exists:users,id',
            'review_type' => 'required|in:self,manager,peer,360',
            'overall_rating' => 'nullable|numeric|min:1|max:5',
            'potential_rating' => 'nullable|numeric|min:1|max:5',
            'competency_ratings' => 'nullable|array',
            'strengths' => 'nullable|string',
            'improvements' => 'nullable|string',
            'status' => 'nullable|in:draft,submitted,acknowledged',
        ]);

        $review = PerformanceReview::updateOrCreate(
            [
                'cycle_id' => $data['cycle_id'],
                'user_id' => $data['user_id'],
                'reviewer_id' => auth('api')->id(),
                'review_type' => $data['review_type'],
            ],
            $data + [
                'reviewer_id' => auth('api')->id(),
                'status' => $data['status'] ?? 'submitted',
                'submitted_at' => now(),
            ]
        );

        return response()->json(['status' => true, 'message' => 'Review saved', 'data' => $review], 201);
    }

    public function updateReview(Request $request, $id)
    {
        $review = PerformanceReview::find($id);
        if (!$review) {
            return response()->json(['status' => false, 'message' => 'Review not found'], 404);
        }

        $data = $request->validate([
            'overall_rating' => 'nullable|numeric|min:1|max:5',
            'potential_rating' => 'nullable|numeric|min:1|max:5',
            'competency_ratings' => 'nullable|array',
            'strengths' => 'nullable|string',
            'improvements' => 'nullable|string',
            'status' => 'nullable|in:draft,submitted,acknowledged',
        ]);

        if (($data['status'] ?? null) === 'acknowledged') {
            $data['acknowledged_at'] = now();
        }

        $review->update($data);

        return response()->json(['status' => true, 'message' => 'Review updated', 'data' => $review]);
    }

    // ── Dashboard: bell curve, 9-box, skill matrix, cards ───────────────

    public function dashboard(Request $request)
    {
        $cycleId = $request->cycle_id ?? PerformanceCycle::orderByDesc('period_start')->value('id');

        $reviews = PerformanceReview::where('cycle_id', $cycleId)
            ->where('review_type', 'manager')
            ->whereNotNull('overall_rating')
            ->with('user')
            ->get();

        $avgRating = round($reviews->avg('overall_rating') ?? 0, 2);
        $topPerformers = $reviews->where('overall_rating', '>=', 4.5)->count();
        $lowPerformers = $reviews->where('overall_rating', '<', 2.5)->count();
        $promotionEligible = $reviews->filter(fn ($r) => $r->overall_rating >= 4 && $r->potential_rating >= 4)->count();
        $trainingRequired = $reviews->where('overall_rating', '<', 3)->count();

        $bellCurve = [
            ['band' => '1.0 - 1.9', 'count' => $reviews->whereBetween('overall_rating', [1, 1.9])->count()],
            ['band' => '2.0 - 2.9', 'count' => $reviews->whereBetween('overall_rating', [2, 2.9])->count()],
            ['band' => '3.0 - 3.9', 'count' => $reviews->whereBetween('overall_rating', [3, 3.9])->count()],
            ['band' => '4.0 - 4.4', 'count' => $reviews->whereBetween('overall_rating', [4, 4.4])->count()],
            ['band' => '4.5 - 5.0', 'count' => $reviews->whereBetween('overall_rating', [4.5, 5])->count()],
        ];

        $nineBox = $reviews->filter(fn ($r) => $r->potential_rating !== null)->map(function ($r) {
            $perf = $r->overall_rating >= 4 ? 'high' : ($r->overall_rating >= 2.5 ? 'medium' : 'low');
            $pot = $r->potential_rating >= 4 ? 'high' : ($r->potential_rating >= 2.5 ? 'medium' : 'low');

            return [
                'user_id' => $r->user_id,
                'name' => $r->user->name ?? '—',
                'performance' => $perf,
                'potential' => $pot,
            ];
        })->values();

        $competencyTotals = [];
        foreach ($reviews as $r) {
            foreach ((array) $r->competency_ratings as $competency => $rating) {
                $competencyTotals[$competency]['sum'] = ($competencyTotals[$competency]['sum'] ?? 0) + (float) $rating;
                $competencyTotals[$competency]['count'] = ($competencyTotals[$competency]['count'] ?? 0) + 1;
            }
        }
        $skillMatrix = collect($competencyTotals)->map(fn ($v, $k) => [
            'competency' => $k,
            'average' => round($v['sum'] / max(1, $v['count']), 2),
        ])->values();

        $goals = PerformanceGoal::where('cycle_id', $cycleId)->get();
        $goalCompletionPct = $goals->count() ? round($goals->where('status', 'completed')->count() / $goals->count() * 100, 1) : 0;

        return response()->json(['status' => true, 'data' => [
            'cycle_id' => $cycleId,
            'cards' => [
                'top_performers' => $topPerformers,
                'low_performers' => $lowPerformers,
                'average_rating' => $avgRating,
                'promotion_eligible' => $promotionEligible,
                'training_required' => $trainingRequired,
                'goal_completion_pct' => $goalCompletionPct,
            ],
            'bell_curve' => $bellCurve,
            'nine_box' => $nineBox,
            'skill_matrix' => $skillMatrix,
        ]]);
    }
}
