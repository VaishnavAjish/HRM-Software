<?php

use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\Matrix\PermissionCatalogSync;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('permissions')) {
            return;
        }

        app(PermissionCatalogSync::class)->sync();
        app(AuthorizationCache::class)->invalidate();
    }

    public function down(): void
    {
    }
};
