<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DocumentAuditLog extends Model
{
    protected $fillable = [
        'document_id', 'document_version_id', 'organization_code', 'actor_user_id',
        'action', 'permission', 'permission_result', 'ip_address', 'user_agent',
        'request_id', 'correlation_id', 'metadata',
    ];

    protected function casts(): array
    {
        return ['metadata' => 'array'];
    }
}
