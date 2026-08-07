<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

/**
 * Deployment gate for mail configuration.
 *
 * This exists because MAIL_MAILER=log fails silently: Laravel accepts every
 * send, writes the message to the application log, and returns success, so the
 * application, its tests and its monitoring all report a healthy mail system
 * while no recipient receives anything. Nothing in the request path can detect
 * that, which is why it has to be asserted at deploy time instead.
 */
class MailConfigCheckCommand extends Command
{
    protected $signature = 'mail:config-check';

    protected $description = 'Fail if mail is misconfigured for a real deployment (e.g. the log transport).';

    /**
     * Transports this deployment is allowed to use for real delivery.
     *
     * An allowlist, not a deny-list of `log`/`array`/`null`. A deny-list only
     * catches the transports somebody thought of, so the next non-delivering or
     * misconfigured driver passes the gate silently — which is the exact failure
     * mode this command exists to prevent. Adding a provider is a deliberate
     * edit here.
     */
    private const ALLOWED_PRODUCTION_MAILERS = ['smtp'];

    public function handle(): int
    {
        $mailer = (string) config('mail.default');
        $from = (string) config('mail.from.address');
        $environment = app()->environment();

        $this->line('Environment: ' . $environment);
        $this->line('Mailer:      ' . $mailer);
        $this->line('From:        ' . ($from !== '' ? $from : '(unset)'));

        $problems = [];

        if (! in_array($mailer, self::ALLOWED_PRODUCTION_MAILERS, true)) {
            $problems[] = sprintf(
                'MAIL_MAILER=%s is not an approved delivering transport (allowed: %s).',
                $mailer !== '' ? $mailer : '(unset)',
                implode(', ', self::ALLOWED_PRODUCTION_MAILERS)
            );
        }

        if ($from === '') {
            $problems[] = 'MAIL_FROM_ADDRESS is empty.';
        }

        if ($mailer === 'smtp') {
            foreach (['host' => 'MAIL_HOST', 'port' => 'MAIL_PORT', 'username' => 'MAIL_USERNAME'] as $key => $label) {
                if (blank(config("mail.mailers.smtp.{$key}"))) {
                    $problems[] = "{$label} is empty while MAIL_MAILER=smtp.";
                }
            }

            // Presence only. The value is never read out or logged.
            if (blank(config('mail.mailers.smtp.password'))) {
                $problems[] = 'MAIL_PASSWORD is empty while MAIL_MAILER=smtp.';
            }
        }

        if ($problems === []) {
            $this->info('Mail configuration is deliverable.');

            return self::SUCCESS;
        }

        foreach ($problems as $problem) {
            $this->error($problem);
        }

        return self::FAILURE;
    }
}
