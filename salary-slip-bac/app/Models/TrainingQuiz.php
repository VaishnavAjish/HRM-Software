<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TrainingQuiz extends Model
{
    protected $fillable = [
        'title',
        'description',
        'requisition_id',
        'passing_score',
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
        ];
    }

    public function requisition()
    {
        return $this->belongsTo(JobRequisition::class, 'requisition_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
