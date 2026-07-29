<?php

namespace App\Models;

use App\Support\DocumentType;
use Illuminate\Database\Eloquent\Model;

class Document extends Model
{
    public const STATUS_ACTIVE      = 'ACTIVE';
    public const STATUS_QUARANTINED = 'QUARANTINED';
    public const STATUS_REJECTED    = 'REJECTED';
    public const STATUS_ARCHIVED    = 'ARCHIVED';
    public const STATUS_DELETED     = 'DELETED';

    /** Only these may ever produce a view/download URL. */
    public const READABLE_STATUSES = [self::STATUS_ACTIVE, self::STATUS_ARCHIVED];

    protected $fillable = [
        'organization_code', 'owner_type', 'owner_id', 'owner_ref', 'user_id',
        'document_type', 'current_version', 'status', 'description',
        'is_deleted', 'deleted_at', 'deleted_by', 'created_by', 'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'is_deleted'      => 'boolean',
            'deleted_at'      => 'datetime',
            'current_version' => 'integer',
        ];
    }

    protected $appends = ['document_label'];

    public function versions()
    {
        return $this->hasMany(DocumentVersion::class)->orderByDesc('version');
    }

    public function currentVersionRecord()
    {
        return $this->hasOne(DocumentVersion::class)->whereColumn('version', 'documents.current_version');
    }

    public function owner()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function getDocumentLabelAttribute(): ?string
    {
        return DocumentType::label($this->document_type);
    }

    public function isReadable(): bool
    {
        return !$this->is_deleted && in_array($this->status, self::READABLE_STATUSES, true);
    }

    public function scopeVisible($query)
    {
        return $query->where('is_deleted', false);
    }
}
