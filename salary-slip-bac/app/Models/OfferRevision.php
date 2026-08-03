<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OfferRevision extends Model
{
    public $timestamps = false;

    protected $fillable = ['offer_id', 'version', 'snapshot', 'changed_by', 'reason', 'created_at'];

    protected function casts(): array
    {
        return [
            'snapshot' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function offer()
    {
        return $this->belongsTo(Offer::class, 'offer_id');
    }
}
