<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UploadBatchRow extends Model
{
    protected $fillable = ['batch_id', 'row_number', 'status', 'reason', 'row_data'];

    private const DROP_KEYS = ['password', 'otp', 'verification_token'];

    private const MASK_KEYS = [
        'account_no', 'bank_account_no', 'mobile_no', 'mobile_number',
        'aadhar_card_no', 'pan_card_no', 'emp_whatsapp_no', 'mobile_no_2',
        'reference_mobile_no',
    ];

    protected function casts(): array
    {
        return [
            'row_data' => 'array',
        ];
    }

    public function setRowDataAttribute($value): void
    {
        $data = is_array($value) ? $value : (array) $value;

        $this->attributes['row_data'] = json_encode(self::scrubRowData($data));
    }

    public static function scrubRowData(array $data): array
    {
        foreach (self::DROP_KEYS as $key) {
            unset($data[$key]);
        }

        foreach (self::MASK_KEYS as $key) {
            if (isset($data[$key]) && $data[$key] !== '') {
                $raw = (string) $data[$key];
                $data[$key] = strlen($raw) > 4
                    ? str_repeat('*', strlen($raw) - 4) . substr($raw, -4)
                    : '****';
            }
        }

        return $data;
    }

    public function batch()
    {
        return $this->belongsTo(UploadBatch::class, 'batch_id');
    }
}
