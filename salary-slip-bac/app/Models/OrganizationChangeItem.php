<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * organization_change_items — typed items within a change request (02.09).
 */
class OrganizationChangeItem extends Model
{
    public const ITEM_TYPES = [
        'create_unit', 'update_unit', 'delete_unit', 'create_location', 'update_location',
        'delete_location', 'create_financial_org', 'update_financial_org', 'delete_financial_org',
        'create_position', 'update_position', 'delete_position', 'assign_employee',
        'reassign_manager', 'update_leadership', 'update_calendar', 'update_hierarchy',
    ];

    public const ITEM_STATUSES = ['pending', 'applied', 'failed', 'skipped'];

    protected $fillable = [
        'change_request_id',
        'sequence',
        'item_type',
        'target_type',
        'target_id',
        'before_values',
        'after_values',
        'status',
        'error_message',
    ];

    protected function casts(): array
    {
        return [
            'sequence' => 'integer',
            'before_values' => 'array',
            'after_values' => 'array',
        ];
    }

    public function changeRequest()
    {
        return $this->belongsTo(OrganizationChangeRequest::class, 'change_request_id');
    }
}
