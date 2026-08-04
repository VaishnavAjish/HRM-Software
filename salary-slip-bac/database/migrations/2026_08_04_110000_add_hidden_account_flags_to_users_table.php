<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const COLUMNS = [
        'is_super_admin',
        'is_hidden',
        'is_system_account',
        'is_protected',
    ];

    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'is_super_admin')) {
                $table->boolean('is_super_admin')->default(false);
            }
            if (!Schema::hasColumn('users', 'is_hidden')) {
                $table->boolean('is_hidden')->default(false);
            }
            if (!Schema::hasColumn('users', 'is_system_account')) {
                $table->boolean('is_system_account')->default(false);
            }
            if (!Schema::hasColumn('users', 'is_protected')) {
                $table->boolean('is_protected')->default(false);
            }
        });

        Schema::table('users', function (Blueprint $table) {
            if (!$this->hasIndex('users_is_hidden_index')) {
                $table->index('is_hidden', 'users_is_hidden_index');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if ($this->hasIndex('users_is_hidden_index')) {
                $table->dropIndex('users_is_hidden_index');
            }
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(array_values(array_filter(
                self::COLUMNS,
                static fn (string $column) => Schema::hasColumn('users', $column)
            )));
        });
    }

    private function hasIndex(string $name): bool
    {
        return collect(Schema::getIndexes('users'))
            ->contains(fn (array $index) => ($index['name'] ?? null) === $name);
    }
};
