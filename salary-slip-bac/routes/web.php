<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    dd([
    'FILESYSTEM_DISK' => env('FILESYSTEM_DISK'),
    'AWS_ACCESS_KEY_ID' => env('AWS_ACCESS_KEY_ID'),
    'AWS_SECRET_ACCESS_KEY' => env('AWS_SECRET_ACCESS_KEY'),
    'AWS_DEFAULT_REGION' => env('AWS_DEFAULT_REGION'),
    'AWS_BUCKET' => env('AWS_BUCKET'),
    'AWS_USE_PATH_STYLE_ENDPOINT' => env('AWS_USE_PATH_STYLE_ENDPOINT'),
    'AWS_URL' => env('AWS_URL'),
]);
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