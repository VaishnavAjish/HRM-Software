<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * job_evaluations — configurable job evaluation records (03.01).
 *
 * Supports configurable factors: Responsibility, Complexity, Skills, Decision Making, Leadership, Impact, Experience, Risk.
 * Provides evaluation form, score, evaluator, review date, history, result.
 * Does not build compensation decisions directly unless explicitly configured.
 */
class JobEvaluation extends Model
{
    public const STATUSES = ['draft', 'submitted', 'approved', 'rejected'];
    public const FACTORS = [
        'responsibility', 'complexity', 'skills', 'decision_making',
        'leadership', 'impact', 'experience', 'risk'
    ];

    protected $fillable = [
        'job_id',
        'evaluator_id',
        'factor_scores',
        'total_score',
        'result',
        'notes',
        'review_date',
        'status',
        'approved_by',
        'approved_at',
        'effective_from',
        'effective_to',
    ];

    protected function casts(): array
    {
        return [
            'factor_scores' => 'array',
            'total_score' => 'decimal:2',
            'approved_at' => 'datetime',
            'review_date' => 'date',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    public function job()
    {
        return $this->belongsTo(Job::class);
    }

    public function evaluator()
    {
        return $this->belongsTo(User::class, 'evaluator_id');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
