<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
 * Helpdesk escalation sweep.
 *
 * Every fifteen minutes, matching the cadence the SLA screen describes.
 * withoutOverlapping so a slow pass over a large queue cannot stack up behind
 * itself and escalate the same ticket twice.
 *
 * This needs the scheduler running on the server, otherwise "Auto escalate"
 * remains a stored preference that nothing acts on:
 *   * * * * * cd /path/to/salary-slip-bac && php artisan schedule:run >> /dev/null 2>&1
 */
Schedule::command('tickets:escalate-overdue')
    ->everyFifteenMinutes()
    ->withoutOverlapping()
    ->runInBackground();
