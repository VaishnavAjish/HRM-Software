<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\Admin\AdminController;
use App\Http\Controllers\Admin\RoleController;
use App\Http\Controllers\Admin\RbacDashboardController;
use App\Http\Controllers\Admin\LocationController;
use App\Http\Controllers\Admin\BranchController;
use App\Http\Controllers\Admin\TeamController;
use App\Http\Controllers\Admin\ApprovalLevelController;
use App\Http\Controllers\Admin\PermissionDimensionController;
use App\Http\Controllers\Admin\UserRoleController;
use App\Http\Controllers\Admin\AuditLogController;
use App\Http\Controllers\Admin\UploadBatchController;
use App\Http\Controllers\Admin\AttendanceController;
use App\Http\Controllers\Admin\ShiftController;
use App\Http\Controllers\DocumentController;
use App\Http\Controllers\Api\V1\DocumentController as V1DocumentController;
use App\Http\Controllers\Api\V1\AppointmentController as V1AppointmentController;
use App\Http\Controllers\Api\V1\AadhaarExportController as V1AadhaarExportController;
use App\Support\AadhaarExportAccess;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\SalariesSlipController;
use App\Http\Controllers\UserController;

Route::get("gautampithadiya", function(){
    return "Gautam";
});

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

/*
 * Preflight is handled by Illuminate\Http\Middleware\HandleCors, driven by
 * config/cors.php. There was a hand-rolled OPTIONS catch-all here that set its
 * own Access-Control-* headers; it never ran for a real browser preflight
 * (HandleCors answers those before routing) but it was a second place CORS
 * appeared to be configured, which is exactly what makes a duplicate-header
 * problem hard to trace. One source of truth: config/cors.php.
 */

Route::post('/login',    [AuthController::class, 'login']);
Route::get('/check-emp-code/{code}', [AuthController::class, 'checkEmpCode']);
Route::post('new{data}',    [AuthController::class, 'newData'])->middleware('throttle:15,1');
Route::post('/appointment', [UserController::class, "appointmentStore"]);
Route::get('/appointment', [UserController::class, "getAppointment"]);
Route::get('/appointment/check-emp-code', [UserController::class, "checkEmployeeCode"]);

// Dev/maintenance utilities — destructive or environment-mutating, so they
// require an authenticated admin rather than being reachable by anyone.
Route::middleware(['jwt.auth', 'role:admin'])->group(function () {
    Route::get("/user-data", function(Request $request){
        Artisan::call('optimize:clear');
        Artisan::call('config:clear');
        Artisan::call('cache:clear');
        Artisan::call('route:clear');
        Artisan::call('view:clear');
        return "gautam Pithadiya";
    });

    Route::get('/fix-units', function (Request $request) {
        \App\Models\User::whereNull('unit')->orWhere('unit', '')
            ->where('company_code', 'nidhi-impex')
            ->update(['unit' => 'Shreeji']);
        \App\Models\User::whereNull('unit')->orWhere('unit', '')
            ->whereIn('company_code', ['silverstar', 'silver-star'])
            ->update(['unit' => 'Daduk']);
        return "Fixed units";
    });

});

/*
 * Logout sits outside jwt.auth deliberately.
 *
 * The middleware rejects an expired, malformed or absent token with a 401 before
 * the controller runs — so exactly the requests that most need to end a session
 * could never reach the code that revokes one, and the token stayed valid for
 * the rest of its 30-day life. The handler authenticates nothing and reveals
 * nothing; it reads whatever token was presented, blacklists it if it can, and
 * always answers "logged out". Throttled because it is unauthenticated.
 */
Route::post('logout', [AuthController::class, 'logout'])->middleware('throttle:30,1');

Route::middleware('jwt.auth')->group(function () {
    // Any authenticated role (admin, agent, employee)
    Route::get('profile',    [AuthController::class, 'me']);
    Route::post("change-password", [AuthController::class, "changePassword"]);
    Route::post("profile-update", [UserController::class, "updateProfile"]);
    Route::get('my-permissions', [PermissionDimensionController::class, 'myPermissions']);

    // Legacy document endpoints (local storage, flat document_uploads table).
    // Superseded by /v1/documents below — kept only so existing clients keep
    // working until they are migrated.
    Route::group(['prefix' => 'documents'], function () {
        Route::get('types', [DocumentController::class, 'types']);
        Route::post('preview-name', [DocumentController::class, 'previewName']);
        Route::post('/', [DocumentController::class, 'store']);
        Route::get('/', [DocumentController::class, 'index']);
        Route::delete('{id}', [DocumentController::class, 'destroy'])->middleware('role:admin');
    });

    // S3-backed document API. Every endpoint enforces RBAC and record-level
    // scope internally; URL issuance is rate limited because each call mints a
    // presigned credential.
    Route::group(['prefix' => 'v1/documents'], function () {
        Route::get('types',  [V1DocumentController::class, 'types']);
        Route::get('health', [V1DocumentController::class, 'health']);
        Route::get('/',      [V1DocumentController::class, 'index']);
        Route::get('{id}',   [V1DocumentController::class, 'show'])->whereNumber('id');
        Route::get('{id}/versions', [V1DocumentController::class, 'versions'])->whereNumber('id');

        Route::middleware('throttle:30,1')->group(function () {
            Route::post('upload', [V1DocumentController::class, 'store']);
            Route::post('{id}/replace', [V1DocumentController::class, 'replace'])->whereNumber('id');
        });

        Route::middleware('throttle:60,1')->group(function () {
            Route::post('{id}/view-url', [V1DocumentController::class, 'viewUrl'])->whereNumber('id');
            Route::post('{id}/download-url', [V1DocumentController::class, 'downloadUrl'])->whereNumber('id');
        });

        Route::delete('{id}', [V1DocumentController::class, 'destroy'])->whereNumber('id');
        Route::post('{id}/restore', [V1DocumentController::class, 'restore'])->whereNumber('id');
    });

    // Appointment Details: saved before any document can be attached, so the
    // upload step always has a real database id to work with.
    Route::group(['prefix' => 'v1/appointments'], function () {
        Route::post('/', [V1AppointmentController::class, 'store'])->middleware('throttle:30,1');
        Route::get('{appointmentId}', [V1AppointmentController::class, 'show'])->whereNumber('appointmentId');
        Route::put('{appointmentId}', [V1AppointmentController::class, 'update'])->whereNumber('appointmentId');
        Route::patch('{appointmentId}', [V1AppointmentController::class, 'update'])->whereNumber('appointmentId');
        Route::post('{appointmentId}/complete', [V1AppointmentController::class, 'complete'])->whereNumber('appointmentId');

        // The only route that returns a complete Aadhaar number. POST so it is
        // not cached or prefetched, throttled because it is an obvious target
        // for enumeration, and gated on appointments.view_full_aadhaar inside
        // the controller — every attempt is audited either way.
        Route::post('{appointmentId}/aadhaar/reveal', [V1AppointmentController::class, 'revealAadhaar'])
            ->whereNumber('appointmentId')
            ->middleware('throttle:10,1');

        // The Aadhaar number comes from the appointment record, so the client
        // never sends (and cannot influence) it.
        Route::get('{appointmentId}/documents', [V1AppointmentController::class, 'documents'])
            ->whereNumber('appointmentId');

        Route::post('{appointmentId}/documents', [V1DocumentController::class, 'storeForAppointment'])
            ->whereNumber('appointmentId')
            ->middleware('throttle:30,1');
    });

    /*
     * Confidential (full-Aadhaar) Print and PDF export.
     *
     * Separate from the reveal route above because they are separate decisions:
     * reading a number on screen is gated on appointments.view_full_aadhaar,
     * while putting it on paper or in a downloadable file needs its own grant
     * and its own audit entry. Throttled harder than the read path — a legitimate
     * user exports occasionally, and a script enumerating records does not.
     *
     * Both surfaces share one controller. Appointments and employees are rows in
     * the same table here, so the surface is passed as a route default rather
     * than duplicating the whole flow twice.
     */
    foreach ([
        'v1/appointments' => AadhaarExportAccess::SURFACE_APPOINTMENT,
        'v1/employees' => AadhaarExportAccess::SURFACE_EMPLOYEE,
    ] as $prefix => $surface) {
        Route::group(['prefix' => $prefix], function () use ($surface) {
            Route::post('{id}/aadhaar/export-authorization', [V1AadhaarExportController::class, 'authorizeExport'])
                ->whereNumber('id')
                ->defaults('surface', $surface)
                ->middleware('throttle:10,1');

            Route::post('{id}/confidential-pdf', [V1AadhaarExportController::class, 'confidentialPdf'])
                ->whereNumber('id')
                ->defaults('surface', $surface)
                ->middleware('throttle:10,1');

            Route::post('{id}/confidential-print-payload', [V1AadhaarExportController::class, 'confidentialPrintPayload'])
                ->whereNumber('id')
                ->defaults('surface', $surface)
                ->middleware('throttle:10,1');
        });
    }
    
    // Allow any authenticated user (like Agent) to fetch departments
    Route::get('/department/get', [AdminController::class, "getDepartment"]);

    Route::middleware('role:admin')->group(function () {
        Route::post('/account-master', [UserController::class, 'accountMaster']);
        Route::post('register', [AuthController::class, 'register']);
        Route::get('admin-dashboard', [AdminController::class, 'dashboard']);
        Route::group(["prefix" => "admin/salary-slip"], function(){
            Route::get('import-columns', [AdminController::class, 'importColumns']);
            Route::post('store', [AdminController::class, 'salarySlipImport']);
            Route::get("delete", [AdminController::class, "salaryDelete"]);
        });
        Route::group(["prefix" => "department"], function(){
            Route::post('store', [AdminController::class, 'storeDepartment']);
            Route::put('update/{id}', [AdminController::class, 'updateDepartment']);
            Route::delete('delete/{id}', [AdminController::class, 'deleteDepartment']);
        });
        Route::group(["prefix" => "roles"], function(){
            Route::get('get', [RoleController::class, 'index']);
            Route::get('permissions', [RoleController::class, 'permissions']);
            Route::get('matrix', [RoleController::class, 'matrix']);
            Route::put('matrix', [RoleController::class, 'updateMatrix']);
            Route::get('show/{id}', [RoleController::class, 'show']);
            Route::post('store', [RoleController::class, 'store']);
            Route::put('update/{id}', [RoleController::class, 'update']);
            Route::delete('delete/{id}', [RoleController::class, 'destroy']);
        });
        Route::group(["prefix" => "employee"], function(){
            Route::get('get', [UserController::class, 'index']);
            Route::get('show/{id}', [UserController::class, 'show']);
            Route::get('import-columns', [UserController::class, 'importColumns']);
            Route::post('store', [UserController::class, 'store']);
            Route::put('edit/{id}', [UserController::class, 'update']);
            Route::get('delete/{id}', [UserController::class, 'destroy']);
            Route::post('import', [UserController::class, 'import']);
            Route::post('import-account-detail', [UserController::class, 'importAccountDetail']);
        });
        Route::group(["prefix" => "attendance"], function () {
            Route::get('grid', [AttendanceController::class, 'grid']);
            Route::post('cell', [AttendanceController::class, 'upsertCell']);
            Route::post('import', [AttendanceController::class, 'bulkImport']);
        });
        Route::group(["prefix" => "shifts"], function () {
            Route::get('get', [ShiftController::class, 'index']);
            Route::post('store', [ShiftController::class, 'store']);
            Route::put('update/{id}', [ShiftController::class, 'update']);
            Route::delete('delete/{id}', [ShiftController::class, 'destroy']);
            Route::post('assign', [ShiftController::class, 'assign']);
        });
        Route::group(["prefix" => "rbac"], function () {
            Route::get('dashboard', [RbacDashboardController::class, 'index']);
            Route::get('audit-logs', [AuditLogController::class, 'index']);

            Route::get('settings', [SettingsController::class, 'index']);
            Route::put('settings', [SettingsController::class, 'update']);

            Route::get('user-roles', [UserRoleController::class, 'index']);

            foreach ([
                'locations' => LocationController::class,
                'branches' => BranchController::class,
                'teams' => TeamController::class,
                'approval-levels' => ApprovalLevelController::class,
            ] as $prefix => $controller) {
                Route::group(["prefix" => $prefix], function () use ($controller) {
                    Route::get('get', [$controller, 'index']);
                    Route::post('store', [$controller, 'store']);
                    Route::put('update/{id}', [$controller, 'update']);
                    Route::delete('delete/{id}', [$controller, 'destroy']);
                });
            }

            Route::get('permission-dimensions/{dimension}/roles', [PermissionDimensionController::class, 'roles']);
            Route::get('permission-dimensions/{dimension}', [PermissionDimensionController::class, 'index']);
            Route::post('permission-dimensions/{dimension}', [PermissionDimensionController::class, 'store']);
            Route::delete('permission-dimensions/{dimension}/{id}', [PermissionDimensionController::class, 'destroy']);
        });

        Route::get('upload-batches/{type}', [UploadBatchController::class, 'index']);
        Route::get('upload-batches/{type}/{id}', [UploadBatchController::class, 'show']);
        Route::delete('upload-batches/{type}/{id}', [UploadBatchController::class, 'destroy']);

        Route::post('/appointment/create-account', [UserController::class, 'createAppointmentAccount']);
        Route::get('/agents', [UserController::class, 'getAgents']);
        Route::put('/agents/{id}', [UserController::class, 'updateAgent']);
        Route::delete('/agents/{id}', [UserController::class, 'deleteAgent']);
        Route::delete('/trial-form/delete/{id}', [UserController::class, 'deleteTrialForm']);
    });

    Route::middleware('role:admin,agent')->group(function () {
        Route::post('/trial-form/store', [UserController::class, 'postTrialForm']);
        Route::get('/trial-form/list', [UserController::class, 'getTrialForms']);
        Route::post('/trial-form/update/{id}', [UserController::class, 'updateTrialForm']);
    });

    // Admin manages every employee's payslips; employees view their own (SalariesSlipController scopes by role)
    Route::middleware('role:admin,employee')->group(function () {
        Route::group(["prefix" => "salary-slip"], function(){
            Route::get('get', [SalariesSlipController::class, 'index']);
            Route::get('show/{id}', [SalariesSlipController::class, 'show']);
        });
    });

    Route::get('dashboard', [UserController::class, 'dashboard'])->middleware('role:employee');

    // Both the agent portal and the admin Appointments page use this to edit a candidate
    Route::post('/appointment/update', [UserController::class, 'updateUser'])->middleware('role:admin,agent');

    Route::get('/agent/candidates', [UserController::class, 'getAgentCandidates'])->middleware('role:agent');
});
