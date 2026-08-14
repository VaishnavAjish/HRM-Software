<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * job_families — groups of related jobs within a function (03.01).
 *
 * Example: Technology → Software Engineering, Data, Infrastructure, Cyber Security.
 * A Job Function may contain multiple Job Families.
 */
class JobFamily extends Model
{
    public const STATUSES = ['active', 'inactive'];

    protected $fillable = [
        'enterprise_id',
        'company_id',
        'job_function_id',
        'code',
        'name',
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

    public function function()
    {
        return $this->belongsTo(JobFunction::class, 'job_function_id');
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
