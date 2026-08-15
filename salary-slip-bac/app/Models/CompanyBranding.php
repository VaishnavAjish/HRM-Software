<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Company branding — Domain 00.1 Tenant Branding management.
 *
 * Stores branding assets per company (tenant). Each company has exactly one
 * branding record. Assets include logo, favicon, login background, and theme
 * colors. Uses storage paths referencing the existing file storage system.
 *
 * Branding isolation: Tenant A's branding must never leak into Tenant B.
 * All assets are tenant-scoped and validated server-side.
 */
class CompanyBranding extends Model
{
    protected $fillable = [
        'company_id',
        'logo_path',
        'favicon_path',
        'login_background_path',
        'theme',
        'primary_color',
        'secondary_color',
        'application_name',
        'login_title',
        'copyright_text',
        'email_header',
        'email_footer',
    ];

    protected $casts = [
        'theme' => 'string',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function logoUrl(): string
    {
        return $this->logo_path
            ? asset('storage/' . $this->logo_path)
            : asset('images/default-logo.png');
    }

    public function faviconUrl(): string
    {
        return $this->favicon_path
            ? asset('storage/' . $this->favicon_path)
            : asset('images/default-favicon.ico');
    }

    public function loginBackgroundUrl(): string
    {
        return $this->login_background_path
            ? asset('storage/' . $this->login_background_path)
            : asset('images/default-login-bg.jpg');
    }

    public function isLogoSet(): bool
    {
        return !empty($this->logo_path);
    }

    public function isFaviconSet(): bool
    {
        return !empty($this->favicon_path);
    }

    public function isLoginBackgroundSet(): bool
    {
        return !empty($this->login_background_path);
    }
}