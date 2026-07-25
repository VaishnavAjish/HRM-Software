<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Tymon\JWTAuth\Contracts\JWTSubject;

class User extends Authenticatable implements JWTSubject
{
    protected $fillable = [
        'name', 'email', 'password', 'otp', 'status', 'role', 'emp_code', 'company_code', 'unit',
        'mobile_number', 'dob', 'photo', 'address', 'is_deleted',
        'members', 'joining_date', 'department', 'manager_name', 'salary',
        'emp_whatsapp_no', 'punching_no', 'village', 'taluka', 'district',
        'birth_place', 'gender', 'cast', 'marital_status', 'blood_group',
        'reference_name', 'reference_mobile_no', 'aadhar_card_no', 'pan_card_no',
        'bank_name', 'bank_ifsc_code', 'bank_account_no', 'education', 'emp_signature',
        'resignation_date', 'city', 'pin', 'state', 'pf_no', 'esi_no', 'branch',
        'print', 'checkbox', 'processed', 'check_image', 'pan_image', 'adhar_image', 'type',
        'designation', 'form_no', 'trial_date', 'mobile_no_2', 'last_company_name',
        'added_by', 'trial_form_id',
        'last_company_address', 'experience', 'reason_for_leaving', 'hastak_name',
        'hastak_code', 'hastak_mobile', 'contractor', 'manager_signature',
        'hastak_signature', 'hr_signature', 'akar'
    ];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'email_verified_at' => 'datetime',
        ];
    }

    public function getJWTIdentifier()
    {
        return $this->getKey();
    }

    public function getJWTCustomClaims(): array
    {
        return [];
    }

    public function addedBy()
    {
        return $this->belongsTo(User::class, 'added_by');
    }
}
