<?php

use App\Http\Controllers\Api\V1\Attendance\AttendanceDailyController;
use App\Http\Controllers\Api\V1\Attendance\AttendanceDeviceController;
use App\Http\Controllers\Api\V1\Attendance\AttendancePunchController;
use App\Http\Controllers\Api\V1\Attendance\AttendanceRecalculateController;
use App\Http\Controllers\Api\V1\Attendance\AttendanceRegularizationController;
use App\Http\Controllers\Api\V1\Attendance\AttendanceReportController;
use App\Http\Controllers\Api\V1\Attendance\AttendanceRuleController;
use App\Http\Controllers\Api\V1\Attendance\AttendanceSimulatorController;
use App\Http\Controllers\Api\V1\Attendance\AttendanceSyncHistoryController;
use Illuminate\Support\Facades\Route;

/*
 * Attendance Engine Rebuild — isolated route file, mirroring the exact
 * pattern already established for the Mediclaim module (see
 * routes/mediclaim.php's own docblock): every new-engine route lives here;
 * routes/api.php's only edit is one appended `require` line. This is
 * entirely ADDITIVE — the legacy `/attendance/grid`, `/attendance/cell`,
 * `/attendance/import`, `/attendance/sync-essl` and `/shifts/*` routes
 * (still in routes/api.php, still backing the current AttendanceView.jsx
 * page) are completely untouched and keep working exactly as before.
 *
 * Final prefix: /api/v1/attendance/... — distinct from the legacy
 * /api/attendance/... routes, so the two can never collide.
 *
 * Permission codes below (the "attendance.*" family) are registered in
 * PermissionRegistry alongside the existing "hr.attendance.*" and
 * "hr.shift.*" nodes — see that file's Attendance Engine section.
 */
Route::middleware(['jwt.auth', 'role:admin'])->prefix('v1/attendance')->group(function () {
    Route::get('daily', [AttendanceDailyController::class, 'daily'])->middleware('permission:attendance.daily.read');
    Route::get('monthly', [AttendanceDailyController::class, 'monthly'])->middleware('permission:attendance.daily.read');
    Route::get('employee/{id}', [AttendanceDailyController::class, 'employee'])->whereNumber('id')->middleware('permission:attendance.daily.read');
    Route::get('{id}/details', [AttendanceDailyController::class, 'details'])->whereNumber('id')->middleware('permission:attendance.daily.read');

    Route::get('punches', [AttendancePunchController::class, 'index'])->middleware('permission:attendance.punch.read');

    Route::post('recalculate', [AttendanceRecalculateController::class, 'store'])
        ->middleware(['throttle:10,1', 'permission:attendance.recalculate']);
    Route::get('recalculation-jobs', [AttendanceRecalculateController::class, 'index'])->middleware('permission:attendance.daily.read');
    Route::get('recalculation-jobs/{id}', [AttendanceRecalculateController::class, 'show'])->whereNumber('id')->middleware('permission:attendance.daily.read');
    Route::post('simulate', [AttendanceSimulatorController::class, 'store'])
        ->middleware(['throttle:30,1', 'permission:attendance.rule.read']);

    Route::get('rules', [AttendanceRuleController::class, 'index'])->middleware('permission:attendance.rule.read');
    Route::post('rules', [AttendanceRuleController::class, 'store'])->middleware(['throttle:20,1', 'permission:attendance.rule.create']);
    Route::delete('rules/{rule}', [AttendanceRuleController::class, 'destroy'])->whereNumber('rule')->middleware('permission:attendance.rule.update');

    Route::get('regularizations', [AttendanceRegularizationController::class, 'index'])->middleware('permission:attendance.regularization.read');
    Route::post('regularizations', [AttendanceRegularizationController::class, 'store'])
        ->middleware(['throttle:30,1', 'permission:attendance.regularization.create']);
    Route::post('regularizations/{regularization}/decision', [AttendanceRegularizationController::class, 'decide'])
        ->whereNumber('regularization')->middleware(['throttle:30,1', 'permission:attendance.regularization.decide']);

    Route::get('devices', [AttendanceDeviceController::class, 'index'])->middleware('permission:attendance.device.read');
    Route::put('devices/{device}', [AttendanceDeviceController::class, 'update'])->whereNumber('device')->middleware('permission:attendance.device.update');

    Route::get('sync-history', [AttendanceSyncHistoryController::class, 'index'])->middleware('permission:attendance.sync_history.read');

    // Reports (spec S71's "12 report types") + dashboard analytics. `.export`
    // is a SEPARATE permission from `.read` (two middleware entries = both
    // required), matching Mediclaim's reports/export route convention.
    Route::get('dashboard', [AttendanceReportController::class, 'dashboard'])->middleware('permission:attendance.daily.read');
    Route::get('reports/{type}', [AttendanceReportController::class, 'index'])->middleware('permission:attendance.report.read');
    Route::get('reports/{type}/export', [AttendanceReportController::class, 'export'])
        ->middleware(['throttle:10,1', 'permission:attendance.report.read', 'permission:attendance.report.export']);
});
