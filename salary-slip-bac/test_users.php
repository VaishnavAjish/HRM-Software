<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$users = App\Models\User::where('is_deleted', 0)->take(20)->get(['id', 'email', 'name', 'role', 'emp_code']);
foreach ($users as $u) {
    echo "ID: {$u->id} | Role: {$u->role} | Email: {$u->email} | Code: {$u->emp_code} | Name: {$u->name}\n";
}
