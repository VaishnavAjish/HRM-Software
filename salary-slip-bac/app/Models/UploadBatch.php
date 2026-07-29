<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UploadBatch extends Model
{
    protected $fillable = [
        'type', 'company_code', 'unit', 'month', 'year', 'file_name',
        'total_rows', 'success_count', 'failed_count', 'uploaded_by',
    ];

    public function rows()
    {
        return $this->hasMany(UploadBatchRow::class, 'batch_id');
    }

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
