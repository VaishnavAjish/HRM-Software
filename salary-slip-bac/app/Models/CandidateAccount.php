<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class CandidateAccount extends Authenticatable
{
    use HasApiTokens, Notifiable;

    protected $table = 'candidate_accounts';

    protected $fillable = [
        'name',
        'email',
        'password',
        'phone',
        'email_verified_at',
        'verification_token',
        'verification_token_expires_at',
        'reset_password_token',
        'reset_password_token_expires_at',
        'skills',
        'current_company',
        'current_designation',
        'experience_years',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'verification_token',
        'reset_password_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'verification_token_expires_at' => 'datetime',
            'reset_password_token_expires_at' => 'datetime',
            'skills' => 'array',
            'experience_years' => 'float',
            'password' => 'hashed',
        ];
    }

    public function applications()
    {
        return $this->hasMany(Candidate::class, 'candidate_account_id');
    }
}
