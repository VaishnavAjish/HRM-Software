<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * designations — formal job titles within the architecture (03.01).
 *
 * Distinct from Job: Designation is the formal title used in contracts, org charts, etc.
 * Links to Job Family, Function, Level, Grade.
 * Existing free-text designation on users table will be migrated to reference this master.
 */
class Designation extends Model
{
    public const STATUSES = ['active', 'inactive'];

    protected $fillable = [
        'enterprise_id',
        'company_id',
        'job_family_id',
        'job_function_id',
        'job_level_id',
        'job_grade_id',
        'department_id',
        'code',
        'title',
        'description',
        'status',
        'effective_from',
        'effective_to',
    ];

    protected function casts(): array
    {
        return [
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

    public function family()
    {
        return $this->belongsTo(JobFamily::class, 'job_family_id');
    }

    public function function()
    {
        return $this->belongsTo(JobFunction::class, 'job_function_id');
    }

    public function level()
    {
        return $this->belongsTo(JobLevel::class, 'job_level_id');
    }

    public function grade()
    {
        return $this->belongsTo(JobGrade::class, 'job_grade_id');
    }

    public function department()
    {
        return $this->belongsTo(Department::class, 'department_id');
    }

    public function jobs()
    {
        return $this->hasMany(Job::class);
    }
}
