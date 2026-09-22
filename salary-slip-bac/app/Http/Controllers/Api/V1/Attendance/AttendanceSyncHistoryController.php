<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Http\Controllers\Api\V1\Attendance\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\AttendanceSyncLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** `GET /v1/attendance/sync-history` — spec §26. */
class AttendanceSyncHistoryController extends Controller
{
    use RespondsWithEnvelope;

    public function index(Request $request): JsonResponse
    {
        $query = AttendanceSyncLog::query()->with(['device:id,serial_number,name', 'triggeredBy:id,name']);

        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }
        if ($request->filled('device_id')) {
            $query->where('device_id', (int) $request->query('device_id'));
        }
        if ($request->filled('from')) {
            $query->whereDate('started_at', '>=', $request->query('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('started_at', '<=', $request->query('to'));
        }

        return $this->ok($query->orderByDesc('started_at')->paginate(min((int) $request->query('per_page', 50), 200)));
    }
}
