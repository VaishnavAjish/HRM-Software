<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {

    return view('welcome');
});
Route::get('/phpinfo', function () {
    phpinfo();
});
Route::get('/check-ext', function () {
    return response()->json([
        'zip'     => extension_loaded('zip'),
        'gd'      => extension_loaded('gd'),
        'php_ini' => php_ini_loaded_file(),
    ]);
});