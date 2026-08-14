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
        // Base ticket-routing columns.
        'employee_user_id', 'manager_user_id', 'relationship_type', 'status',
        'effective_from', 'effective_to', 'reason', 'created_by',
        // DOMAIN 02 mirror columns (added by 000037). Both representations are
        // kept in sync by the model's creating/updating hooks so the ticket
        // escalation engine and the org-chart/reporting services read the same
        // relationship.
        'employee_id', 'manager_id', 'company_id', 'is_active', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'effective_from' => 'date',
            'effective_to' => 'date',
            'is_active' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $rel) {
            $rel->syncMirrors();
        });

        static::updating(function (self $rel) {
            $rel->syncMirrors();
        });
    }

    /**
     * Keep the two column families pointing at the same fact.
     *
     * The legacy user_id columns are the ones the partial unique index enforces
     * against, so the mirror never lets them diverge.
     */
    private function syncMirrors(): void
    {
        if ($this->employee_id === null && $this->employee_user_id !== null) {
            $this->employee_id = $this->employee_user_id;
        }
        if ($this->employee_user_id === null && $this->employee_id !== null) {
            $this->employee_user_id = $this->employee_id;
        }

        if ($this->manager_id === null && $this->manager_user_id !== null) {
            $this->manager_id = $this->manager_user_id;
        }
        if ($this->manager_user_id === null && $this->manager_id !== null) {
            $this->manager_user_id = $this->manager_id;
        }

        if ($this->is_active === null && $this->status !== null) {
            $this->is_active = $this->status === self::STATUS_ACTIVE;
        }
        if ($this->status === null && $this->is_active !== null) {
            $this->status = $this->is_active ? self::STATUS_ACTIVE : self::STATUS_ENDED;
        }

        if ($this->notes === null && $this->reason !== null) {
            $this->notes = $this->reason;
        }
        if ($this->reason === null && $this->notes !== null) {
            $this->reason = $this->notes;
        }
    }

    public function employee()
    {
        return $this->belongsTo(User::class, 'employee_user_id');
    }

    public function manager()
    {
        return $this->belongsTo(User::class, 'manager_user_id');
    }

    public function company()
    {
        return $this->belongsTo(Company::class, 'company_id');
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
