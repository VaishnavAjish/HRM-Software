<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Models\AuthorizationDecisionLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AuthorizationAuditController extends Controller
{
    public function index(Request $request)
    {
        $actor = auth('api')->user();
        $query = AuthorizationDecisionLog::query()->orderByDesc('created_at');
        if ((int) $actor->role !== 0) {
            $query->where('tenant_id', $actor->company_code);
        }
        foreach (['decision', 'action', 'resource_type', 'user_id', 'request_id'] as $filter) {
            if ($request->filled($filter)) {
                $query->where($filter, $request->query($filter));
            }
        }
        return response()->json(['success' => true, 'data' => $query->paginate(min(100, max(1, (int) $request->query('limit', 25))))]);
    }

    public function analytics(Request $request)
    {
        $actor = auth('api')->user();
        $base = AuthorizationDecisionLog::query();
        if ((int) $actor->role !== 0) {
            $base->where('tenant_id', $actor->company_code);
        }
        $since = now()->subDays(min(365, max(1, (int) $request->query('days', 30))));
        $base->where('created_at', '>=', $since);
        $totals = (clone $base)->select('decision', DB::raw('COUNT(*) as total'))->groupBy('decision')->pluck('total', 'decision');
        $denied = (clone $base)->where('decision', 'DENY')->select('action', DB::raw('COUNT(*) as total'))
            ->groupBy('action')->orderByDesc('total')->limit(10)->get();
        $slow = (clone $base)->orderByDesc('duration_ms')->limit(10)->get(['decision_id', 'action', 'resource_type', 'duration_ms', 'created_at']);
        return response()->json(['success' => true, 'data' => [
            'allowed' => (int) ($totals['ALLOW'] ?? 0), 'denied' => (int) ($totals['DENY'] ?? 0),
            'mostDeniedActions' => $denied, 'slowEvaluations' => $slow,
        ]]);
    }
}
