<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Http\Request;

class ShiftController extends Controller
{
    private function scopedCompany(Request $request): array
    {
        $userAuth = auth('api')->user();
        if ($userAuth && (int) $userAuth->role === 1) {
            return [$userAuth->company_code, $request->unit];
        }
        if ($userAuth && (int) $userAuth->role === 2) {
            return [$userAuth->company_code, $userAuth->unit];
        }
        return [$request->company_code, $request->unit];
    }

    public function index(Request $request)
    {
        [$companyCode, $unit] = $this->scopedCompany($request);

        $shifts = Shift::withCount('employees')
            ->when($companyCode, fn ($q) => $q->where('company_code', $companyCode))
            ->when($unit, fn ($q) => $q->where('unit', $unit))
            ->orderBy('start_time')
            ->get();

        return response()->json(['status' => true, 'data' => $shifts]);
    }

    private function rules(): array
    {
        return [
            'name' => 'required|string|max:100',
            'company_code' => 'required|string',
            'unit' => 'nullable|string',
            'start_time' => 'required|date_format:H:i',
            'end_time' => 'required|date_format:H:i',
            'grace_minutes' => 'nullable|integer|min:0|max:180',
            'description' => 'nullable|string',
            // Attendance Engine Rebuild — Phase 1 (all optional/`sometimes`,
            // so every existing caller of this endpoint that never sends
            // them keeps working exactly as before).
            'shift_code' => 'sometimes|nullable|string|max:40',
            'grace_out_minutes' => 'sometimes|nullable|integer|min:0|max:180',
            'minimum_work_minutes' => 'sometimes|nullable|integer|min:0',
            'full_day_minutes' => 'sometimes|nullable|integer|min:0',
            'half_day_minutes' => 'sometimes|nullable|integer|min:0',
            'overtime_enabled' => 'sometimes|boolean',
            'overtime_after_minutes' => 'sometimes|nullable|integer|min:0',
            'break_policy' => 'sometimes|nullable|in:first_last,multi_punch',
            'is_overnight' => 'sometimes|boolean',
            'overnight_offset_minutes' => 'sometimes|nullable|integer|min:0|max:720',
            'weekly_off_days' => 'sometimes|nullable|array',
            'weekly_off_days.*' => 'integer|min:0|max:6',
            'is_active' => 'sometimes|boolean',
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules());
        $shift = Shift::create($data);

        return response()->json(['status' => true, 'message' => 'Shift created', 'data' => $shift]);
    }

    public function update(Request $request, $id)
    {
        $shift = Shift::find($id);
        if (!$shift) {
            return response()->json(['status' => false, 'message' => 'Shift not found'], 404);
        }

        $data = $request->validate($this->rules());
        $shift->update($data);

        return response()->json(['status' => true, 'message' => 'Shift updated', 'data' => $shift]);
    }

    public function destroy($id)
    {
        $shift = Shift::find($id);
        if (!$shift) {
            return response()->json(['status' => false, 'message' => 'Shift not found'], 404);
        }

        // Unassign rather than block the delete — a removed shift shouldn't
        // strand employees on a foreign key that no longer resolves.
        User::where('shift_id', $shift->id)->update(['shift_id' => null]);
        $shift->delete();

        return response()->json(['status' => true, 'message' => 'Shift deleted']);
    }

    /**
     * Bulk-assign a shift to a set of employees (by id), or clear it when
     * shift_id is null.
     */
    public function assign(Request $request)
    {
        $data = $request->validate([
            'shift_id' => 'nullable|exists:shifts,id',
            'employee_ids' => 'required|array|min:1',
            'employee_ids.*' => 'integer',
        ]);

        [$companyCode, ] = $this->scopedCompany($request);

        $query = User::whereIn('id', $data['employee_ids']);
        if ($companyCode) {
            $query->where('company_code', $companyCode);
        }
        $updated = $query->update(['shift_id' => $data['shift_id'] ?? null]);

        return response()->json(['status' => true, 'message' => "$updated employee(s) updated"]);
    }
}
