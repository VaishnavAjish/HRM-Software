<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Language — Domain 00.3 Global Master Data.
 *
 * Supported languages for the application. Used for user interface
 * localization and interface language selection.
 *
 * Language directionality is stored for RTL layout support.
 */
class Language extends Model
{
    protected $fillable = [
        'code',
        'name',
        'native_name',
        'directionality',
        'status',
    ];

    protected $casts = [
        'directionality' => 'string',
    ];

    public $timestamps = false;

    public static function supportedLanguages(): array
    {
        return [
            'en' => ['name' => 'English', 'native_name' => 'English', 'directionality' => 'ltr'],
            'es' => ['name' => 'Spanish', 'native_name' => 'Español', 'directionality' => 'ltr'],
            'fr' => ['name' => 'French', 'native_name' => 'Français', 'directionality' => 'ltr'],
            'de' => ['name' => 'German', 'native_name' => 'Deutsch', 'directionality' => 'ltr'],
            'hi' => ['name' => 'Hindi', 'native_name' => 'हिंदी', 'directionality' => 'ltr'],
            'ar' => ['name' => 'Arabic', 'native_name' => 'العربية', 'directionality' => 'rtl'],
            'zh' => ['name' => 'Chinese', 'native_name' => '中文', 'directionality' => 'ltr'],
            'ja' => ['name' => 'Japanese', 'native_name' => '日本語', 'directionality' => 'ltr'],
            'ru' => ['name' => 'Russian', 'native_name' => 'Русский', 'directionality' => 'ltr'],
        ];
    }

    public function staticByCode(string $code): ?array
    {
        $languages = $this->supportedLanguages();
        return $languages[$code] ?? null;
    }

    public function isRtl(): bool
    {
        return $this->directionality === 'rtl';
    }
}