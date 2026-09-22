# -*- coding: utf-8 -*-
import os

php_code = r"""<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Mediclaim\MediclaimHospital;
use App\Models\User;

echo "Total Hospitals: " . MediclaimHospital::count() . PHP_EOL;
foreach (MediclaimHospital::all() as $h) {
    echo "ID: " . $h->id . " | Name: " . $h->name . " | Status: " . $h->status . " | Company: " . var_export($h->company_code, true) . PHP_EOL;
}

echo PHP_EOL . "Checking Users:" . PHP_EOL;
$user = User::first();
if ($user) {
    echo "First user: " . $user->name . " | Role: " . $user->role . " | Company: " . var_export($user->company_code, true) . PHP_EOL;
}
"""

with open(r'F:\HRMS oldd\salary-slip-bac\check_hospitals.php', 'w', encoding='utf-8') as f:
    f.write(php_code)
