<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$steps = \App\Models\JobRequisitionApprovalStep::orderBy('id', 'desc')->limit(5)->get()->toArray();
echo "STEPS:\n";
print_r($steps);

$reqs = \App\Models\JobRequisition::orderBy('id', 'desc')->limit(5)->get()->toArray();
echo "\nREQUISITIONS:\n";
print_r($reqs);
