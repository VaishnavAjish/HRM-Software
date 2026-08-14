<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * jobs — the core job master (03.01).
 *
 * Defines "what work is this?" — distinct from Position which defines "where does a seat exist?"
 * Links to Job Family, Function, Category, Level, Grade, Designation.
 * Supports Job Codes (auto-gen + manual), multiple titles, effective dating.
 */
class Job extends Model
{
    public const STATUSES = ['draft', 'active', 'inactive', 'archived'];
    public const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'intern', 'temporary', 'fixed_term'];
    public const REMOTE_ELIGIBILITY_TYPES = ['eligible', 'not_eligible', 'conditional'];

    protected $fillable = [
        'enterprise_id',
        'company_id',
        'job_family_id',
        'job_function_id',
        'job_category_id',
        'job_level_id',
        'job_grade_id',
        'designation_id',
        'code',
        'formal_title',
        'display_title',
        'internal_title',
        'external_title',
        'localized_titles',
        'summary',
        'purpose',
        'status',
        'employment_type',
        'is_remote_eligible',
        'remote_eligibility_type',
        'remote_conditions',
        'effective_from',
        'effective_to',
    ];

    protected function casts(): array
    {
        return [
            'localized_titles' => 'array',
            'remote_conditions' => 'array',
            'is_remote_eligible' => 'boolean',
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

    public function category()
    {
        return $this->belongsTo(JobCategory::class, 'job_category_id');
    }

    public function level()
    {
        return $this->belongsTo(JobLevel::class, 'job_level_id');
    }

    public function grade()
    {
        return $this->belongsTo(JobGrade::class, 'job_grade_id');
    }

    public function designation()
    {
        return $this->belongsTo(Designation::class, 'designation_id');
    }

    public function descriptions()
    {
        return $this->hasMany(JobDescription::class)->orderByDesc('version');
    }

    public function latestDescription()
    {
        return $this->hasOne(JobDescription::class)->latest('version');
    }

    public function responsibilities()
    {
        return $this->hasMany(JobResponsibility::class)->orderBy('priority');
    }

    public function requirements()
    {
        return $this->hasMany(JobRequirement::class);
    }

    public function evaluations()
    {
        return $this->hasMany(JobEvaluation::class)->orderByDesc('review_date');
    }

    public function classification()
    {
        return $this->hasOne(JobClassification::class);
    }

    public function positions()
    {
        return $this->hasMany(OrganizationPosition::class, 'job_id');
    }
}
