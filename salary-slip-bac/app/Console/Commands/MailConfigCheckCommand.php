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

    private const NON_DELIVERING = ['log', 'array', 'null'];

    public function handle(): int
    {
        $mailer = (string) config('mail.default');
        $from = (string) config('mail.from.address');

        $this->line('Mailer: ' . $mailer);
        $this->line('From:   ' . ($from !== '' ? $from : '(unset)'));

        $problems = [];

        if (in_array($mailer, self::NON_DELIVERING, true)) {
            $problems[] = "MAIL_MAILER={$mailer} does not deliver mail. Recipients receive nothing.";
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
