<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_reviewer_assignments — primary/backup reviewer per
 * company/policy/role, active date range. `GET /reviews/pending` resolves
 * the acting user's queue through active rows here; the module stays
 * hidden from the frontend nav (`mediclaim_ready`) until at least one
 * active, non-backup row exists per required role per company.
 */
class MediclaimReviewerAssignment extends Model
{
    public const ROLES = ['coordinator', 'committee', 'hr_verification', 'director', 'settlement'];

    public const STATUSES = ['active', 'inactive'];

    protected $fillable = [
        'company_code',
        'policy_id',
        'role',
        'user_id',
        'is_backup',
        'active_from',
        'active_to',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'is_backup' => 'boolean',
            'active_from' => 'date',
            'active_to' => 'date',
        ];
    }

    public function policy()
    {
        return $this->belongsTo(MediclaimPolicy::class, 'policy_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
