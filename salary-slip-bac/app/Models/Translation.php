<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Translation — Domain 00.4 Localization.
 *
 * Translation management for multi-language support. Stores translation keys
 * and their translations per language. Uses translation keys as the authoritative
 * source, not duplicated page implementations per language.
 *
 * Translation Key → Language → Translation
 *
 * Supports fallback when translation is missing.
 */
class Translation extends Model
{
    protected $fillable = [
        'key',
        'language_code',
        'value',
        'description',
    ];

    protected $casts = [
        'value' => 'string',
    ];

    public $timestamps = false;

    public function staticValue(string $key, string $languageCode): string
    {
        $translation = self::where('key', $key)
            ->where('language_code', $languageCode)
            ->where('status', 'active')
            ->first();

        return $translation?->value ?? $this->fallbackValue($key, $languageCode);
    }

    public function fallbackValue(string $key, string $languageCode): string
    {
        // Fallback to English if translation missing
        if ($languageCode !== 'en') {
            $english = self::staticValue($key, 'en');
            if (!empty($english)) {
                return $english;
            }
        }
        return $key; // Return key as last resort
    }

    public function supportedLanguages(): array
    {
        return Language::supportedLanguages();
    }

    public function isRtlLanguage(string $languageCode): bool
    {
        $language = Language::where('code', $languageCode)->first();
        return $language?->isRtl() ?? false;
    }

    public function translate(string $key, string $languageCode = null, array $placeholders = []): string
    {
        if (is_null($languageCode)) {
            $languageCode = config('app.locale', 'en');
        }

        $value = self::staticValue($key, $languageCode);

        // Apply placeholder replacement if needed
        foreach ($placeholders as $placeholder => $value) {
            $value = str_replace("{{$placeholder}}", $value, $value);
        }

        return $value;
    }
}