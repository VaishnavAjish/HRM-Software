<?php
require __DIR__.'/backend/vendor/autoload.php';
$app = require_once __DIR__.'/backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use App\Http\Controllers\Admin\AdminController;

$file = __DIR__.'/dummy.xlsx';
file_put_contents($file, "test");
$uploadedFile = new UploadedFile($file, 'dummy.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null, true);
$request = Request::create('/api/admin/salary-slip/store', 'POST');
$request->files->set('salary_slip', $uploadedFile);
$request->merge(['company_code' => 'nidhi-impex']);

$controller = new AdminController();
try {
    $response = $controller->salarySlipImport($request);
    echo $response->getContent();
} catch (\Throwable $e) {
    echo get_class($e) . ': ' . $e->getMessage();
}
