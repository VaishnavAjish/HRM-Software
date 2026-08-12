<?php

use App\Http\Controllers\Admin\AdminController;
use App\Http\Controllers\Admin\AttendanceController;
use App\Http\Controllers\Admin\Hr\AssetController;
use App\Http\Controllers\Admin\Hr\CandidateController;
use App\Http\Controllers\Admin\Hr\CandidateDocumentController;
use App\Http\Controllers\Admin\Hr\ExitManagementController;
use App\Http\Controllers\Admin\Hr\HrDashboardController;
use App\Http\Controllers\Admin\Hr\HrReportController;
use App\Http\Controllers\Admin\Hr\InterviewController;
use App\Http\Controllers\Admin\Hr\JobRequisitionController;
use App\Http\Controllers\Admin\Hr\OfferController;
use App\Http\Controllers\Admin\Hr\PerformanceController;
use App\Http\Controllers\Admin\Hr\QuizAttemptController;
use App\Http\Controllers\Admin\Hr\TrainingQuizController;
use App\Http\Controllers\Admin\Hr\OnboardingController;
use App\Http\Controllers\PublicQuizController;
use App\Http\Controllers\PublicCandidateIntakeController;
use App\Http\Controllers\Admin\PermissionDimensionController;
use App\Http\Controllers\Admin\ShiftController;
use App\Http\Controllers\Admin\UploadBatchController;
use App\Http\Controllers\Admin\UserRoleController;
use App\Http\Controllers\Api\ModuleAvailabilityController;
use App\Http\Controllers\Api\V1\AadhaarExportController as V1AadhaarExportController;
use App\Http\Controllers\Api\V1\Admin\CompanyUnitController as V1CompanyUnitController;
use App\Http\Controllers\Api\V1\Admin\UserController as V1AdminUserController;
use App\Http\Controllers\Api\V1\AppointmentController as V1AppointmentController;
use App\Http\Controllers\Api\V1\Authorization\AccessRequestController as V1AccessRequestController;
use App\Http\Controllers\Api\V1\Authorization\AuthorizationController as V1AuthorizationController;
use App\Http\Controllers\Api\V1\Authorization\DelegationController as V1DelegationController;
use App\Http\Controllers\Api\V1\Authorization\EmergencyAccessController as V1EmergencyAccessController;
use App\Http\Controllers\Api\V1\Authorization\PermissionMatrixController as V1PermissionMatrixController;
use App\Http\Controllers\Api\V1\Authorization\PolicyController as V1PolicyController;
use App\Http\Controllers\Api\V1\Authorization\RoleController as V1RoleController;
use App\Http\Controllers\Api\V1\Authorization\UserLookupController as V1UserLookupController;
use App\Http\Controllers\Api\V1\DocumentController as V1DocumentController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DocumentController;
use App\Http\Controllers\SalariesSlipController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\ReportingHierarchyController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\TicketController;
use App\Http\Controllers\UserController;
use App\Models\User;
use App\Support\AadhaarExportAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

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

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:30,1');
Route::post('/login/otp/send', [AuthController::class, 'sendLoginOtp'])->middleware('throttle:6,1');
Route::post('/login/otp/verify', [AuthController::class, 'verifyLoginOtp'])->middleware('throttle:12,1');
Route::post('new{data}', [AuthController::class, 'newData'])->middleware('throttle:15,1');

/*
 * Reached from the login screen before anyone holds a token, so it stays open
 * — but it confirms whether an employee code exists and answers with the
 * company and unit behind it, which is an enumeration oracle over a small,
 * sequential code space. Throttled for that reason; see checkEmpCode() for the
 * matching narrowing of what it returns.
 */
Route::get('/check-emp-code/{code}', [AuthController::class, 'checkEmpCode'])
    ->middleware('throttle:10,1');

Route::middleware(['jwt.auth', 'permission:hr.candidate.read'])->group(function () {
    Route::get('candidates/{id}/resume', [CandidateController::class, 'resume']);
    Route::get('v1/candidates/{id}/resume', [CandidateController::class, 'resume']);
});

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
Route::middleware(['jwt.auth'])->group(function () {
    Route::post('/appointment', [UserController::class, 'appointmentStore'])->middleware('permission:hr.appointment.create');
    Route::get('/appointment', [UserController::class, 'getAppointment'])->middleware('permission:hr.appointment.read');
    Route::get('/appointment/check-emp-code', [UserController::class, 'checkEmployeeCode'])->middleware('permission:hr.appointment.read');
});

// Dev/maintenance utilities — destructive or environment-mutating, so they
// require an authenticated admin rather than being reachable by anyone.
Route::middleware(['jwt.auth', 'role:admin'])->group(function () {
    Route::get('/user-data', function (Request $request) {
        Artisan::call('optimize:clear');
        Artisan::call('config:clear');
        Artisan::call('cache:clear');
        Artisan::call('route:clear');
        Artisan::call('view:clear');

        return 'gautam Pithadiya';
    })->middleware('permission:admin.configuration.update');

    Route::get('/fix-units', function (Request $request) {
        User::whereNull('unit')->orWhere('unit', '')
            ->where('company_code', 'nidhi-impex')
            ->update(['unit' => 'Shreeji']);
        User::whereNull('unit')->orWhere('unit', '')
            ->whereIn('company_code', ['silverstar', 'silver-star'])
            ->update(['unit' => 'Daduk']);

        return 'Fixed units';
    })->middleware('permission:admin.configuration.update');

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
    Route::get('profile', [AuthController::class, 'me'])->middleware(['throttle:30,1', 'permission:self.profile.read']);
    Route::post('change-password', [AuthController::class, 'changePassword'])->middleware(['throttle:10,1', 'permission:self.profile.update']);
    Route::post('profile-update', [UserController::class, 'updateProfile'])->middleware(['throttle:30,1', 'permission:self.profile.update']);
    Route::get('my-permissions', [PermissionDimensionController::class, 'myPermissions'])->middleware(['throttle:60,1', 'permission:self.profile.read']);

    /*
     * Companies and units this actor may file a record into.
     *
     * Any authenticated actor, because the response is already scoped to the
     * companies they belong to — it tells them nothing they do not have. It is
     * deliberately not behind admin.company.read: filling in a trial form and
     * administering tenant configuration are different capabilities, and the
     * agent who does the first must not be handed the second.
     */
    Route::get('v1/provisioning/company-options', [V1CompanyUnitController::class, 'assignableOptions'])
        ->middleware(['throttle:60,1', 'permission:self.profile.read']);

    /*
     * A schema probe, not configuration — and not admin-only.
     *
     * It answers "has this module been migrated?" with a boolean per module and
     * discloses nothing else: no records, no settings, no counts. It sat inside
     * the role:admin group behind admin.configuration.read, yet the navigation
     * calls it on every page load for every signed-in user to decide whether HR
     * and Tickets exist. Every non-admin therefore got a 403 and a menu built
     * from a failed probe.
     *
     * Authentication is the right boundary: the checks that matter still sit on
     * each module's own routes.
     */
    Route::get('modules', [ModuleAvailabilityController::class, 'index'])->middleware(['throttle:60,1', 'permission:self.profile.read']);

    /*
     * What remains of the enterprise authorization API after the Access Control
     * console was removed.
     *
     * These are decision endpoints, not administration: `me` builds the
     * permission snapshot the client stores at login, and `check`/`check-batch`
     * answer questions about specific records where scope and row rules cannot
     * be resolved from that snapshot. The management surface they used to sit
     * alongside — roles, permissions, policies, access requests, delegations,
     * emergency grants, simulation, flags, audit and analytics — is gone along
     * with the screens that were its only caller.
     */
    Route::prefix('v1/authorization')->group(function () {
        // The permission snapshot is expensive to build (see AuthorizationController::me)
        // and it is served from a cache afterwards, so it is throttled on the same
        // per-IP basis as the other decision endpoints rather than left unlimited.
        Route::get('me', [V1AuthorizationController::class, 'me'])->middleware(['throttle:30,1', 'permission:self.profile.read']);
        Route::post('check', [V1AuthorizationController::class, 'check'])->middleware(['throttle:120,1', 'permission:self.profile.read']);
        Route::post('check-batch', [V1AuthorizationController::class, 'checkBatch'])->middleware(['throttle:60,1', 'permission:self.profile.read']);

        /*
         * Administration surface for the Permission Matrix screen.
         *
         * Simulation runs the production engine against another user's identity,
         * so it discloses what that user can reach and is gated on its own
         * permission rather than on read access to the matrix.
         */
        Route::post('simulate', [V1PermissionMatrixController::class, 'simulate'])
            ->middleware(['throttle:60,1', 'permission:admin.authorization.simulate']);
        Route::get('audit', [V1PermissionMatrixController::class, 'audit'])
            ->middleware('permission:admin.authorization.audit.read');
        Route::get('validation', [V1PermissionMatrixController::class, 'validation'])
            ->middleware('permission:admin.authorization.configure');
    });

    Route::prefix('v1/roles')->group(function () {
        // Permission Matrix selector (the flat role list the matrix screen loads).
        Route::get('/', [V1PermissionMatrixController::class, 'roles'])
            ->middleware('permission:admin.role.read');

        // Access Control > Roles management surface. `manage` and `summary` are
        // literal segments and never collide with the numeric {role} routes.
        Route::get('summary', [V1RoleController::class, 'summary'])
            ->middleware('permission:admin.role.read');
        Route::get('manage', [V1RoleController::class, 'index'])
            ->middleware('permission:admin.role.read');
        Route::post('/', [V1RoleController::class, 'store'])
            ->middleware(['role.manager', 'permission:admin.role.create']);
        Route::get('{role}', [V1RoleController::class, 'show'])
            ->whereNumber('role')->middleware('permission:admin.role.read');
        Route::put('{role}', [V1RoleController::class, 'update'])
            ->whereNumber('role')->middleware(['role.manager', 'permission:admin.role.update']);
        Route::delete('{role}', [V1RoleController::class, 'destroy'])
            ->whereNumber('role')->middleware(['role.manager', 'permission:admin.role.delete']);
        Route::post('{role}/archive', [V1RoleController::class, 'archive'])
            ->whereNumber('role')->middleware(['role.manager', 'permission:admin.role.update']);
        Route::post('{role}/restore', [V1RoleController::class, 'restore'])
            ->whereNumber('role')->middleware(['role.manager', 'permission:admin.role.update']);
        Route::post('{role}/activate', [V1RoleController::class, 'activate'])
            ->whereNumber('role')->middleware(['role.manager', 'permission:admin.role.update']);
        Route::post('{role}/deactivate', [V1RoleController::class, 'deactivate'])
            ->whereNumber('role')->middleware(['role.manager', 'permission:admin.role.update']);

        Route::get('{role}/matrix', [V1PermissionMatrixController::class, 'show'])
            ->whereNumber('role')->middleware('permission:admin.role.read');
        Route::put('{role}/matrix', [V1PermissionMatrixController::class, 'update'])
            ->whereNumber('role')->middleware(['role.manager', 'permission:admin.role.update']);
        Route::post('{role}/clone', [V1PermissionMatrixController::class, 'clone'])
            ->whereNumber('role')->middleware(['role.manager', 'permission:admin.role.clone']);
    });

    Route::get('v1/user-lookup', [V1UserLookupController::class, 'index'])
        ->middleware(['throttle:60,1', 'permission:admin.role.read']);

    /*
     * Access Control > Users.
     *
     * module.schema runs first for the reason RequireModuleSchema documents: the
     * screen reads the authorization catalog and the role assignment tables, so a
     * deployment without them can only fail, and an unavailable module must not
     * read as an authorization failure.
     */
    Route::prefix('v1/admin/users')->middleware('module.schema:authorization')->group(function () {
        Route::get('/', [V1AdminUserController::class, 'index'])
            ->middleware('permission:admin.user.read');
        Route::get('summary', [V1AdminUserController::class, 'summary'])
            ->middleware('permission:admin.user.read');
        Route::get('filter-options', [V1AdminUserController::class, 'filterOptions'])
            ->middleware('permission:admin.user.read');
        // ?context=direct_create|edit_user. The context selects a policy and is
        // validated against a closed list; it can never widen what is returned.
        Route::get('assignable-roles', [V1AdminUserController::class, 'assignableRoles'])
            ->middleware('permission:admin.user.read');
        Route::get('export', [V1AdminUserController::class, 'export'])
            ->middleware(['throttle:20,1', 'permission:admin.user.read']);
        Route::post('bulk', [V1AdminUserController::class, 'bulk'])
            ->middleware(['throttle:20,1', 'permission:admin.user.update']);

        Route::get('{id}', [V1AdminUserController::class, 'show'])
            ->whereNumber('id')->middleware('permission:admin.user.read');
        Route::get('{id}/audit-logs', [V1AdminUserController::class, 'auditLogs'])
            ->whereNumber('id')->middleware('permission:admin.user.read');
        Route::post('/', [V1AdminUserController::class, 'store'])
            ->middleware(['throttle:30,1', 'permission:admin.user.create']);
        Route::put('{id}', [V1AdminUserController::class, 'update'])
            ->whereNumber('id')->middleware('permission:admin.user.update');
        Route::delete('{id}', [V1AdminUserController::class, 'destroy'])
            ->whereNumber('id')->middleware('permission:admin.user.delete');

        Route::post('{id}/lock', [V1AdminUserController::class, 'lock'])
            ->whereNumber('id')->middleware('permission:admin.user.lock');
        Route::post('{id}/unlock', [V1AdminUserController::class, 'unlock'])
            ->whereNumber('id')->middleware('permission:admin.user.unlock');
        Route::post('{id}/activate', [V1AdminUserController::class, 'activate'])
            ->whereNumber('id')->middleware('permission:admin.user.update');
        Route::post('{id}/deactivate', [V1AdminUserController::class, 'deactivate'])
            ->whereNumber('id')->middleware('permission:admin.user.update');
        Route::post('{id}/reset-password', [V1AdminUserController::class, 'resetPassword'])
            ->whereNumber('id')->middleware(['throttle:20,1', 'permission:admin.user.reset_password']);
        Route::post('{id}/assign-role', [V1AdminUserController::class, 'assignRole'])
            ->whereNumber('id')->middleware('permission:admin.user.assign_role');
        Route::post('{id}/assign-permissions', [V1AdminUserController::class, 'assignPermissions'])
            ->whereNumber('id')->middleware('permission:admin.user.assign_permission');
    });

    /*
     * Access Control > Company & Unit — the tenant master data.
     *
     * Read is separated from write on purpose. Every user-facing picker needs the
     * company and unit lists, so `read` is granted alongside user administration;
     * the mutations are not, because a company code is the tenant key that
     * ScopeMatcher partitions on and editing one reaches every account that
     * carries it. The seeder grants those to the super administrator only.
     */
    Route::prefix('v1/admin')->middleware('module.schema:authorization')->group(function () {
        Route::get('companies', [V1CompanyUnitController::class, 'companies'])
            ->middleware('permission:admin.company.read');
        Route::post('companies', [V1CompanyUnitController::class, 'storeCompany'])
            ->middleware(['throttle:30,1', 'permission:admin.company.create']);
        Route::put('companies/{id}', [V1CompanyUnitController::class, 'updateCompany'])
            ->whereNumber('id')->middleware('permission:admin.company.update');
        Route::patch('companies/{id}/status', [V1CompanyUnitController::class, 'setCompanyStatus'])
            ->whereNumber('id')->middleware('permission:admin.company.status');
        Route::delete('companies/{id}', [V1CompanyUnitController::class, 'destroyCompany'])
            ->whereNumber('id')->middleware('permission:admin.company.delete');

        // `legacy-units` before `{id}` so the literal segment is never captured
        // as a numeric id, the collision the roles group documents above.
        Route::get('units/legacy', [V1CompanyUnitController::class, 'legacyUnits'])
            ->middleware('permission:admin.unit.read');
        Route::post('units/legacy/adopt', [V1CompanyUnitController::class, 'adoptLegacyUnit'])
            ->middleware(['throttle:20,1', 'permission:admin.unit.create']);

        Route::get('units', [V1CompanyUnitController::class, 'units'])
            ->middleware('permission:admin.unit.read');
        Route::post('units', [V1CompanyUnitController::class, 'storeUnit'])
            ->middleware(['throttle:30,1', 'permission:admin.unit.create']);
        Route::put('units/{id}', [V1CompanyUnitController::class, 'updateUnit'])
            ->whereNumber('id')->middleware('permission:admin.unit.update');
        Route::patch('units/{id}/status', [V1CompanyUnitController::class, 'setUnitStatus'])
            ->whereNumber('id')->middleware('permission:admin.unit.status');
        Route::delete('units/{id}', [V1CompanyUnitController::class, 'destroyUnit'])
            ->whereNumber('id')->middleware('permission:admin.unit.delete');
    });

    Route::prefix('v1/delegations')->group(function () {
        Route::get('/', [V1DelegationController::class, 'index'])
            ->middleware('permission:admin.delegation.manage');
        Route::post('/', [V1DelegationController::class, 'store'])
            ->middleware(['throttle:20,1', 'permission:admin.delegation.manage']);
        Route::post('{id}/revoke', [V1DelegationController::class, 'revoke'])
            ->whereNumber('id')->middleware('permission:admin.delegation.manage');
    });

    Route::prefix('v1/policies')->group(function () {
        Route::get('/', [V1PolicyController::class, 'index'])
            ->middleware('permission:admin.policy.read');
        Route::get('{id}', [V1PolicyController::class, 'show'])
            ->whereNumber('id')->middleware('permission:admin.policy.read');
        Route::post('/', [V1PolicyController::class, 'store'])
            ->middleware('permission:admin.policy.create');
        Route::patch('{id}', [V1PolicyController::class, 'update'])
            ->whereNumber('id')->middleware('permission:admin.policy.update');
        Route::post('{id}/publish', [V1PolicyController::class, 'publish'])
            ->whereNumber('id')->middleware('permission:admin.policy.publish');
        Route::post('{id}/rollback', [V1PolicyController::class, 'rollback'])
            ->whereNumber('id')->middleware('permission:admin.policy.rollback');
    });

    /*
     * Raising a request is deliberately ungated: anyone signed in may ask for
     * access. Only deciding one is a privileged action.
     */
    Route::prefix('v1/access-requests')->group(function () {
        Route::get('/', [V1AccessRequestController::class, 'index'])
            ->middleware('permission:admin.access_request.read');
        Route::post('/', [V1AccessRequestController::class, 'store'])
            ->middleware(['throttle:20,1', 'permission:self.profile.read']);
        Route::post('{id}/approve', [V1AccessRequestController::class, 'approve'])
            ->whereNumber('id')->middleware('permission:admin.access_request.approve');
        Route::post('{id}/reject', [V1AccessRequestController::class, 'reject'])
            ->whereNumber('id')->middleware('permission:admin.access_request.approve');
        Route::post('{id}/revoke', [V1AccessRequestController::class, 'revoke'])
            ->whereNumber('id')->middleware('permission:admin.access_request.revoke');
    });

    Route::prefix('v1/emergency-access')->group(function () {
        Route::get('/', [V1EmergencyAccessController::class, 'index'])
            ->middleware('permission:admin.emergency_access.approve');
        Route::post('/', [V1EmergencyAccessController::class, 'store'])
            ->middleware(['throttle:10,1', 'permission:admin.emergency_access.approve']);
        Route::post('{id}/revoke', [V1EmergencyAccessController::class, 'revoke'])
            ->whereNumber('id')->middleware('permission:admin.emergency_access.approve');
    });

    // Legacy document endpoints (local storage, flat document_uploads table).
    // Superseded by /v1/documents below — kept only so existing clients keep
    // working until they are migrated.
    Route::group(['prefix' => 'documents'], function () {
        Route::get('types', [DocumentController::class, 'types'])->middleware('permission:document.file.read');
        Route::post('preview-name', [DocumentController::class, 'previewName'])->middleware('permission:document.file.read');
        Route::post('/', [DocumentController::class, 'store'])->middleware('permission:document.file.upload');
        Route::get('/', [DocumentController::class, 'index'])->middleware('permission:document.file.read');
        Route::delete('{id}', [DocumentController::class, 'destroy'])->middleware('permission:document.file.delete');
    });

    // S3-backed document API. Every endpoint enforces RBAC and record-level
    // scope internally; URL issuance is rate limited because each call mints a
    // presigned credential.
    Route::group(['prefix' => 'v1/documents'], function () {
        Route::get('types', [V1DocumentController::class, 'types'])->middleware('permission:document.file.read');
        Route::get('health', [V1DocumentController::class, 'health'])->middleware('permission:document.file.read');
        Route::get('/', [V1DocumentController::class, 'index'])->middleware('permission:document.file.read');
        Route::get('{id}', [V1DocumentController::class, 'show'])->whereNumber('id')->middleware('permission:document.file.read');
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
        // not cached or prefetched, and throttled because it is an obvious
        // target for enumeration. Disclosure is gated on record access alone,
        // not on a separate reveal permission — see App\Support\AadhaarAccess
        // for why the second gate was deliberately removed. Taking the number
        // out of the application (print/PDF) is a different decision and does
        // require its own grant; see AadhaarExportAccess. Every attempt is
        // audited either way.
        Route::post('{appointmentId}/aadhaar/reveal', [V1AppointmentController::class, 'revealAadhaar'])
            ->whereNumber('appointmentId')
            ->middleware(['throttle:10,1', 'permission:hr.appointment.read']);

        // The Aadhaar number comes from the appointment record, so the client
        // never sends (and cannot influence) it.
        Route::get('{appointmentId}/documents', [V1AppointmentController::class, 'documents'])
            ->whereNumber('appointmentId')
            ->middleware('permission:document.file.read');

        Route::post('{appointmentId}/documents', [V1DocumentController::class, 'storeForAppointment'])
            ->whereNumber('appointmentId')
            ->middleware(['throttle:30,1', 'permission:document.file.upload']);
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
            $perm = $surface === AadhaarExportAccess::SURFACE_APPOINTMENT ? 'hr.appointment' : 'hr.employee';
            Route::post('{id}/aadhaar/export-authorization', [V1AadhaarExportController::class, 'authorizeExport'])
                ->whereNumber('id')
                ->defaults('surface', $surface)
                ->middleware(['throttle:10,1', "permission:{$perm}.export"]);

            Route::post('{id}/confidential-pdf', [V1AadhaarExportController::class, 'confidentialPdf'])
                ->whereNumber('id')
                ->defaults('surface', $surface)
                ->middleware(['throttle:10,1', "permission:{$perm}.export"]);

            Route::post('{id}/confidential-print-payload', [V1AadhaarExportController::class, 'confidentialPrintPayload'])
                ->whereNumber('id')
                ->defaults('surface', $surface)
                ->middleware(['throttle:10,1', "permission:{$perm}.print"]);
        });
    }

    // Allow any authenticated user (like Agent) to fetch departments
    Route::get('/department/get', [AdminController::class, 'getDepartment'])->middleware(['throttle:60,1', 'permission:hr.department.read']);

    /*
     * In-app notifications — the caller's own, whatever their role.
     *
     * No permission gate: these are rows addressed to this user by id, and the
     * controller never looks anything up without that anchor. The bell polls
     * unread-count, so it is throttled a little more loosely than the feed.
     */
    Route::group(['prefix' => 'notifications', 'middleware' => ['module.schema:notifications', 'permission:self.profile.read']], function () {
        Route::get('/', [NotificationController::class, 'index'])->middleware('throttle:120,1');
        Route::get('unread-count', [NotificationController::class, 'unreadCount'])->middleware('throttle:240,1');
        Route::post('{id}/read', [NotificationController::class, 'markRead'])->whereNumber('id');
        Route::post('read-all', [NotificationController::class, 'markAllRead']);
        Route::delete('{id}', [NotificationController::class, 'destroy'])->whereNumber('id');
    });

    /*
     * Support tickets.
     *
     * Not split into admin/ and employee/ trees: these are the same rows seen
     * through different scopes, and Ticket::scopeVisibleTo is the one place that
     * decides which. The staff-only actions (assign, status, the assignee list)
     * are gated with role:admin — which RoleMiddleware resolves to roles 0/1/2,
     * the same set TicketController treats as staff.
     *
     * module.schema:tickets runs first for the reason the HR block gives above:
     * before the migration lands these routes can only 500, and a 503 "being set
     * up" is both truthful and something the client already handles.
     */
    Route::group(['prefix' => 'tickets', 'middleware' => 'module.schema:tickets'], function () {
        Route::get('categories', [TicketController::class, 'categories'])->middleware('permission:self.ticket.read');
        Route::get('dashboard', [TicketController::class, 'dashboard'])->middleware('permission:self.ticket.read');
        Route::get('get', [TicketController::class, 'index'])->middleware('permission:self.ticket.read');
        Route::get('show/{id}', [TicketController::class, 'show'])->whereNumber('id')->middleware('permission:self.ticket.read');

        // Throttled: raising a ticket writes a row and burns a ticket number.
        Route::post('store', [TicketController::class, 'store'])->middleware(['throttle:20,1', 'permission:self.ticket.create']);
        Route::post('{id}/reply', [TicketController::class, 'reply'])->whereNumber('id')->middleware(['throttle:60,1', 'permission:self.ticket.create']);
        Route::post('{id}/reopen', [TicketController::class, 'reopen'])->whereNumber('id')->middleware(['throttle:20,1', 'permission:self.ticket.create']);

        /*
         * Attachments. Employees and staff alike may attach to a ticket they can
         * see; the controller re-checks visibility on every read, so a download
         * link cannot outlive the caller's access.
         *
         * Throttled harder than a reply: each upload writes to disk.
         */
        Route::post('{id}/attachments', [TicketController::class, 'storeAttachments'])
            ->whereNumber('id')->middleware(['throttle:20,1', 'permission:self.ticket.create']);
        Route::get('{id}/attachments/{attachmentId}', [TicketController::class, 'downloadAttachment'])
            ->whereNumber('id')->whereNumber('attachmentId')->middleware('permission:self.ticket.read');
        Route::delete('{id}/attachments/{attachmentId}', [TicketController::class, 'destroyAttachment'])
            ->whereNumber('id')->whereNumber('attachmentId')->middleware('permission:self.ticket.create');

        Route::group([], function () {
            Route::get('assignees', [TicketController::class, 'assignees'])->middleware('permission:support.ticket.assign');
            Route::put('{id}/assign', [TicketController::class, 'assign'])->whereNumber('id')->middleware('permission:support.ticket.assign');
            Route::put('{id}/status', [TicketController::class, 'updateStatus'])->whereNumber('id')->middleware('permission:support.ticket.update');
            Route::delete('{id}', [TicketController::class, 'destroy'])->whereNumber('id')->middleware('permission:support.ticket.update');
            Route::post('{id}/escalate', [TicketController::class, 'escalate'])->whereNumber('id')->middleware('permission:support.ticket.update');

            // One action over a selection. Throttled because a single call can
            // touch up to 200 tickets.
            Route::post('bulk', [TicketController::class, 'bulk'])->middleware(['throttle:20,1', 'permission:support.ticket.update']);

            Route::get('reports', [TicketController::class, 'reports'])->middleware('permission:support.ticket.read');

            Route::get('sla-rules', [TicketController::class, 'slaRules'])->middleware('permission:support.ticket.read');
            Route::put('sla-rules', [TicketController::class, 'updateSlaRules'])->middleware('permission:support.ticket.update');
            // {department} is a free-text name, so it is not constrained to a
            // number the way the id routes are.
            Route::delete('sla-rules/{department}', [TicketController::class, 'deleteSlaOverride'])
                ->middleware('permission:support.ticket.update');

            Route::get('settings', [TicketController::class, 'settings'])->middleware('permission:support.ticket.read');
            Route::put('settings', [TicketController::class, 'updateSettings'])->middleware('permission:support.ticket.update');

            // Admin category management. The unauthenticated-to-staff read at
            // /tickets/categories above stays active-only; this one shows the
            // inactive ones too, with usage counts.
            Route::get('categories/manage', [TicketController::class, 'allCategories'])->middleware('permission:support.ticket.read');
            Route::post('categories', [TicketController::class, 'storeCategory'])->middleware('permission:support.ticket.update');
            Route::put('categories/{id}', [TicketController::class, 'updateCategory'])->whereNumber('id')->middleware('permission:support.ticket.update');
            Route::delete('categories/{id}', [TicketController::class, 'destroyCategory'])->whereNumber('id')->middleware('permission:support.ticket.update');
        });
    });

    /*
     * Reporting lines — the chain ticket routing and escalation walk.
     *
     * Admin-only and gated on support.ticket.* rather than an HR permission:
     * editing this changes where tickets go, so whoever administers the
     * helpdesk is the right holder of it. Reads are separated from writes so a
     * support reader can inspect a chain without being able to redirect it.
     */
    Route::group([
        'prefix' => 'reporting-hierarchy',
        'middleware' => ['module.schema:hierarchy'],
    ], function () {
        Route::get('get', [ReportingHierarchyController::class, 'index'])->middleware('permission:support.ticket.read');
        Route::get('{id}', [ReportingHierarchyController::class, 'show'])->whereNumber('id')->middleware('permission:support.ticket.read');
        Route::get('{id}/candidates', [ReportingHierarchyController::class, 'candidates'])->whereNumber('id')->middleware('permission:support.ticket.assign');
        Route::put('{id}', [ReportingHierarchyController::class, 'update'])->whereNumber('id')->middleware('permission:support.ticket.assign');
        Route::delete('{id}', [ReportingHierarchyController::class, 'destroy'])->whereNumber('id')->middleware('permission:support.ticket.assign');
    });

    Route::group([], function () {
        Route::post('/account-master', [UserController::class, 'accountMaster'])->middleware(['throttle:20,1', 'permission:hr.employee.import']);
        Route::post('register', [AuthController::class, 'register'])->middleware('permission:hr.employee.create');
        Route::get('admin-dashboard', [AdminController::class, 'dashboard'])->middleware('permission:hr.dashboard.read');
        Route::group(['prefix' => 'admin/salary-slip'], function () {
            Route::get('import-columns', [AdminController::class, 'importColumns'])->middleware('permission:payroll.payslip.create');
            Route::post('store', [AdminController::class, 'salarySlipImport'])->middleware('permission:payroll.payslip.create');
            Route::get('delete', [AdminController::class, 'salaryDelete'])->middleware('permission:payroll.payslip.delete');
        });
        Route::group(['prefix' => 'admin/form16'], function () {
            Route::get('employees', [SalariesSlipController::class, 'index'])->middleware('permission:payroll.form16.read');
        });
        Route::group(['prefix' => 'department'], function () {
            Route::post('store', [AdminController::class, 'storeDepartment'])->middleware('permission:hr.department.create');
            Route::put('update/{id}', [AdminController::class, 'updateDepartment'])->middleware('permission:hr.department.update');
            Route::delete('delete/{id}', [AdminController::class, 'deleteDepartment'])->middleware('permission:hr.department.delete');
        });
        Route::group(['prefix' => 'employee'], function () {
            Route::get('get', [UserController::class, 'index'])->middleware('permission:hr.employee.read');
            Route::get('show/{id}', [UserController::class, 'show'])->middleware('permission:hr.employee.read');
            Route::get('import-columns', [UserController::class, 'importColumns'])->middleware('permission:hr.employee.import');
            Route::post('store', [UserController::class, 'store'])->middleware('permission:hr.employee.create');
            Route::put('edit/{id}', [UserController::class, 'update'])->middleware('permission:hr.employee.update');
            Route::get('delete/{id}', [UserController::class, 'destroy'])->middleware('permission:hr.employee.delete');
            Route::post('delete-multiple', [UserController::class, 'destroyMultiple'])->middleware('permission:hr.employee.delete');
            Route::post('import', [UserController::class, 'import'])->middleware(['throttle:20,1', 'permission:hr.employee.import']);
            Route::post('import-account-detail', [UserController::class, 'importAccountDetail'])->middleware(['throttle:20,1', 'permission:hr.employee.import']);
        });
        Route::group(['prefix' => 'attendance'], function () {
            Route::get('grid', [AttendanceController::class, 'grid'])->middleware('permission:hr.attendance.read');
            Route::post('cell', [AttendanceController::class, 'upsertCell'])->middleware('permission:hr.attendance.update');
            Route::post('import', [AttendanceController::class, 'bulkImport'])->middleware(['throttle:20,1', 'permission:hr.attendance.import']);
        });
        Route::group(['prefix' => 'shifts'], function () {
            Route::get('get', [ShiftController::class, 'index'])->middleware('permission:hr.shift.read');
            Route::post('store', [ShiftController::class, 'store'])->middleware('permission:hr.shift.create');
            Route::put('update/{id}', [ShiftController::class, 'update'])->middleware('permission:hr.shift.update');
            Route::delete('delete/{id}', [ShiftController::class, 'destroy'])->middleware('permission:hr.shift.delete');
            Route::post('assign', [ShiftController::class, 'assign'])->middleware('permission:hr.shift.assign');
        });
        // Lets the client leave a module out of the navigation rather than
        // offer a menu item that can only fail. No permission gate: it reports
        // what exists, not what the caller may do.

        // Gated on schema, not just permission: the thirteen HR tables are not
        // in production yet, and without this every route below is a 500.
        Route::group(['prefix' => 'hr', 'middleware' => 'module.schema:hr'], function () {
            Route::get('dashboard', [HrDashboardController::class, 'index'])->middleware('permission:hr.dashboard.read');

            Route::group(['prefix' => 'requisitions'], function () {
                Route::get('get', [JobRequisitionController::class, 'index'])->middleware('permission:hr.requisition.read');
                Route::get('show/{id}', [JobRequisitionController::class, 'show'])->middleware('permission:hr.requisition.read');
                Route::post('store', [JobRequisitionController::class, 'store'])->middleware('permission:hr.requisition.create');
                Route::put('update/{id}', [JobRequisitionController::class, 'update'])->middleware('permission:hr.requisition.update');
                Route::delete('delete/{id}', [JobRequisitionController::class, 'destroy'])->middleware('permission:hr.requisition.delete');
                Route::post('approve/{id}', [JobRequisitionController::class, 'approve'])->middleware('permission:hr.requisition.approve');
                Route::post('publish/{id}', [JobRequisitionController::class, 'publish'])->middleware('permission:hr.requisition.publish');
                Route::post('publish-indeed/{id}', [JobRequisitionController::class, 'publishToIndeed'])->middleware('permission:hr.requisition.publish');
            });

            Route::group(['prefix' => 'quizzes'], function () {
                Route::get('get', [TrainingQuizController::class, 'index'])->middleware('permission:hr.training.read');
                Route::get('show/{id}', [TrainingQuizController::class, 'show'])->middleware('permission:hr.training.read');
                Route::post('store', [TrainingQuizController::class, 'store'])->middleware('permission:hr.training.create');
                Route::put('update/{id}', [TrainingQuizController::class, 'update'])->middleware('permission:hr.training.update');
                Route::delete('delete/{id}', [TrainingQuizController::class, 'destroy'])->middleware('permission:hr.training.delete');
            });

            // Assigning an interview quiz to a candidate and reading back the
            // score + proctoring trail. The candidate's own runner is public
            // (see the token routes at the bottom of this file).
            Route::group(['prefix' => 'quiz-attempts'], function () {
                Route::get('get', [QuizAttemptController::class, 'index'])->middleware('permission:hr.training.read');
                Route::get('show/{id}', [QuizAttemptController::class, 'show'])->middleware('permission:hr.training.read');
                Route::get('candidates', [QuizAttemptController::class, 'assignableCandidates'])->middleware('permission:hr.training.read');
                Route::post('store', [QuizAttemptController::class, 'store'])->middleware('permission:hr.training.create');
                Route::delete('delete/{id}', [QuizAttemptController::class, 'destroy'])->middleware('permission:hr.training.delete');
            });

            Route::group(['prefix' => 'onboarding'], function () {
                Route::get('dashboard', [OnboardingController::class, 'dashboard'])->middleware('permission:hr.onboarding.journey.read');
                Route::get('journeys', [OnboardingController::class, 'journeys'])->middleware('permission:hr.onboarding.journey.read');
                Route::get('journeys/{id}', [OnboardingController::class, 'showJourney'])->middleware('permission:hr.onboarding.journey.read');
                Route::get('documents', [OnboardingController::class, 'documents'])->middleware('permission:hr.onboarding.document.read');
                Route::post('documents/{id}/{decision}', [OnboardingController::class, 'reviewDocument'])->middleware('permission:hr.onboarding.document.read');
            });

            Route::group(['prefix' => 'candidates'], function () {
                Route::get('get', [CandidateController::class, 'index'])->middleware('permission:hr.candidate.read');
                Route::get('pipeline', [CandidateController::class, 'pipeline'])->middleware('permission:hr.candidate.read');
                Route::get('show/{id}', [CandidateController::class, 'show'])->middleware('permission:hr.candidate.read');
                Route::post('store', [CandidateController::class, 'store'])->middleware('permission:hr.candidate.create');
                Route::put('update/{id}', [CandidateController::class, 'update'])->middleware('permission:hr.candidate.update');
                Route::delete('delete/{id}', [CandidateController::class, 'destroy'])->middleware('permission:hr.candidate.delete');
                Route::post('move-stage/{id}', [CandidateController::class, 'moveStage'])->middleware('permission:hr.candidate.move_stage');

                // Lightweight document storage for a candidate — a real
                // upload endpoint, unlike the stubbed/fabricated documents
                // the Onboarding module generates when none exist.
                Route::get('documents/get/{id}', [CandidateDocumentController::class, 'index'])->middleware('permission:hr.candidate.read');
                Route::post('documents/store/{id}', [CandidateDocumentController::class, 'store'])->middleware('permission:hr.candidate.update');
                Route::post('documents/review/{id}/{decision}', [CandidateDocumentController::class, 'review'])->middleware('permission:hr.candidate.update');
                Route::delete('documents/delete/{id}', [CandidateDocumentController::class, 'destroy'])->middleware('permission:hr.candidate.update');
            });

            Route::group(['prefix' => 'interviews'], function () {
                Route::get('get', [InterviewController::class, 'index'])->middleware('permission:hr.interview.read');
                Route::get('show/{id}', [InterviewController::class, 'show'])->middleware('permission:hr.interview.read');
                Route::post('store', [InterviewController::class, 'store'])->middleware('permission:hr.interview.create');
                Route::put('update/{id}', [InterviewController::class, 'update'])->middleware('permission:hr.interview.update');
                Route::delete('delete/{id}', [InterviewController::class, 'destroy'])->middleware('permission:hr.interview.delete');
                Route::post('reschedule/{id}', [InterviewController::class, 'reschedule'])->middleware('permission:hr.interview.update');
                Route::post('feedback/{id}', [InterviewController::class, 'feedback'])->middleware('permission:hr.interview.feedback');
            });

            Route::group(['prefix' => 'offers'], function () {
                Route::get('get', [OfferController::class, 'index'])->middleware('permission:hr.offer.read');
                Route::get('show/{id}', [OfferController::class, 'show'])->middleware('permission:hr.offer.read');
                Route::post('store', [OfferController::class, 'store'])->middleware('permission:hr.offer.create');
                Route::put('update/{id}', [OfferController::class, 'update'])->middleware('permission:hr.offer.update');
                Route::delete('delete/{id}', [OfferController::class, 'destroy'])->middleware('permission:hr.offer.update');
                Route::post('approve/{id}', [OfferController::class, 'approve'])->middleware('permission:hr.offer.approve');
                Route::post('release/{id}', [OfferController::class, 'release'])->middleware('permission:hr.offer.release');
                Route::post('respond/{id}', [OfferController::class, 'respond'])->middleware('permission:hr.offer.update');
            });

            Route::group(['prefix' => 'assets'], function () {
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

            Route::group(['prefix' => 'performance'], function () {
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

            Route::group(['prefix' => 'reports'], function () {
                Route::get('generate', [HrReportController::class, 'generate'])->middleware('permission:hr.report.read');
            });

            Route::group(['prefix' => 'exit'], function () {
                Route::get('get', [ExitManagementController::class, 'index'])->middleware('permission:hr.exit.read');
                Route::post('store', [ExitManagementController::class, 'store'])->middleware('permission:hr.exit.create');
                Route::put('status/{id}', [ExitManagementController::class, 'updateStatus'])->middleware('permission:hr.exit.update');
            });

            // hr-settings' controller was removed with its module. Restore it
            // before re-adding this group.
        });

        /*
         * Two survivors of the removed Access Control console, kept because
         * their callers are ordinary admin screens:
         *   settings   -> the admin Dashboard reads the "main_dashboard" group
         *   user-roles -> /admin/admins lists admin users
         * The dashboard, audit-log, org-structure (locations, branches, teams,
         * approval levels) and permission-dimension CRUD endpoints are gone
         * with the screens that were their only caller. Per-user page grants
         * are still readable through /my-permissions above; only the UI for
         * editing them has been withdrawn.
         */
        Route::group(['prefix' => 'rbac'], function () {
            Route::get('settings', [SettingsController::class, 'index'])->middleware('permission:admin.configuration.read');
            Route::put('settings', [SettingsController::class, 'update'])->middleware('permission:admin.configuration.update');

            Route::get('user-roles', [UserRoleController::class, 'index'])->middleware('permission:admin.role.read');
        });

        Route::get('upload-batches/{type}', [UploadBatchController::class, 'index'])->middleware('permission:payroll.payslip.read');
        Route::get('upload-batches/{type}/{id}', [UploadBatchController::class, 'show'])->middleware('permission:payroll.payslip.read');
        Route::delete('upload-batches/{type}/{id}', [UploadBatchController::class, 'destroy'])->middleware('permission:payroll.payslip.delete');

        Route::post('/appointment/create-account', [UserController::class, 'createAppointmentAccount'])->middleware('permission:hr.employee.create');
        Route::get('/agents', [UserController::class, 'getAgents'])->middleware('permission:hr.employee.read');
        Route::put('/agents/{id}', [UserController::class, 'updateAgent'])->middleware('permission:hr.employee.update');
        Route::delete('/agents/{id}', [UserController::class, 'deleteAgent'])->middleware('permission:hr.employee.delete');
        Route::delete('/trial-form/delete/{id}', [UserController::class, 'deleteTrialForm'])->middleware('permission:recruitment.trial_form.delete');
    });

    Route::group([], function () {
        Route::post('/trial-form/store', [UserController::class, 'postTrialForm'])->middleware('permission:recruitment.trial_form.create');
        Route::get('/trial-form/list', [UserController::class, 'getTrialForms'])->middleware('permission:recruitment.trial_form.read');
        Route::post('/trial-form/update/{id}', [UserController::class, 'updateTrialForm'])->middleware('permission:recruitment.trial_form.update');
    });

    // Admin manages every employee's payslips; employees view their own (SalariesSlipController scopes by role)
    Route::group([], function () {
        Route::group(['prefix' => 'salary-slip'], function () {
            Route::get('get', [SalariesSlipController::class, 'index'])->middleware('permission:payroll.payslip.read');
            Route::get('show/{id}', [SalariesSlipController::class, 'show'])->middleware('permission:payroll.payslip.read');
        });
    });

    Route::get('dashboard', [UserController::class, 'dashboard'])->middleware('permission:self.payslip.read');

    // Both the agent portal and the admin Appointments page use this to edit a candidate
    Route::post('/appointment/update', [UserController::class, 'updateUser'])->middleware('permission:hr.appointment.update');

    Route::get('/agent/candidates', [UserController::class, 'getAgentCandidates'])->middleware('permission:recruitment.candidate.read');
});

/*
 * Candidate-facing interview quiz. Candidates are not users and have no
 * login, so these routes sit outside the jwt.auth group and the per-attempt
 * access token is the only credential. Throttled accordingly, and the
 * controller never serialises the answer key or trusts a client-sent score.
 */
Route::group(['prefix' => 'quiz'], function () {
    Route::get('{token}', [PublicQuizController::class, 'show'])->middleware('throttle:60,1');
    Route::post('{token}/start', [PublicQuizController::class, 'start'])->middleware('throttle:20,1');
    Route::post('{token}/progress', [PublicQuizController::class, 'saveProgress'])->middleware('throttle:120,1');
    Route::post('{token}/event', [PublicQuizController::class, 'logEvent'])->middleware('throttle:240,1');
    Route::post('{token}/submit', [PublicQuizController::class, 'submit'])->middleware('throttle:20,1');
})->where(['token' => '[A-Za-z0-9]{64}']);

/*
 * Candidate intake from the shared Google Form (relayed by its bound Apps
 * Script). No login is possible here either — the token in the URL is
 * config('services.candidate_intake.token'), checked with hash_equals in the
 * controller. Throttled to absorb a burst of applications without becoming a
 * write-anything-anywhere endpoint.
 */
Route::post('candidate-intake/{token}', [PublicCandidateIntakeController::class, 'store'])
    ->middleware(['throttle:30,1', 'module.schema:hr']);

Route::get('jobs/indeed-feed.xml', [\App\Http\Controllers\IndeedFeedController::class, 'index']);
