<?php
require 'vendor/autoload.php'; 
$app = require_once 'bootstrap/app.php'; 
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class); 
$kernel->bootstrap();

// Force DB host to 192.168.1.53 so we connect to the real DB
config(['database.connections.pgsql.host' => '192.168.1.53']);
\Illuminate\Support\Facades\DB::reconnect('pgsql');

$managers = \Illuminate\Support\Facades\DB::table('department_managers')->get(); 
print_r($managers->toArray());

$users = \Illuminate\Support\Facades\DB::table('users')->where('department', 'IT')->get();
echo "Users in IT: " . count($users) . "\n";

$rr = \Illuminate\Support\Facades\DB::table('reporting_relationships')->get();
echo "Reporting Relationships: " . count($rr) . "\n";

$usersAll = \Illuminate\Support\Facades\DB::table('users')->count();
echo "Total Users: " . $usersAll . "\n";
