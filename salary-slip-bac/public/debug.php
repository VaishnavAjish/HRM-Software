<?php
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$steps = \App\Models\JobRequisitionApprovalStep::all()->toArray();
file_put_contents(__DIR__ . '/../steps_dump.json', json_encode($steps, JSON_PRETTY_PRINT));
$reqs = \App\Models\JobRequisition::all()->toArray();
file_put_contents(__DIR__ . '/../reqs_dump.json', json_encode($reqs, JSON_PRETTY_PRINT));
$cycles = \App\Models\JobRequisitionApprovalCycle::all()->toArray();
file_put_contents(__DIR__ . '/../cycles_dump.json', json_encode($cycles, JSON_PRETTY_PRINT));
echo "Dumped to json files\n";
