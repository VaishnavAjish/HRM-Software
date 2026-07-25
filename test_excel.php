<?php
require __DIR__.'/backend/vendor/autoload.php';
$app = require_once __DIR__.'/backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();
$file = __DIR__.'/dummy.xlsx';
file_put_contents($file, "test");
try {
    \Maatwebsite\Excel\Facades\Excel::toArray(new \stdClass(), $file);
    echo "stdClass works\n";
} catch(\Throwable $e) {
    echo get_class($e) . ": " . $e->getMessage() . "\n";
}
