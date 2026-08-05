<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TrainingQuiz extends Model
{
    protected $fillable = [
        'title',
        'description',
        'requisition_id',
        'interview_id',
        'passing_score',
        'duration_minutes',
        'max_violations',
        'is_active',
        'questions',
        'company_code',
        'unit',
        'created_by'
    ];

    protected function casts(): array
    {
        return [
            'questions' => 'array',
            'passing_score' => 'integer',
            'duration_minutes' => 'integer',
            'max_violations' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function requisition()
    {
        return $this->belongsTo(JobRequisition::class, 'requisition_id');
    }

    public function interview()
    {
        return $this->belongsTo(Interview::class, 'interview_id');
    }

    public function attempts()
    {
        return $this->hasMany(QuizAttempt::class, 'quiz_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * The candidate-facing shape of the questions: same order and options,
     * but with `correct_index` stripped. The answer key must never be
     * serialised to the public quiz endpoint.
     */
    public function questionsForCandidate(): array
    {
        return collect($this->questions ?? [])->values()->map(fn ($q, $i) => [
            'index' => $i,
            'text' => $q['text'] ?? '',
            'options' => array_values($q['options'] ?? []),
        ])->all();
    }
}
