<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * job_grades — compensation grades linked to job levels (03.01).
 *
 * Links to salary ranges, currency, eligibility rules.
 * Integrates with Payroll, Compensation, Promotion, Benefits, Workforce Planning.
 */
class JobGrade extends Model
{
    public const STATUSES = ['active', 'inactive'];

    protected $fillable = [
        'enterprise_id',
        'company_id',
        'job_level_id',
        'code',
        'name',
        'description',
        'currency',
        'min_salary',
        'mid_salary',
        'max_salary',
        'eligibility_rules',
        'status',
        'effective_from',
        'effective_to',
    ];

    protected function casts(): array
    {
        return [
            'min_salary' => 'decimal:2',
            'mid_salary' => 'decimal:2',
            'max_salary' => 'decimal:2',
            'eligibility_rules' => 'array',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    public function enterprise()
    {
        return $this->belongsTo(Enterprise::class);
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function level()
    {
        return $this->belongsTo(JobLevel::class, 'job_level_id');
    }

    public function jobs()
    {
        return $this->hasMany(Job::class);
    }

    public function designations()
    {
        return $this->hasMany(Designation::class);
    }
}
