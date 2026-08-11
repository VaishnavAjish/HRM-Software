<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class ReportingRelationship extends Model
{
    public const TYPE_PRIMARY = 'primary';

    public const STATUS_ACTIVE = 'active';

    public const STATUS_ENDED = 'ended';

    protected $fillable = [
        'employee_user_id', 'manager_user_id', 'relationship_type', 'status',
        'effective_from', 'effective_to', 'reason', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(User::class, 'employee_user_id');
    }

    public function manager()
    {
        return $this->belongsTo(User::class, 'manager_user_id');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_ACTIVE);
    }

    public function scopePrimary(Builder $query): Builder
    {
        return $query->where('relationship_type', self::TYPE_PRIMARY);
    }

    /**
     * The line in force on a given date.
     *
     * A ticket raised last month must be answerable against the manager who
     * held the line then, not whoever holds it now.
     */
    public function scopeInForceOn(Builder $query, $date): Builder
    {
        return $query
            ->whereDate('effective_from', '<=', $date)
            ->where(fn ($q) => $q->whereNull('effective_to')->orWhereDate('effective_to', '>=', $date));
    }
}
