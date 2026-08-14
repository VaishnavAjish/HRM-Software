<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * job_levels — hierarchical job levels (03.01).
 *
 * Examples: L1, L2, L3, L4, L5, L6, etc.
 * Do not hard-code levels; make them configurable per enterprise.
 */
class JobLevel extends Model
{
    public const STATUSES = ['active', 'inactive'];
    public const CAREER_STAGES = ['entry', 'junior', 'mid', 'senior', 'lead', 'principal', 'executive'];

    protected $fillable = [
        'enterprise_id',
        'company_id',
        'code',
        'name',
        'rank',
        'description',
        'career_stage',
        'status',
        'effective_from',
        'effective_to',
    ];

    protected function casts(): array
    {
        return [
            'rank' => 'integer',
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

    public function grades()
    {
        return $this->hasMany(JobGrade::class);
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
