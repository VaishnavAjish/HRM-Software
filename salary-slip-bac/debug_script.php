<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;
use Illuminate\Support\Facades\DB;

// All managers in department_managers pivot or departments table
$deptManagerUserIds = DB::table('department_managers')->pluck('user_id')->toArray();
$deptTableManagerIds = DB::table('departments')->whereNotNull('manager_id')->where('manager_id', '!=', '')->pluck('manager_id')->toArray();

$allIds = array_unique(array_merge($deptManagerUserIds, $deptTableManagerIds));

echo "=== TESTING SUBORDINATE RESOLUTION FOR ALL MANAGERS ===\n";
foreach ($allIds as $rawId) {
    $user = User::find($rawId);
    if (!$user) {
        $user = User::where('emp_code', $rawId)->first();
    }
    if (!$user) {
        $user = User::where('name', $rawId)->first();
    }
    if ($user) {
        // Run resolveSubordinateIds reflectively or test logic
        $userController = new \App\Http\Controllers\UserController();
        $refMethod = new \ReflectionMethod($userController, 'resolveSubordinateIds');
        $refMethod->setAccessible(true);
        $subIds = $refMethod->invoke($userController, $user);

        echo "Manager ID: {$user->id} | Name: '{$user->name}' | Desig: '{$user->designation}' | PersonalDept: '{$user->department}' => Subordinate Count: " . count($subIds) . "\n";
        
        // Show assigned departments for this manager
        $assignedDeptNames = DB::table('departments')
            ->where('manager_id', $user->id)
            ->orWhere('manager_id', (string)$user->id)
            ->orWhere('manager_id', $user->emp_code)
            ->pluck('name')
            ->toArray();
            
        $pivotDeptIds = DB::table('department_managers')
            ->where('user_id', $user->id)
            ->orWhere('user_id', (string)$user->id)
            ->orWhere('user_id', $user->emp_code)
            ->pluck('department_id')
            ->toArray();
            
        $pivotDeptNames = DB::table('departments')->whereIn('id', $pivotDeptIds)->pluck('name')->toArray();
        
        $combinedAssigned = array_unique(array_merge($assignedDeptNames, $pivotDeptNames));
        echo "   Assigned Depts in DB: " . implode(', ', $combinedAssigned) . "\n";
        
        if (count($subIds) > 0) {
            $subUsers = User::whereIn('id', array_slice($subIds, 0, 5))->get(['id', 'name', 'department']);
            foreach ($subUsers as $su) {
                echo "      Subordinate: {$su->id} | {$su->name} | Dept: '{$su->department}'\n";
            }
        } else {
            echo "      (NO SUBORDINATES FOUND)\n";
        }
        echo "---------------------------------------------------------\n";
    }
}
