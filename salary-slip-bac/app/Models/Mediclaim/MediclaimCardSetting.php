<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class MediclaimCardSetting extends Model
{
    protected $table = 'mediclaim_card_settings';

    protected $fillable = [
        'company_code',
        'name',
        'legal_name',
        'tagline',
        'side_slogan',
        'back_slogan',
        'email',
        'phone',
        'helpline',
        'website',
        'address',
        'insurer_name',
        'tpa_code',
        'instructions',
        'field_toggles',
        'logo',
        'signature_url',
        'signature_title',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'instructions' => 'array',
            'field_toggles' => 'array',
        ];
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
