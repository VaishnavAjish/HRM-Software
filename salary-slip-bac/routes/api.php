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
use App\Http\Controllers\Api\V1\Authorization\AccessRequestController as V1AccessRequestController;
use App\Http\Controllers\Api\V1\Authorization\AccessLifecycleController as V1AccessLifecycleController;
use App\Http\Controllers\Api\V1\Authorization\AuthorizationAuditController as V1AuthorizationAuditController;
use App\Http\Controllers\Api\V1\Authorization\AuthorizationController as V1AuthorizationController;
use App\Http\Controllers\Api\V1\Authorization\EnterpriseRoleController as V1EnterpriseRoleController;
use App\Http\Controllers\Api\V1\Authorization\PermissionController as V1PermissionController;
use App\Http\Controllers\Api\V1\Authorization\PolicyController as V1PolicyController;
use App\Support\AadhaarExportAccess;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\SalariesSlipController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\Admin\Hr\HrDashboardController;
use App\Http\Controllers\Api\ModuleAvailabilityController;
use App\Http\Controllers\Admin\Hr\JobRequisitionController;
use App\Http\Controllers\Admin\Hr\CandidateController;
use App\Http\Controllers\Admin\Hr\InterviewController;
use App\Http\Controllers\Admin\Hr\OfferController;
use App\Http\Controllers\Admin\Hr\AssetController;
use App\Http\Controllers\Admin\Hr\PerformanceController;
use App\Http\Controllers\Admin\Hr\HrReportController;

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
Route::post('new{data}',    [AuthController::class, 'newData'])->middleware('throttle:15,1');

/*
 * Reached from the login screen before anyone holds a token, so it stays open
 * — but it confirms whether an employee code exists and answers with the
 * company and unit behind it, which is an enumeration oracle over a small,
 * sequential code space. Throttled for that reason; see checkEmpCode() for the
 * matching narrowing of what it returns.
 */
Route::get('/check-emp-code/{code}', [AuthController::class, 'checkEmpCode'])
    ->middleware('throttle:10,1');

/*
 * Appointment endpoints are staff-only.
 *
 * These three sat here unauthenticated. getAppointment() scopes its query from
 * auth('api')->user(), so an anonymous caller matched none of the role branches
 * and fell through to an attacker-controlled `elseif ($request->company_code)`
 * — omit the parameter, or pass company_code=all, and the query came back
 * unscoped: every appointment in every company, serialised with full PII.
 * No page submits these anonymously; the frontend is entirely behind
 * ProtectedRoute and sends a bearer token on all three.
 *
 * admin,agent mirrors /appointment/update, which was already gated this way.
 */
Route::middleware(['jwt.auth', 'role:admin,agent'])->group(function () {
    Route::post('/appointment', [UserController::class, 'appointmentStore']);
    Route::get('/appointment', [UserController::class, 'getAppointment']);
    Route::get('/appointment/check-emp-code', [UserController::class, 'checkEmployeeCode']);
});

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

    // Centralized enterprise authorization API. Management operations are
    // protected by canonical permissions; shadow mode preserves existing admin
    // access while differences are audited during the staged cutover.
    Route::prefix('v1/authorization')->group(function () {
        Route::get('me', [V1AuthorizationController::class, 'me']);
        Route::post('check', [V1AuthorizationController::class, 'check'])->middleware('throttle:120,1');
        Route::post('check-batch', [V1AuthorizationController::class, 'checkBatch'])->middleware('throttle:60,1');
        Route::post('simulate', [V1AuthorizationController::class, 'simulate'])
            ->middleware('permission:admin.authorization.simulate');
        Route::get('flags', [V1AuthorizationController::class, 'flags']);
        Route::put('flags', [V1AuthorizationController::class, 'updateFlags'])
            ->middleware('permission:admin.authorization.configure');

        Route::get('audit', [V1AuthorizationAuditController::class, 'index'])
            ->middleware('permission:admin.authorization.audit.read');
        Route::get('analytics', [V1AuthorizationAuditController::class, 'analytics'])
            ->middleware('permission:admin.authorization.analytics.read');
    });

    Route::prefix('v1/permissions')->group(function () {
        Route::get('/', [V1PermissionController::class, 'index'])->middleware('permission:admin.permission.read');
        Route::post('/', [V1PermissionController::class, 'store'])->middleware('permission:admin.permission.create');
        Route::patch('{permission}', [V1PermissionController::class, 'update'])->middleware('permission:admin.permission.update');
    });

    Route::prefix('v1/roles')->group(function () {
        Route::get('/', [V1EnterpriseRoleController::class, 'index'])->middleware('permission:admin.role.read');
        Route::post('/', [V1EnterpriseRoleController::class, 'store'])->middleware('permission:admin.role.create');
        Route::get('{role}', [V1EnterpriseRoleController::class, 'show'])->middleware('permission:admin.role.read');
        Route::patch('{role}', [V1EnterpriseRoleController::class, 'update'])->middleware('permission:admin.role.update');
        Route::delete('{role}', [V1EnterpriseRoleController::class, 'destroy'])->middleware('permission:admin.role.delete');
        Route::post('{role}/clone', [V1EnterpriseRoleController::class, 'clone'])->middleware('permission:admin.role.clone');
        Route::post('{role}/assignments', [V1EnterpriseRoleController::class, 'assign'])->middleware('permission:admin.role.assign');
        Route::post('{role}/inheritance', [V1EnterpriseRoleController::class, 'inherit'])->middleware('permission:admin.role.update');
        Route::delete('{role}/inheritance/{parentRole}', [V1EnterpriseRoleController::class, 'removeInheritance'])->middleware('permission:admin.role.update');
    });

    Route::prefix('v1/policies')->group(function () {
        Route::get('/', [V1PolicyController::class, 'index'])->middleware('permission:admin.policy.read');
        Route::post('/', [V1PolicyController::class, 'store'])->middleware('permission:admin.policy.create');
        Route::get('{policy}', [V1PolicyController::class, 'show'])->middleware('permission:admin.policy.read');
        Route::patch('{policy}', [V1PolicyController::class, 'update'])->middleware('permission:admin.policy.update');
        Route::post('{policy}/publish', [V1PolicyController::class, 'publish'])->middleware('permission:admin.policy.publish');
        Route::post('{policy}/rollback', [V1PolicyController::class, 'rollback'])->middleware('permission:admin.policy.rollback');
    });

    Route::prefix('v1/access-requests')->group(function () {
        Route::post('/', [V1AccessRequestController::class, 'store']);
        Route::get('/', [V1AccessRequestController::class, 'index'])->middleware('permission:admin.access_request.read');
        Route::post('{accessRequest}/approve', [V1AccessRequestController::class, 'approve'])->middleware('permission:admin.access_request.approve');
        Route::post('{accessRequest}/reject', [V1AccessRequestController::class, 'reject'])->middleware('permission:admin.access_request.approve');
        Route::post('{accessRequest}/revoke', [V1AccessRequestController::class, 'revoke'])->middleware('permission:admin.access_request.revoke');
    });

    Route::prefix('v1/authorization')->group(function () {
        Route::get('delegations', [V1AccessLifecycleController::class, 'delegations'])->middleware('permission:admin.delegation.manage');
        Route::post('delegations', [V1AccessLifecycleController::class, 'createDelegation'])->middleware('permission:admin.delegation.manage');
        Route::post('delegations/{id}/revoke', [V1AccessLifecycleController::class, 'revokeDelegation'])->whereNumber('id')->middleware('permission:admin.delegation.manage');
        Route::get('emergency-grants', [V1AccessLifecycleController::class, 'emergencyGrants'])->middleware('permission:admin.emergency_access.approve');
        Route::post('emergency-grants', [V1AccessLifecycleController::class, 'createEmergencyGrant'])->middleware('permission:admin.emergency_access.approve');
        Route::post('emergency-grants/{id}/revoke', [V1AccessLifecycleController::class, 'revokeEmergencyGrant'])->whereNumber('id')->middleware('permission:admin.emergency_access.approve');
    });

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
        Route::get('types',  [V1DocumentController::class, 'types'])->middleware('permission:document.file.read');
        Route::get('health', [V1DocumentController::class, 'health']);
        Route::get('/',      [V1DocumentController::class, 'index'])->middleware('permission:document.file.read');
        Route::get('{id}',   [V1DocumentController::class, 'show'])->whereNumber('id')->middleware('permission:document.file.read');
        Route::get('{id}/versions', [V1DocumentController::class, 'versions'])->whereNumber('id')->middleware('permission:document.file.read');

        Route::middleware('throttle:30,1')->group(function () {
            Route::post('upload', [V1DocumentController::class, 'store'])->middleware('permission:document.file.upload');
            Route::post('{id}/replace', [V1DocumentController::class, 'replace'])->whereNumber('id')->middleware('permission:document.file.update');
        });

        Route::middleware('throttle:60,1')->group(function () {
            Route::post('{id}/view-url', [V1DocumentController::class, 'viewUrl'])->whereNumber('id')->middleware('permission:document.file.read');
            Route::post('{id}/download-url', [V1DocumentController::class, 'downloadUrl'])->whereNumber('id')->middleware('permission:document.file.download');
        });

        Route::delete('{id}', [V1DocumentController::class, 'destroy'])->whereNumber('id')->middleware('permission:document.file.delete');
        Route::post('{id}/restore', [V1DocumentController::class, 'restore'])->whereNumber('id')->middleware('permission:document.file.restore');
    });

    // Appointment Details: saved before any document can be attached, so the
    // upload step always has a real database id to work with.
    Route::group(['prefix' => 'v1/appointments'], function () {
        Route::post('/', [V1AppointmentController::class, 'store'])->middleware(['throttle:30,1', 'permission:hr.appointment.create']);
        Route::get('{appointmentId}', [V1AppointmentController::class, 'show'])->whereNumber('appointmentId')->middleware('permission:hr.appointment.read');
        Route::put('{appointmentId}', [V1AppointmentController::class, 'update'])->whereNumber('appointmentId')->middleware('permission:hr.appointment.update');
        Route::patch('{appointmentId}', [V1AppointmentController::class, 'update'])->whereNumber('appointmentId')->middleware('permission:hr.appointment.update');
        Route::post('{appointmentId}/complete', [V1AppointmentController::class, 'complete'])->whereNumber('appointmentId')->middleware('permission:hr.appointment.approve');

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
            Route::post('store', [AdminController::class, 'storeDepartment'])->middleware('permission:hr.department.create');
            Route::put('update/{id}', [AdminController::class, 'updateDepartment'])->middleware('permission:hr.department.update');
            Route::delete('delete/{id}', [AdminController::class, 'deleteDepartment'])->middleware('permission:hr.department.delete');
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
            Route::get('get', [UserController::class, 'index'])->middleware('permission:hr.employee.read');
            Route::get('show/{id}', [UserController::class, 'show'])->middleware('permission:hr.employee.read');
            Route::get('import-columns', [UserController::class, 'importColumns']);
            Route::post('store', [UserController::class, 'store'])->middleware('permission:hr.employee.create');
            Route::put('edit/{id}', [UserController::class, 'update'])->middleware('permission:hr.employee.update');
            Route::get('delete/{id}', [UserController::class, 'destroy'])->middleware('permission:hr.employee.delete');
            Route::post('delete-multiple', [UserController::class, 'destroyMultiple'])->middleware('permission:hr.employee.delete');
            Route::post('import', [UserController::class, 'import'])->middleware('permission:hr.employee.import');
            Route::post('import-account-detail', [UserController::class, 'importAccountDetail'])->middleware('permission:hr.employee.import');
        });
        Route::group(["prefix" => "attendance"], function () {
            Route::get('grid', [AttendanceController::class, 'grid'])->middleware('permission:hr.attendance.read');
            Route::post('cell', [AttendanceController::class, 'upsertCell'])->middleware('permission:hr.attendance.update');
            Route::post('import', [AttendanceController::class, 'bulkImport'])->middleware('permission:hr.attendance.import');
        });
        Route::group(["prefix" => "shifts"], function () {
            Route::get('get', [ShiftController::class, 'index'])->middleware('permission:hr.shift.read');
            Route::post('store', [ShiftController::class, 'store'])->middleware('permission:hr.shift.create');
            Route::put('update/{id}', [ShiftController::class, 'update'])->middleware('permission:hr.shift.update');
            Route::delete('delete/{id}', [ShiftController::class, 'destroy'])->middleware('permission:hr.shift.delete');
            Route::post('assign', [ShiftController::class, 'assign'])->middleware('permission:hr.shift.assign');
        });
        // Lets the client leave a module out of the navigation rather than
        // offer a menu item that can only fail. No permission gate: it reports
        // what exists, not what the caller may do.
        Route::get('modules', [ModuleAvailabilityController::class, 'index']);

        // Gated on schema, not just permission: the thirteen HR tables are not
        // in production yet, and without this every route below is a 500.
        Route::group(["prefix" => "hr", "middleware" => "module.schema:hr"], function () {
            Route::get('dashboard', [HrDashboardController::class, 'index'])->middleware('permission:hr.dashboard.read');

            Route::group(["prefix" => "requisitions"], function () {
                Route::get('get', [JobRequisitionController::class, 'index'])->middleware('permission:hr.requisition.read');
                Route::get('show/{id}', [JobRequisitionController::class, 'show'])->middleware('permission:hr.requisition.read');
                Route::post('store', [JobRequisitionController::class, 'store'])->middleware('permission:hr.requisition.create');
                Route::put('update/{id}', [JobRequisitionController::class, 'update'])->middleware('permission:hr.requisition.update');
                Route::delete('delete/{id}', [JobRequisitionController::class, 'destroy'])->middleware('permission:hr.requisition.delete');
                Route::post('approve/{id}', [JobRequisitionController::class, 'approve'])->middleware('permission:hr.requisition.approve');
                Route::post('publish/{id}', [JobRequisitionController::class, 'publish'])->middleware('permission:hr.requisition.publish');
            });

            Route::group(["prefix" => "candidates"], function () {
                Route::get('get', [CandidateController::class, 'index'])->middleware('permission:hr.candidate.read');
                Route::get('pipeline', [CandidateController::class, 'pipeline'])->middleware('permission:hr.candidate.read');
                Route::get('show/{id}', [CandidateController::class, 'show'])->middleware('permission:hr.candidate.read');
                Route::post('store', [CandidateController::class, 'store'])->middleware('permission:hr.candidate.create');
                Route::put('update/{id}', [CandidateController::class, 'update'])->middleware('permission:hr.candidate.update');
                Route::delete('delete/{id}', [CandidateController::class, 'destroy'])->middleware('permission:hr.candidate.delete');
                Route::post('move-stage/{id}', [CandidateController::class, 'moveStage'])->middleware('permission:hr.candidate.move_stage');
            });

            Route::group(["prefix" => "interviews"], function () {
                Route::get('get', [InterviewController::class, 'index'])->middleware('permission:hr.interview.read');
                Route::get('show/{id}', [InterviewController::class, 'show'])->middleware('permission:hr.interview.read');
                Route::post('store', [InterviewController::class, 'store'])->middleware('permission:hr.interview.create');
                Route::put('update/{id}', [InterviewController::class, 'update'])->middleware('permission:hr.interview.update');
                Route::delete('delete/{id}', [InterviewController::class, 'destroy'])->middleware('permission:hr.interview.delete');
                Route::post('reschedule/{id}', [InterviewController::class, 'reschedule'])->middleware('permission:hr.interview.update');
                Route::post('feedback/{id}', [InterviewController::class, 'feedback'])->middleware('permission:hr.interview.feedback');
            });

            Route::group(["prefix" => "offers"], function () {
                Route::get('get', [OfferController::class, 'index'])->middleware('permission:hr.offer.read');
                Route::get('show/{id}', [OfferController::class, 'show'])->middleware('permission:hr.offer.read');
                Route::post('store', [OfferController::class, 'store'])->middleware('permission:hr.offer.create');
                Route::put('update/{id}', [OfferController::class, 'update'])->middleware('permission:hr.offer.update');
                Route::delete('delete/{id}', [OfferController::class, 'destroy'])->middleware('permission:hr.offer.update');
                Route::post('approve/{id}', [OfferController::class, 'approve'])->middleware('permission:hr.offer.approve');
                Route::post('release/{id}', [OfferController::class, 'release'])->middleware('permission:hr.offer.release');
                Route::post('respond/{id}', [OfferController::class, 'respond'])->middleware('permission:hr.offer.update');
            });

            Route::group(["prefix" => "assets"], function () {
                Route::get('get', [AssetController::class, 'index'])->middleware('permission:hr.asset.read');
                Route::get('dashboard', [AssetController::class, 'dashboard'])->middleware('permission:hr.asset.read');
                Route::get('show/{id}', [AssetController::class, 'show'])->middleware('permission:hr.asset.read');
                Route::post('store', [AssetController::class, 'store'])->middleware('permission:hr.asset.create');
                Route::put('update/{id}', [AssetController::class, 'update'])->middleware('permission:hr.asset.update');
                Route::delete('delete/{id}', [AssetController::class, 'destroy'])->middleware('permission:hr.asset.delete');
                Route::post('allocate/{id}', [AssetController::class, 'allocate'])->middleware('permission:hr.asset.allocate');
                Route::post('return/{id}', [AssetController::class, 'returnAsset'])->middleware('permission:hr.asset.return');
                Route::post('transfer/{id}', [AssetController::class, 'transfer'])->middleware('permission:hr.asset.transfer');
            });

            Route::group(["prefix" => "performance"], function () {
                Route::get('dashboard', [PerformanceController::class, 'dashboard'])->middleware('permission:hr.performance.read');

                Route::get('cycles/get', [PerformanceController::class, 'cycles'])->middleware('permission:hr.performance.read');
                Route::post('cycles/store', [PerformanceController::class, 'storeCycle'])->middleware('permission:hr.performance.create');
                Route::put('cycles/update/{id}', [PerformanceController::class, 'updateCycle'])->middleware('permission:hr.performance.update');
                Route::delete('cycles/delete/{id}', [PerformanceController::class, 'destroyCycle'])->middleware('permission:hr.performance.update');

                Route::get('goals/get', [PerformanceController::class, 'goals'])->middleware('permission:hr.performance.read');
                Route::post('goals/store', [PerformanceController::class, 'storeGoal'])->middleware('permission:hr.performance.create');
                Route::put('goals/update/{id}', [PerformanceController::class, 'updateGoal'])->middleware('permission:hr.performance.update');
                Route::delete('goals/delete/{id}', [PerformanceController::class, 'destroyGoal'])->middleware('permission:hr.performance.update');

                Route::get('reviews/get', [PerformanceController::class, 'reviews'])->middleware('permission:hr.performance.read');
                Route::post('reviews/store', [PerformanceController::class, 'storeReview'])->middleware('permission:hr.performance.review');
                Route::put('reviews/update/{id}', [PerformanceController::class, 'updateReview'])->middleware('permission:hr.performance.review');
            });

            Route::group(["prefix" => "reports"], function () {
                Route::get('generate', [HrReportController::class, 'generate'])->middleware('permission:hr.report.read');
            });
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
        Route::post('/trial-form/store', [UserController::class, 'postTrialForm'])->middleware('permission:recruitment.trial_form.create');
        Route::get('/trial-form/list', [UserController::class, 'getTrialForms'])->middleware('permission:recruitment.trial_form.read');
        Route::post('/trial-form/update/{id}', [UserController::class, 'updateTrialForm'])->middleware('permission:recruitment.trial_form.update');
    });

    // Admin manages every employee's payslips; employees view their own (SalariesSlipController scopes by role)
    Route::middleware('role:admin,employee')->group(function () {
        Route::group(["prefix" => "salary-slip"], function(){
            Route::get('get', [SalariesSlipController::class, 'index'])->middleware('permission:payroll.payslip.read');
            Route::get('show/{id}', [SalariesSlipController::class, 'show'])->middleware('permission:payroll.payslip.read');
        });
    });

    Route::get('dashboard', [UserController::class, 'dashboard'])->middleware('role:employee');

    // Both the agent portal and the admin Appointments page use this to edit a candidate
    Route::post('/appointment/update', [UserController::class, 'updateUser'])->middleware('role:admin,agent');

    Route::get('/agent/candidates', [UserController::class, 'getAgentCandidates'])->middleware('role:agent');
});
