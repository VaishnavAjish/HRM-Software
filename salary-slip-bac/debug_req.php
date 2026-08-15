<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

echo "Users: " . \App\Models\User::count() . "\n";
echo "Reqs: " . \App\Models\JobRequisition::count() . "\n";

$reqs = \App\Models\JobRequisition::all();
foreach ($reqs as $req) {
    echo "Req #{$req->id} Status: {$req->status} HM: {$req->hr_manager_id} Comp: {$req->company_code}\n";
    foreach ($req->approvalCycles as $cycle) {
        echo "  Cycle #{$cycle->id} Status: {$cycle->status}\n";
        foreach ($cycle->steps as $step) {
            echo "    Step #{$step->id} Type: {$step->step_type} Assigned: {$step->assigned_to} Status: {$step->status}\n";
        }
    }
}
