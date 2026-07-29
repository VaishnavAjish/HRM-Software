<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request)
    {
        $perPage = (int) $request->query('limit', 25);

        $logs = AuditLog::with('user:id,name,email')
            ->when($request->query('module'), fn($q, $m) => $q->where('module', $m))
            ->when($request->query('action'), fn($q, $a) => $q->where('action', $a))
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return response()->json([
            'status' => true,
            'data' => $logs->items(),
            'meta' => [
                'total' => $logs->total(),
                'page' => $logs->currentPage(),
                'limit' => $logs->perPage(),
                'totalPages' => $logs->lastPage(),
            ],
        ]);
    }
}
