<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    protected $fillable = [
        'user_id', 'title', 'description', 'module', 'priority',
        'action_url', 'action_label', 'triggered_by', 'related_employee',
        'department', 'related_type', 'related_id', 'read_at',
    ];

    protected function casts(): array
    {
        return [
            'read_at' => 'datetime',
        ];
    }

    /**
     * The shape the notification drawer already renders.
     *
     * Mapped here rather than in the controller so the list endpoint and any
     * future push both emit the same object — the client reads `isRead`,
     * `timestamp`, `actionUrl` and friends, and renaming them per endpoint is
     * how a drawer ends up with half its rows missing a button.
     */
    protected $appends = ['isRead', 'timestamp', 'actionUrl', 'actionLabel', 'triggeredBy', 'relatedEmployee', 'status'];

    public function getIsReadAttribute(): bool
    {
        return $this->read_at !== null;
    }

    public function getStatusAttribute(): string
    {
        return $this->read_at === null ? 'unread' : 'read';
    }

    public function getTimestampAttribute(): ?string
    {
        return optional($this->created_at)->toIso8601String();
    }

    public function getActionUrlAttribute(): ?string
    {
        return $this->attributes['action_url'] ?? null;
    }

    public function getActionLabelAttribute(): ?string
    {
        return $this->attributes['action_label'] ?? null;
    }

    public function getTriggeredByAttribute(): ?string
    {
        return $this->attributes['triggered_by'] ?? null;
    }

    public function getRelatedEmployeeAttribute(): ?string
    {
        return $this->attributes['related_employee'] ?? null;
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function scopeUnread(Builder $query): Builder
    {
        return $query->whereNull('read_at');
    }
}
