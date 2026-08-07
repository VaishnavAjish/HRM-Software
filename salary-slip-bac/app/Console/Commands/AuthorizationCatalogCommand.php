<?php

namespace App\Console\Commands;

use App\Services\Authorization\Matrix\PermissionCatalogSync;
use App\Services\Authorization\Matrix\PermissionValidator;
use Illuminate\Console\Command;

/**
 * Keeps the permissions catalogue in step with the canonical registry and
 * reports authorization coverage gaps.
 *
 * `--check` makes it a quality gate: it writes nothing and exits non-zero when
 * the registry, the catalogue and the route table disagree, so a page or an
 * endpoint that ships without authorization fails the build instead of reaching
 * production as a surface nobody can see on the matrix.
 */
class AuthorizationCatalogCommand extends Command
{
    protected $signature = 'authz:sync-catalog
        {--check : Validate only and exit non-zero on errors}
        {--dry-run : Report what would change without writing}
        {--backfill : Carry existing business-code grants onto canonical codes}
        {--owners : Show the catalogue ownership breakdown}';

    protected $description = 'Synchronise the canonical permission registry with the permissions catalogue';

    public function handle(PermissionCatalogSync $sync, PermissionValidator $validator): int
    {
        if ($this->option('check')) {
            return $this->check($validator);
        }

        $dryRun = (bool) $this->option('dry-run');

        $result = $sync->sync($dryRun);

        $this->info(sprintf(
            '%s catalogue: %d created, %d updated.',
            $dryRun ? 'Would sync' : 'Synced',
            $result['created'],
            $result['updated'],
        ));

        foreach ($result['codes'] as $code) {
            $this->line('  + ' . $code);
        }

        // Preserved codes are reported by their owner, not as anomalies. Core not
        // recognising a permission says nothing about whether it should exist.
        foreach ($result['preserved'] as $owner => $count) {
            $this->line(sprintf('  preserved %-16s %d', $owner, $count));
        }

        foreach ($result['refused'] as $code) {
            $this->warn('  ! refused, not core-owned: ' . $code);
        }

        if ($this->option('owners')) {
            $this->newLine();
            $this->table(
                ['Owner', 'Codes'],
                collect(\App\Support\PermissionOwnership::counts(
                    \Illuminate\Support\Facades\DB::table('permissions')->pluck('code')
                ))->map(fn ($count, $owner) => [$owner, $count])->values()->all(),
            );
        }

        if ($this->option('backfill')) {
            $backfill = $sync->backfillFromBusinessCodes($dryRun);

            $this->info(sprintf(
                '%s backfill: %d canonical grants derived, %d already present, %d partial holdings skipped.',
                $dryRun ? 'Would apply' : 'Applied',
                $backfill['granted'],
                $backfill['skipped'],
                count($backfill['partial']),
            ));

            foreach ($backfill['partial'] as $row) {
                $this->warn(sprintf(
                    '  ~ %s / %s missing %s',
                    $row['role'], $row['code'], implode(', ', $row['missing'])
                ));
            }
        }

        return self::SUCCESS;
    }

    private function check(PermissionValidator $validator): int
    {
        $issues = $validator->all();
        $errors = array_filter($issues, fn ($issue) => $issue['severity'] === PermissionValidator::SEVERITY_ERROR);

        foreach ($issues as $issue) {
            $line = sprintf('[%s] %s — %s (%s)', $issue['severity'], $issue['code'], $issue['message'], $issue['subject']);
            $issue['severity'] === PermissionValidator::SEVERITY_ERROR ? $this->error($line) : $this->warn($line);
        }

        $this->newLine();
        $this->line(sprintf('%d error(s), %d warning(s).', count($errors), count($issues) - count($errors)));

        return $errors === [] ? self::SUCCESS : self::FAILURE;
    }
}
