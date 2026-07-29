<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UploadBatchRow extends Model
{
    protected $fillable = ['batch_id', 'row_number', 'status', 'reason', 'row_data'];

    protected function casts(): array
    {
        return [
            'row_data' => 'array',
        ];
    }

    public function batch()
    {
        return $this->belongsTo(UploadBatch::class, 'batch_id');
    }
}
