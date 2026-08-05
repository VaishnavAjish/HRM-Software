<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->index(['type', 'company_code'], 'idx_users_type_company');
            $table->index(['type', 'status'], 'idx_users_type_status');
            $table->index(['company_code', 'unit'], 'idx_users_company_unit');
            $table->index(['role', 'company_code'], 'idx_users_role_company');
            $table->index(['is_deleted', 'role'], 'idx_users_deleted_role');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('idx_users_type_company');
            $table->dropIndex('idx_users_type_status');
            $table->dropIndex('idx_users_company_unit');
            $table->dropIndex('idx_users_role_company');
            $table->dropIndex('idx_users_deleted_role');
        });
    }
};
