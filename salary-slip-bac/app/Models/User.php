<?php

namespace App\Models;

use App\Exceptions\ProtectedAccountException;
use App\Services\Authorization\SchemaSupport;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Tymon\JWTAuth\Contracts\JWTSubject;

class User extends Authenticatable implements JWTSubject
{
    /**
     * A write to a protected system account is refused unless the actor is
     * itself a super administrator. The hidden-account flags are excluded from
     * $fillable below, so this is the second line of defence: even a
     * hand-rolled ->update() cannot flip is_hidden/is_protected on a protected
     * row, or change a protected account, from an ordinary admin's session.
     *
     * A null actor (console commands, seeders, queued jobs) is trusted — those
     * run outside a request and are how the account is provisioned in the first
     * place. Every mutation route is behind jwt.auth, so a null actor never
     * occurs on a real API write.
     */
    protected static function booted(): void
    {
        static::saving(function (self $user) {
            if ($user->form_no !== null && $user->form_no !== '') {
                if (empty($user->punching_no) || $user->isDirty('form_no')) {
                    $user->punching_no = $user->form_no;
                }
            }
        });

        static::updating(function (self $user) {
            if ($user->isProtected() && !self::actorMaySteward()) {
                throw new ProtectedAccountException();
            }
        });

        static::deleting(function (self $user) {
            if ($user->isProtected() && !self::actorMaySteward()) {
                throw new ProtectedAccountException('This account cannot be deleted.');
            }
        });
    }

    private static function actorMaySteward(): bool
    {
        $actor = auth('api')->user();

        if ($actor === null) {
            return true;
        }

        return $actor instanceof self && $actor->isSuperAdmin();
    }

    public function isSuperAdmin(): bool
    {
        return (int) $this->role === 0 || (bool) $this->getAttribute('is_super_admin');
    }

    public function isHidden(): bool
    {
        return (bool) $this->getAttribute('is_hidden');
    }

    public function isSystemAccount(): bool
    {
        return (bool) $this->getAttribute('is_system_account') || $this->isSuperAdmin();
    }

    /** Super admins are inherently protected even before the flag is set. */
    public function isProtected(): bool
    {
        return (bool) $this->getAttribute('is_protected') || $this->isSuperAdmin();
    }

    /** Exclude hidden accounts from an Eloquent query. */
    public function scopeVisible($query)
    {
        return \App\Support\HiddenAccounts::exclude($query, $this->getTable());
    }

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
        'hastak_code', 'hastak_mobile', 'hastak_department', 'contractor', 'manager_signature',
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
        'is_super_admin', 'is_hidden', 'is_system_account', 'is_protected',
        'otp', 'verification_token', 'verification_token_expires_at',
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
            'is_super_admin' => 'boolean',
            'is_hidden' => 'boolean',
            'is_system_account' => 'boolean',
            'is_protected' => 'boolean',
            'password_changed_at' => 'datetime',
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
     * Derive the secure columns whenever aadhar_card_no is written.
     *
     * setAadhaarNumber() below is the deliberate path, but nothing was obliged
     * to use it: aadhar_card_no is fillable, so every ordinary create/update —
     * registration, the employee form, the appointment form, the importer —
     * mass-assigned the plaintext and left encrypted_aadhaar_number,
     * aadhaar_last_four and aadhaar_secure_reference null. Production shows the
     * result exactly: 334 users with a plaintext number and zero with any of
     * the three. The encryption was written, shipped, and never once reached.
     *
     * Doing it here rather than in each controller is what makes it true for
     * write paths nobody has thought about yet, including future ones.
     *
     * Deliberately still writes the plaintext column. Readers across documents,
     * auth and disclosure still fall back to it, so blanking it here would trade
     * an at-rest problem for missing Aadhaar numbers on live screens. Retiring
     * the column is a separate, ordered step: backfill, verify every reader
     * prefers the encrypted value, then drop the plaintext.
     */
    public function setAadharCardNoAttribute($value): void
    {
        $this->attributes['aadhar_card_no'] = $value;

        // The three columns below come from
        // 2026_07_30_000001_add_aadhaar_reference_to_users_table. That has run
        // in production — the columns exist there, empty — but it has not run
        // everywhere: a deployment restored from an older snapshot, or one
        // whose migrations are stranded behind an unrecorded migration, still
        // lacks them. Assigning to a column that does not exist fails the whole
        // INSERT, which would turn every employee and appointment save into a
        // 500. Probing costs one memoised information_schema lookup per
        // process, which is cheap next to that.
        if (!SchemaSupport::hasColumn('users', 'encrypted_aadhaar_number')) {
            return;
        }

        $digits = \App\Support\AadhaarReference::normalise((string) $value);

        // Partial or malformed legacy values are stored as they arrive, as
        // before. Deriving a reference from a number that is not one would put
        // junk in the column the document folders are keyed on — and production
        // has 39 single-character values and one UUID in this column.
        if (!\App\Support\AadhaarReference::isValid($digits)) {
            return;
        }

        $this->attributes['encrypted_aadhaar_number'] = $this->castAttributeAsEncryptedString(
            'encrypted_aadhaar_number',
            $digits
        );
        $this->attributes['aadhaar_last_four'] = substr($digits, -4);

        try {
            $this->attributes['aadhaar_secure_reference'] = \App\Support\AadhaarReference::secureReference($digits);
        } catch (\RuntimeException) {
            // AADHAAR_REFERENCE_SECRET is unset. The number is still encrypted
            // and masked; only the storage key is unavailable. Refusing the
            // whole write would take employee records down over a missing
            // config value.
        }
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

    public function authorizationRoleAssignments()
    {
        return $this->hasMany(AuthorizationRoleAssignment::class);
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
