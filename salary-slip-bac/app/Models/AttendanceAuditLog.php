<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttendanceAuditLog extends Model
{
    public $timestamps = true;
    const UPDATED_AT = null; // append-only

    protected $fillable = [
        'user_id', 'action', 'subject_type', 'subject_id', 'old_value', 'new_value',
        'reason', 'ip_address', 'user_agent', 'request_meta',
    ];

    protected function casts(): array
    {
        return [
            'old_value' => 'array',
            'new_value' => 'array',
            'request_meta' => 'array',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Convenience recorder — mirrors this codebase's existing
     * MediclaimActivityLogSupport::log() shape (actor, action, subject,
     * before/after, reason), so it's a familiar call at every call site.
     */
    public static function record(
        ?User $actor,
        string $action,
        ?string $subjectType = null,
        int|string|null $subjectId = null,
        mixed $old = null,
        mixed $new = null,
        ?string $reason = null
    ): self {
        $request = request();

        return self::create([
            'user_id' => $actor?->id,
            'action' => $action,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'old_value' => $old,
            'new_value' => $new,
            'reason' => $reason,
            'ip_address' => $request?->ip(),
            'user_agent' => $request?->userAgent(),
        ]);
    }
}
