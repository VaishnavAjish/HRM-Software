<?php

namespace App\Providers;

use Illuminate\Console\Events\CommandStarting;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\ServiceProvider;

/**
 * Blocks the artisan commands that can erase the database unless the operator
 * has explicitly opted in. This exists because an unguarded migrate:fresh wiped
 * niss_hrms on 2026-08-04; the guard makes that a deliberate act, not an
 * accident.
 *
 * A destructive command is permitted only when ALL of these hold:
 *   - APP_ENV=local
 *   - ALLOW_DESTRUCTIVE_DB=true
 *   - DEVELOPER_MODE=true
 *
 * The automated test suite (APP_ENV=testing) is exempt so RefreshDatabase keeps
 * working. Every blocked attempt is logged.
 */
class ProductionSafetyServiceProvider extends ServiceProvider
{
    private const DESTRUCTIVE = [
        'migrate:fresh',
        'migrate:refresh',
        'migrate:reset',
        'db:wipe',
        'schema:dump',
    ];

    public function boot(): void
    {
        Event::listen(CommandStarting::class, function (CommandStarting $event): void {
            // RefreshDatabase runs migrate:fresh on the test database by design.
            if ($this->app->environment('testing')) {
                return;
            }

            $command = (string) ($event->command ?? '');
            if ($command === '') {
                return;
            }

            $raw = $this->rawInput($event);
            $forcedSeed = $command === 'db:seed' && str_contains($raw, '--force');

            if (! in_array($command, self::DESTRUCTIVE, true) && ! $forcedSeed) {
                return;
            }

            if ($this->overrideGranted()) {
                return;
            }

            $this->block($command, $raw);
        });
    }

    private function overrideGranted(): bool
    {
        return $this->app->environment('local')
            && $this->flag('ALLOW_DESTRUCTIVE_DB')
            && $this->flag('DEVELOPER_MODE');
    }

    private function flag(string $key): bool
    {
        return filter_var(env($key, false), FILTER_VALIDATE_BOOL);
    }

    private function rawInput(CommandStarting $event): string
    {
        try {
            return (string) $event->input;
        } catch (\Throwable) {
            return '';
        }
    }

    private function block(string $command, string $raw): void
    {
        Log::warning('Production Safety: blocked a destructive database command', [
            'command' => $command,
            'input' => $raw,
            'environment' => $this->app->environment(),
        ]);

        if (\PHP_SAPI === 'cli') {
            fwrite(STDERR, \PHP_EOL
                . '  ============================================' . \PHP_EOL
                . '  Production Safety Protection Enabled' . \PHP_EOL
                . '  Blocked destructive command: ' . $command . \PHP_EOL
                . '  Override (local only) requires ALL of:' . \PHP_EOL
                . '    APP_ENV=local, ALLOW_DESTRUCTIVE_DB=true, DEVELOPER_MODE=true' . \PHP_EOL
                . '  ============================================' . \PHP_EOL . \PHP_EOL);
        }

        throw new \RuntimeException(
            "Production Safety: '{$command}' is blocked. Set APP_ENV=local, ALLOW_DESTRUCTIVE_DB=true and DEVELOPER_MODE=true to override."
        );
    }
}
