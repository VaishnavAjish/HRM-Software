<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * job_requirements — structured requirements for jobs (03.01).
 *
 * Supports: Education, Experience, Skill, Certification, Competency, Language, Travel, Security Clearance.
 * Each requirement can be: mandatory, preferred, minimum, maximum.
 */
class JobRequirement extends Model
{
    public const TYPES = [
        'education', 'experience', 'skill', 'certification',
        'competency', 'language', 'travel', 'security_clearance'
    ];

    public const CATEGORIES = ['mandatory', 'preferred', 'minimum', 'maximum'];

    protected $fillable = [
        'job_id',
        'type',
        'requirement',
        'category',
        'details',
        'effective_from',
        'effective_to',
    ];

    protected function casts(): array
    {
        return [
            'details' => 'array',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    public function job()
    {
        return $this->belongsTo(Job::class);
    }
}
