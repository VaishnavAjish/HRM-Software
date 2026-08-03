<?php
$u = App\Models\User::where('role',1)->orderByDesc('id')->first();
echo "ADMIN: id={$u->id} role={$u->role} company_code=" . var_export($u->company_code, true) . " unit=" . var_export($u->unit, true) . PHP_EOL;
echo "QUALIFYING USERS (no filter): " . App\Models\User::where('is_deleted',0)->where('role','!=',0)->count() . PHP_EOL;
echo "DISTINCT USER COMPANY CODES: " . App\Models\User::distinct()->pluck('company_code')->implode(', ') . PHP_EOL;
echo "SALARY SLIPS TOTAL: " . App\Models\SalarySlip::count() . PHP_EOL;
