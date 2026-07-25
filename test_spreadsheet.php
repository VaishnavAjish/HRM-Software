<?php
require __DIR__.'/backend/vendor/autoload.php';
$app = require_once __DIR__.'/backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$file = __DIR__.'/backend/dummy.xlsx';
file_put_contents($file, "");

try {
    $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($file);
    $data = $spreadsheet->getActiveSheet()->toArray();
    echo "PhpSpreadsheet works!\n";
} catch (\Throwable $e) {
    echo "PhpSpreadsheet error: " . $e->getMessage() . "\n";
}

try {
    $excel = \PHPExcel_IOFactory::load($file);
    $data = $excel->getActiveSheet()->toArray();
    echo "PHPExcel works!\n";
} catch (\Throwable $e) {
    echo "PHPExcel error: " . $e->getMessage() . "\n";
}
