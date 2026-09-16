<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

try {
    require __DIR__ . '/../vendor/autoload.php';
    $app = require_once __DIR__ . '/../bootstrap/app.php';
    $kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
    $kernel->bootstrap();

    use Illuminate\Support\Facades\DB;

    $deptManagerUserIds = DB::table('department_managers')->pluck('user_id')->toArray();
    $deptTableManagerIds = DB::table('departments')
        ->whereNotNull('manager_id')
        ->whereRaw("CAST(manager_id AS text) != ''")
        ->pluck('manager_id')
        ->toArray();

    $allRawHeadIds = array_unique(array_merge($deptManagerUserIds, $deptTableManagerIds));

    $validHeadUserIds = [];
    foreach ($allRawHeadIds as $rawId) {
        $rawStr = trim((string) $rawId);
        if ($rawStr === '') continue;

        $u = DB::table('users')
            ->where(function($q) use ($rawStr) {
                if (is_numeric($rawStr)) {
                    $q->orWhere('id', (int)$rawStr);
                }
                $q->orWhere('emp_code', $rawStr)
                  ->orWhere('name', $rawStr);
            })
            ->first();

        if ($u) {
            $validHeadUserIds[] = (int) $u->id;
        }
    }
    $validHeadUserIds = array_values(array_unique($validHeadUserIds));

    echo "<pre>";
    echo "Valid Department Head User IDs: " . implode(', ', $validHeadUserIds) . "\n\n";

    if (!empty($validHeadUserIds)) {
        $setToManager = DB::table('users')->whereIn('id', $validHeadUserIds)->update(['designation' => 'Manager']);
        echo "Set designation='Manager' for {$setToManager} Department Heads.\n";

        $cleared = DB::table('users')->whereNotIn('id', $validHeadUserIds)->where(function($q) {
            $q->where('designation', 'Manager')->orWhere('designation', 'manager');
        })->update(['designation' => null]);
        echo "Cleared 'Manager' designation for {$cleared} Non-Department Heads.\n";
    } else {
        $cleared = DB::table('users')->where(function($q) {
            $q->where('designation', 'Manager')->orWhere('designation', 'manager');
        })->update(['designation' => null]);
        echo "Cleared 'Manager' designation for {$cleared} Non-Department Heads.\n";
    }

    echo "DB Sync Complete!</pre>";

} catch (\Throwable $e) {
    echo "<pre>EXCEPTION: " . $e->getMessage() . "\n" . $e->getTraceAsString() . "</pre>";
}
