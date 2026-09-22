<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Http\Controllers\Api\V1\Attendance\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\AttendanceDevice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** `GET,PUT /v1/attendance/devices` — spec §24, §62's machine health/registry. */
class AttendanceDeviceController extends Controller
{
    use RespondsWithEnvelope;

    public function index(Request $request): JsonResponse
    {
        $query = AttendanceDevice::query();
        if ($request->filled('company_code')) {
            $query->where('company_code', $request->query('company_code'));
        }

        return $this->ok($query->orderBy('serial_number')->get());
    }

    public function update(Request $request, int $device): JsonResponse
    {
        $model = AttendanceDevice::find($device);
        if (! $model) {
            return $this->missing('Device not found.');
        }

        $data = $request->validate([
            'name' => ['sometimes', 'nullable', 'string', 'max:190'],
            'ip_address' => ['sometimes', 'nullable', 'ip'],
            'company_code' => ['sometimes', 'nullable', 'string', 'max:60'],
            'unit' => ['sometimes', 'nullable', 'string', 'max:120'],
            'location' => ['sometimes', 'nullable', 'string', 'max:190'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $model->fill($data);
        $model->save();

        return $this->ok($model->fresh());
    }
}
