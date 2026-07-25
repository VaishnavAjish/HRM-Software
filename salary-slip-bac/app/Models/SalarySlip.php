<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SalarySlip extends Model
{
    protected $table = 'salary_slips';

    protected $fillable = [
        'month', 'year', 'emp_code', 'emp_name', 'main_department', 'department',
        'designation', 'book_salary', 'paid_day', 'leave', 'basic', 'da', 'hra',
        'wa', 'conv_a', 'edu_a', 'owa', 'ppa', 'pda', 'med_a', 'mob_a',
        'product_incentive', 'gross_salary', 'a_gross', 'pt', 'pf', 'pf_uan',
        'esi', 'esi_no', 'tds', 'lwf', 'advance', 'total_deduct', 'net_payable',
        'account_no', 'account_name', 'bank_ifsc', 'mobile_no', 'company_code', 'unit',
        'resignation_date', 'working_days', 'present_days', 'salary', 'comm', 'other',
        'total_deduction', 'net_salary'
    ];
}
