<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Http\Controllers\Api\V1\Attendance\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\AttendancePunch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `GET /v1/attendance/punches` — spec §27's dedicated Raw Punches page.
 * Read-only, paginated, never a delete endpoint (raw biometric history is
 * never removable from the normal UI — spec §27, §66).
 */
class AttendancePunchController extends Controller
{
    use RespondsWithEnvelope;

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_code' => ['sometimes', 'nullable', 'string'],
            'unit' => ['sometimes', 'nullable', 'string'],
            'employee_id' => ['sometimes', 'nullable', 'integer'],
            'emp_code' => ['sometimes', 'nullable', 'string'],
            'device_id' => ['sometimes', 'nullable', 'integer'],
            'status' => ['sometimes', 'nullable', 'string'], // comma list: VALID,DUPLICATE,UNMAPPED,INVALID
            'date_from' => ['sometimes', 'nullable', 'date'],
            'date_to' => ['sometimes', 'nullable', 'date'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:500'],
        ]);

        $query = AttendancePunch::query()->with(['user:id,name,emp_code', 'device:id,serial_number,name']);

        if (! empty($data['company_code'])) {
            $query->where('company_code', $data['company_code']);
        }
        if (! empty($data['unit'])) {
            $query->where('unit', $data['unit']);
        }
        if (! empty($data['employee_id'])) {
            $query->where('user_id', $data['employee_id']);
        }
        if (! empty($data['emp_code'])) {
            $query->where('emp_code_raw', $data['emp_code']);
        }
        if (! empty($data['device_id'])) {
            $query->where('device_id', $data['device_id']);
        }
        if (! empty($data['status'])) {
            $query->whereIn('status', explode(',', $data['status']));
        }
        if (! empty($data['date_from'])) {
            $query->whereDate('punch_date', '>=', $data['date_from']);
        }
        if (! empty($data['date_to'])) {
            $query->whereDate('punch_date', '<=', $data['date_to']);
        }

        return $this->ok($query->orderByDesc('punch_datetime')->paginate(min((int) ($data['per_page'] ?? 100), 500)));
    }
}
