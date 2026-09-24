<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BulkProfileUpdateHistory extends Model
{
    protected $table = 'bulk_profile_update_histories';

    protected $fillable = [
        'batch_id',
        'company_code',
        'actor_id',
        'actor_name',
        'updated_employees',
        'total_fields_updated',
        'skipped_errors',
        'changes',
    ];

    protected $casts = [
        'changes' => 'array',
        'updated_employees' => 'integer',
        'total_fields_updated' => 'integer',
        'skipped_errors' => 'integer',
    ];

    public function actor()
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
