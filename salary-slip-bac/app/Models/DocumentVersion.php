<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DocumentVersion extends Model
{
    public const UPLOAD_PENDING = 'PENDING_UPLOAD';
    public const UPLOAD_ACTIVE  = 'ACTIVE';
    public const UPLOAD_FAILED  = 'UPLOAD_FAILED';

    public const SCAN_NOT_SCANNED = 'NOT_SCANNED';
    public const SCAN_PENDING     = 'PENDING_SCAN';
    public const SCAN_CLEAN       = 'CLEAN';
    public const SCAN_INFECTED    = 'INFECTED';

    protected $fillable = [
        'document_id', 'version', 'original_file_name', 'generated_file_name',
        'bucket_name', 's3_object_key', 'folder_path', 'file_extension',
        'file_size', 'mime_type', 'checksum_algorithm', 'checksum', 'etag',
        's3_version_id', 'storage_class', 'encryption_type', 'kms_key_id',
        'upload_status', 'scan_status', 'uploaded_by', 'uploaded_at',
        'idempotency_key',
    ];

    /**
     * s3_object_key, bucket_name and KMS details are internal storage facts —
     * hidden so a normal API response cannot leak them.
     */
    protected $hidden = ['s3_object_key', 'bucket_name', 'kms_key_id', 'folder_path', 'idempotency_key'];

    protected function casts(): array
    {
        return [
            'version'     => 'integer',
            'file_size'   => 'integer',
            'uploaded_at' => 'datetime',
        ];
    }

    public function document()
    {
        return $this->belongsTo(Document::class);
    }

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function isServable(): bool
    {
        return $this->upload_status === self::UPLOAD_ACTIVE
            && $this->scan_status !== self::SCAN_INFECTED
            && $this->scan_status !== self::SCAN_PENDING;
    }
}
