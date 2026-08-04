<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const COLUMNS = [
        'username',
        'last_login_at',
        'last_login_ip',
        'locked_at',
        'locked_by',
        'lock_reason',
        'deactivated_at',
        'deactivated_by',
        'deactivation_reason',
    ];

    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'username')) {
                $table->string('username', 64)->nullable();
            }
            if (!Schema::hasColumn('users', 'last_login_at')) {
                $table->timestamp('last_login_at')->nullable();
            }
            if (!Schema::hasColumn('users', 'last_login_ip')) {
                $table->string('last_login_ip', 45)->nullable();
            }
            if (!Schema::hasColumn('users', 'locked_at')) {
                $table->timestamp('locked_at')->nullable();
            }
            if (!Schema::hasColumn('users', 'locked_by')) {
                $table->unsignedBigInteger('locked_by')->nullable();
            }
            if (!Schema::hasColumn('users', 'lock_reason')) {
                $table->text('lock_reason')->nullable();
            }
            if (!Schema::hasColumn('users', 'deactivated_at')) {
                $table->timestamp('deactivated_at')->nullable();
            }
            if (!Schema::hasColumn('users', 'deactivated_by')) {
                $table->unsignedBigInteger('deactivated_by')->nullable();
            }
            if (!Schema::hasColumn('users', 'deactivation_reason')) {
                $table->text('deactivation_reason')->nullable();
            }
        });

        Schema::table('users', function (Blueprint $table) {
            if (!$this->hasIndex('users_username_unique')) {
                $table->unique('username', 'users_username_unique');
            }
            if (!$this->hasIndex('users_locked_at_index')) {
                $table->index('locked_at', 'users_locked_at_index');
            }
            if (!$this->hasIndex('users_deactivated_at_index')) {
                $table->index('deactivated_at', 'users_deactivated_at_index');
            }
            if (!$this->hasIndex('users_last_login_at_index')) {
                $table->index('last_login_at', 'users_last_login_at_index');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            foreach ([
                'users_username_unique',
                'users_locked_at_index',
                'users_deactivated_at_index',
                'users_last_login_at_index',
            ] as $index) {
                if ($this->hasIndex($index)) {
                    $table->dropIndex($index);
                }
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
