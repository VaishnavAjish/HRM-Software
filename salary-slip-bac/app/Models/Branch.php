<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Branch extends Model
{
    protected $fillable = ['name', 'code', 'location_id'];

    public function location()
    {
        return $this->belongsTo(Location::class);
    }
}
