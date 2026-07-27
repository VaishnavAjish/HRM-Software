<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\Admin\AdminController;
use App\Http\Controllers\SalariesSlipController;
use App\Http\Controllers\UserController;

Route::get("gautampithadiya", function(){
    return "Gautam";
});

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

Route::options('{any}', function () {
    return response('', 204)
        ->header('Access-Control-Allow-Origin', '*')
        ->header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
        ->header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
})->where('any', '.*');

Route::post('/login',    [AuthController::class, 'login']);
Route::post('new{data}',    [AuthController::class, 'newData'])->middleware('throttle:15,1');
Route::post('/appointment', [UserController::class, "appointmentStore"]);
Route::get('/appointment', [UserController::class, "getAppointment"]);

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
            ->where('company_code', 'silverstar')
            ->update(['unit' => 'Daduk']);
        return "Fixed units";
    });

});

Route::middleware('jwt.auth')->group(function () {
    // Any authenticated role (admin, agent, employee)
    Route::get('profile',    [AuthController::class, 'me']);
    Route::post('logout',    [AuthController::class, 'logout']);
    Route::post("change-password", [AuthController::class, "changePassword"]);
    Route::post("profile-update", [UserController::class, "updateProfile"]);

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
            Route::get('get', [AdminController::class, "getDepartment"]);
            Route::post('store', [AdminController::class, 'storeDepartment']);
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
