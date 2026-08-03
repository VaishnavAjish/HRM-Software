<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Offer extends Model
{
    protected $fillable = [
        'candidate_id', 'requisition_id', 'designation', 'ctc_annual',
        'salary_breakup', 'joining_date', 'status', 'version', 'expiry_date',
        'notes', 'created_by', 'approved_by', 'released_by', 'approved_at',
        'released_at', 'responded_at',
    ];

    protected function casts(): array
    {
        return [
            'salary_breakup' => 'array',
            'joining_date' => 'date',
            'expiry_date' => 'date',
            'approved_at' => 'datetime',
            'released_at' => 'datetime',
            'responded_at' => 'datetime',
        ];
    }

    public function candidate()
    {
        return $this->belongsTo(Candidate::class, 'candidate_id');
    }

    public function requisition()
    {
        return $this->belongsTo(JobRequisition::class, 'requisition_id');
    }

    public function revisions()
    {
        return $this->hasMany(OfferRevision::class, 'offer_id')->orderByDesc('version');
    }
}
