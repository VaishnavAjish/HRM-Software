<?php
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, 'http://127.0.0.1:8000/api/admin/salary-slip/store');
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, [
    'salary_slip' => new CURLFile(__DIR__.'/dummy.xlsx'),
    'company_code' => 'nidhi-impex'
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$res = curl_exec($ch);
echo $res;
echo curl_error($ch);
