<?php

namespace App\Models;

use App\Support\DocumentType;
use Illuminate\Database\Eloquent\Model;

class DocumentUpload extends Model
{
    protected $fillable = [
        'user_id', 'emp_code', 'user_name',
        'document_type', 'document_category',
        'original_name', 'generated_name', 'storage_path',
        'extension', 'mime_type', 'size', 'checksum',
        'version', 'uploaded_by', 'uploaded_at',
    ];

    protected function casts(): array
    {
        return [
            'size'        => 'integer',
            'version'     => 'integer',
            'uploaded_at' => 'datetime',
        ];
    }

    protected $appends = ['document_label', 'url'];

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function getDocumentLabelAttribute(): ?string
    {
        return DocumentType::label($this->document_type);
    }

    /** Same /storage/ convention the existing photo URLs use. */
    public function getUrlAttribute(): string
    {
        return $this->storage_path ? '/storage/' . ltrim($this->storage_path, '/') : '';
    }

    /** Latest version per (user, document_type). */
    public function scopeLatestVersions($query)
    {
        return $query->whereIn('id', function ($sub) {
            $sub->selectRaw('MAX(id)')
                ->from('document_uploads')
                ->groupBy('user_id', 'document_type');
        });
    }
}
