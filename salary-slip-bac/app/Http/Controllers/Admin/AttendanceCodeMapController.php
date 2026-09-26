<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Admin\Concerns\ResolvesEmployeeByCode;
use App\Http\Controllers\Controller;
use App\Models\AttendanceDevice;
use App\Models\AttendanceEmployeeCodeMap;
use App\Models\UploadBatch;
use App\Services\Biometric\EsslBiometricService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Manual employee <-> punching-code mapping (attendance_employee_code_map).
 * This is the admin-facing CRUD for the table BiometricUserResolver already
 * reads from -- until now nothing ever wrote to it outside a migration, so
 * a mismatched punching code had no fix short of a direct DB edit. Lets an
 * admin pick the employee and type in the code the device actually reports
 * for them (single mapping), or upload a sheet of employee-code/punching-code
 * pairs at once (bulk mapping).
 */
class AttendanceCodeMapController extends Controller
{
    use ResolvesEmployeeByCode;

    /** Maximum rows accepted in a single bulk mapping import request. */
    private const MAX_BULK_ROWS = 1000;

    public function index(Request $request)
    {
        $query = AttendanceEmployeeCodeMap::query()
            ->with([
                'user:id,name,emp_code,punching_no,form_no,company_code,unit,department',
                'device:id,serial_number,name',
            ])
            ->where('is_active', true);

        $companyCode = $request->company_code;
        if ($companyCode && !in_array($companyCode, ['all', 'all-companies'], true)) {
            $query->whereHas('user', fn ($q) => $q->where('company_code', $companyCode));
        }

        if ($search = trim((string) $request->search)) {
            $query->where(function ($q) use ($search) {
                $q->where('device_user_code', 'like', "%{$search}%")
                    ->orWhereHas('user', fn ($uq) => $uq->where('name', 'like', "%{$search}%")
                        ->orWhere('emp_code', 'like', "%{$search}%")
                        ->orWhere('punching_no', 'like', "%{$search}%"));
            });
        }

        $maps = $query->orderByDesc('updated_at')->get();

        return response()->json(['status' => true, 'data' => $maps]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'punching_code' => ['required', 'string', 'max:190'],
            // A serial, not an attendance_devices.id -- the admin knows the
            // machine by its printed serial number, not an internal row id,
            // and that table isn't guaranteed to already have a row for it
            // (see resolveDeviceId()'s docblock).
            'device_serial' => ['nullable', 'string', 'max:190'],
        ]);

        $deviceId = $this->resolveDeviceId($data['device_serial'] ?? null);

        // updateOrCreate on (device_id, device_user_code) means re-mapping a
        // code that was already claimed just moves it to the new employee,
        // rather than erroring or leaving a stale duplicate row behind.
        $map = AttendanceEmployeeCodeMap::updateOrCreate(
            ['device_id' => $deviceId, 'device_user_code' => trim($data['punching_code'])],
            ['user_id' => $data['user_id'], 'is_active' => true]
        );
        $map->load(['user:id,name,emp_code,punching_no,form_no', 'device:id,serial_number,name']);

        return response()->json(['status' => true, 'message' => 'Mapping saved', 'data' => $map]);
    }

    /**
     * Resolve a device serial (e.g. "TDBD254500578") to its attendance_devices
     * row, creating it if needed. The devices table is meant to be seeded
     * from EsslBiometricService::DEVICE_SERIALS by migration, but that
     * migration may not have reached every environment -- resolving here
     * instead of requiring a pre-existing row keeps mapping usable either way.
     */
    private function resolveDeviceId(?string $serial): ?int
    {
        $serial = trim((string) $serial);
        if ($serial === '') {
            return null;
        }

        return AttendanceDevice::firstOrCreate(
            ['serial_number' => $serial],
            ['status' => 'unknown', 'is_active' => true]
        )->id;
    }

    /**
     * GET attendance/code-map/devices -- the org's known eSSL machine
     * serials (EsslBiometricService::DEVICE_SERIALS, the same constant the
     * sync itself uses), each merged with whatever friendly name has been
     * set for it. Reads from the constant rather than requiring
     * attendance_devices to already have a row per serial, since that
     * table's seeding migration may not have reached every environment.
     */
    public function devices()
    {
        $known = EsslBiometricService::DEVICE_SERIALS;
        $existing = AttendanceDevice::query()
            ->whereIn('serial_number', $known)
            ->get(['id', 'serial_number', 'name'])
            ->keyBy('serial_number');

        $devices = collect($known)->map(function ($serial) use ($existing) {
            $row = $existing->get($serial);
            return [
                'id' => $row->id ?? null,
                'serial_number' => $serial,
                'name' => $row->name ?? null,
            ];
        })->values();

        return response()->json(['status' => true, 'data' => $devices]);
    }

    /**
     * POST attendance/code-map/device-name -- give a machine serial a
     * friendly name (e.g. "Main Gate"), creating its attendance_devices row
     * if it doesn't exist yet. Only touches `name`; an existing row's
     * status/sync history is left untouched.
     */
    public function nameDevice(Request $request)
    {
        $data = $request->validate([
            'serial_number' => ['required', 'string', 'max:190'],
            'name' => ['nullable', 'string', 'max:190'],
        ]);

        $name = trim((string) ($data['name'] ?? ''));
        $device = AttendanceDevice::updateOrCreate(
            ['serial_number' => trim($data['serial_number'])],
            ['name' => $name !== '' ? $name : null]
        );

        return response()->json(['status' => true, 'message' => 'Device name saved', 'data' => $device]);
    }

    public function destroy($id)
    {
        $map = AttendanceEmployeeCodeMap::find($id);
        if (!$map) {
            return response()->json(['status' => false, 'message' => 'Mapping not found'], 404);
        }
        $map->delete();

        return response()->json(['status' => true, 'message' => 'Mapping removed']);
    }

    public function bulkImport(Request $request)
    {
        $data = $request->validate([
            'company_code' => ['sometimes', 'nullable', 'string'],
            'rows' => ['required', 'array', 'max:' . self::MAX_BULK_ROWS],
            'rows.*.employee_code' => ['required', 'string'],
            'rows.*.punching_code' => ['required', 'string'],
        ], [
            'rows.max' => 'A bulk mapping import is limited to ' . self::MAX_BULK_ROWS . ' rows per request.',
        ]);

        $companyCode = $data['company_code'] ?? 'all';
        $userId = auth('api')->id();

        $imported = 0;
        $skipped = [];
        $rowReports = [];

        foreach ($data['rows'] as $rowIndex => $row) {
            $excelRowNum = $rowIndex + 2;
            $employeeCode = trim((string) $row['employee_code']);
            $punchingCode = trim((string) $row['punching_code']);

            if ($employeeCode === '' || $punchingCode === '') {
                $reason = 'Missing employee code or punching code';
                $skipped[] = "Row {$excelRowNum}: {$reason}";
                $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $row];
                continue;
            }

            $employee = $this->findEmployeeByCode($employeeCode, $companyCode);
            if (!$employee) {
                $reason = "Employee code '{$employeeCode}' not found";
                $skipped[] = "Row {$excelRowNum}: {$reason}";
                $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $row];
                continue;
            }

            AttendanceEmployeeCodeMap::updateOrCreate(
                ['device_id' => null, 'device_user_code' => $punchingCode],
                ['user_id' => $employee->id, 'is_active' => true]
            );

            $imported++;
            $rowReports[] = [
                'row_number' => $excelRowNum,
                'status' => 'passed',
                'reason' => null,
                'row_data' => [
                    // UploadBatchController::destroy()'s generic gate skips
                    // any row without a truthy `emp_code`, so this has to be
                    // present even though the mapping's real undo key below
                    // is punching_code/device_id, not this employee code.
                    'emp_code' => $employeeCode,
                    'employee_code' => $employeeCode,
                    'employee_name' => $employee->name,
                    'punching_code' => $punchingCode,
                    'device_id' => null,
                ],
            ];
        }

        $batchId = null;
        try {
            $batch = UploadBatch::create([
                'type' => 'attendance_code_map',
                'company_code' => $companyCode && !in_array($companyCode, ['all', 'all-companies']) ? $companyCode : null,
                'unit' => null,
                'month' => null,
                'year' => null,
                'file_name' => 'attendance_code_map_import.xlsx',
                'total_rows' => count($rowReports),
                'success_count' => $imported,
                'failed_count' => count($skipped),
                'uploaded_by' => $userId,
            ]);
            $batch->rows()->createMany($rowReports);
            $batchId = $batch->id;
        } catch (\Throwable $e) {
            Log::error('Failed to record attendance code-map import batch: ' . $e->getMessage());
        }

        $message = "$imported mapping(s) saved";
        if ($skipped) {
            $message .= '; ' . count($skipped) . ' row(s) skipped';
        }

        return response()->json([
            'status' => true,
            'message' => $message,
            'imported' => $imported,
            'skipped' => $skipped,
            'batch_id' => $batchId,
        ]);
    }
}
