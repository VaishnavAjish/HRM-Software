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
        'print', 'checkbox', 'processed', 'check_image', 'pan_image', 'adhar_image', 'account_book', 'type',
        'designation', 'form_no', 'trial_date', 'mobile_no_2', 'last_company_name',
        'added_by', 'trial_form_id',
        'last_company_address', 'experience', 'reason_for_leaving', 'hastak_name',
        'hastak_code', 'hastak_mobile', 'contractor', 'manager_signature',
        'hastak_signature', 'hr_signature', 'akar', 'shift_id'
    ];

    /**
     * encrypted_aadhaar_number never leaves the server: it is hidden from every
     * array/JSON representation so it cannot escape through a model returned
     * from a controller. Read it explicitly via $user->encrypted_aadhaar_number
     * inside an authorised workflow, and show aadhaar_masked everywhere else.
     */
    protected $hidden = [
        'password', 'remember_token',
        'encrypted_aadhaar_number', 'aadhar_card_no',
    ];

    protected $appends = ['aadhaar_masked', 'has_aadhaar'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'email_verified_at' => 'datetime',
            // AES-256 at rest via APP_KEY; transparent on read/write.
            'encrypted_aadhaar_number' => 'encrypted',
            'aadhaar_extracted_at' => 'datetime',
            'aadhaar_verified_at' => 'datetime',
        ];
    }

    /**
     * Whether a usable Aadhaar is on file.
     *
     * An edit form needs to distinguish "no number stored" from "stored but not
     * sent to you" — it cannot see aadhar_card_no, and inferring existence from
     * a non-empty mask breaks for a partial legacy value that masks to "".
     */
    public function getHasAadhaarAttribute(): bool
    {
        if ($this->aadhaar_last_four) {
            return true;
        }

        return \App\Support\AadhaarReference::isValid($this->getRawOriginal('aadhar_card_no'));
    }

    /** The only Aadhaar value safe to render: "XXXX XXXX 9012". */
    public function getAadhaarMaskedAttribute(): string
    {
        if ($this->aadhaar_last_four) {
            return 'XXXX XXXX ' . $this->aadhaar_last_four;
        }

        return \App\Support\AadhaarReference::mask($this->getRawOriginal('aadhar_card_no'));
    }

    /**
     * Store the number encrypted and derive everything the app works with.
     * The plaintext is never returned or logged.
     */
    public function setAadhaarNumber(string $aadhaar, string $source = 'MANUAL'): void
    {
        $digits = \App\Support\AadhaarReference::normalise($aadhaar);

        if (!\App\Support\AadhaarReference::isValid($digits)) {
            throw new \RuntimeException('Invalid Aadhaar number.');
        }

        $this->forceFill([
            'encrypted_aadhaar_number'    => $digits,
            'aadhaar_last_four'           => substr($digits, -4),
            'aadhaar_secure_reference'    => \App\Support\AadhaarReference::secureReference($digits),
            'aadhaar_extraction_source'   => $source,
            'aadhaar_extracted_at'        => now(),
            'aadhaar_verification_status' => 'PENDING_REVIEW',
        ])->save();
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

    public function shift()
    {
        return $this->belongsTo(Shift::class, 'shift_id');
    }

    public function roles()
    {
        return $this->belongsToMany(Role::class, 'user_roles');
    }

    /**
     * Columns holding an uploaded file path/key.
     *
     * When documents live in S3 the object is private, so the stored value is
     * an object key that cannot be rendered directly. These accessors swap it
     * for a short-lived presigned URL on read. Signing is a local HMAC — no
     * AWS round trip — so doing it per row in a listing is cheap.
     *
     * Only reads are affected: Eloquent accessors do not intercept writes, so
     * the raw key is what gets persisted.
     */
    private function resolveStoredFile(?string $value): ?string
    {
        if (!$value || !\App\Support\ObjectKeyBuilder::looksLikeObjectKey($value)) {
            return $value;
        }

        if (config('documents.provider') !== 's3') {
            return $value;
        }

        // Send the real content type so the browser renders an <img> inline
        // instead of treating it as an opaque download.
        $extension = strtolower(pathinfo($value, PATHINFO_EXTENSION));
        $mime = array_search($extension, (array) config('documents.mime_extension_map', []), true)
            ?: 'application/octet-stream';

        try {
            return \App\Services\Documents\DocumentService::provider()->viewUrl(
                $value,
                (int) config('documents.view_url_ttl'),
                $mime
            );
        } catch (\Throwable) {
            // Never let a storage hiccup break a user listing.
            return null;
        }
    }

    public function getPhotoAttribute($value)
    {
        return $this->resolveStoredFile($value);
    }

    public function getAdharImageAttribute($value)
    {
        return $this->resolveStoredFile($value);
    }

    public function getPanImageAttribute($value)
    {
        return $this->resolveStoredFile($value);
    }

    public function getCheckImageAttribute($value)
    {
        return $this->resolveStoredFile($value);
    }

    public function getAccountBookAttribute($value)
    {
        return $this->resolveStoredFile($value);
    }
}
