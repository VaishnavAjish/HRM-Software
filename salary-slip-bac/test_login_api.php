<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);

$request = Illuminate\Http\Request::create(
    '/api/login',
    'POST',
    [],
    [],
    [],
    ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'],
    json_encode([
        'email' => 'admin@niss.pro',
        'password' => 'Admin@Niss1234'
    ])
);

$response = $kernel->handle($request);
echo "Status Code: " . $response->getStatusCode() . "\n";
echo "Response Body: " . $response->getContent() . "\n";
