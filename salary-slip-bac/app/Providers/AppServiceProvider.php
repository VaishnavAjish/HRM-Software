<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use RuntimeException;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        $this->refuseUnsupportedDatabase();
    }

    /**
     * PostgreSQL is the only supported engine.
     *
     * Deleting the sqlite block from config/database.php is not enough on its
     * own: Laravel merges its own vendor config file into the application's
     * (Foundation\Bootstrap\LoadConfiguration), so `connections.sqlite` is put
     * back however thoroughly that file is pruned. A stray DB_CONNECTION=sqlite
     * would therefore still resolve — and silently create an empty database
     * file rather than fail. This refuses that instead of trusting it to be
     * unreachable.
     */
    private function refuseUnsupportedDatabase(): void
    {
        $default = config('database.default');

        if ($default !== 'pgsql') {
            throw new RuntimeException(
                "Unsupported database connection [{$default}]. This application "
                .'requires PostgreSQL — set DB_CONNECTION=pgsql.'
            );
        }
    }
}
