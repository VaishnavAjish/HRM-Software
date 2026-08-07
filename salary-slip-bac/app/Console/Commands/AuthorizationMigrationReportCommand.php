<?php

namespace App\Console\Commands;

use App\Services\Authorization\Matrix\PermissionMigrationReport;
use Illuminate\Console\Command;

/**
 * Legacy-to-canonical migration coverage for ordinary roles.
 *
 * Read-only by construction: the report service performs no writes, and this
 * command has no mode that changes anything. `--gate` turns it into a readiness
 * check — a role holding a decision with no accounted-for canonical equivalent
 * is a decision that would change behaviour the moment enforcement is switched
 * on, so it fails loudly and names the cause.
 */
class AuthorizationMigrationReportCommand extends Command
{
    protected $signature = 'authz:migration-report
        {--role= : Limit to one role code}
        {--gate : Exit non-zero when ordinary-role migration is not safe}
        {--details : List every unresolved item}
        {--json : Emit the raw report for tooling}';

    protected $description = 'Report legacy-to-canonical permission migration coverage (read-only)';

    public function handle(PermissionMigrationReport $reporter): int
    {
        $report = $reporter->build();

        if ($this->option('json')) {
            $this->line(json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

            return $this->gateResult($report);
        }

        $roles = $report['roles'];

        if ($code = $this->option('role')) {
            $roles = array_values(array_filter($roles, fn ($row) => $row['roleCode'] === $code));

            if ($roles === []) {
                $this->error("No such ordinary role: {$code}");

                return self::FAILURE;
            }
        }

        $this->table(
            ['Role', 'Legacy', 'Canonical', 'Migrated', 'Pending', 'Unmapped', 'Ambig', 'Mismatch', 'Other', 'Status'],
            array_map(fn ($row) => [
                $row['roleCode'],
                $row['legacyDecisions'],
                $row['canonicalDecisions'],
                $row['migrated'],
                $row['pending'],
                $row['unmapped'],
                $row['ambiguous'],
                $row['mismatch'],
                $row['otherOwners'],
                $row['status'],
            ], $roles),
        );

        $this->summary($report);

        if ($this->option('details')) {
            $this->details($roles);
        }

        return $this->gateResult($report);
    }

    private function summary(array $report): void
    {
        $t = $report['totals'];

        $this->newLine();
        $this->line(sprintf(
            'Ordinary roles: %d · legacy decisions: %d · migrated: %d · pending: %d',
            $t['roles'], $t['legacy'], $t['migrated'], $t['pending'],
        ));
        $this->line(sprintf(
            'Unmapped: %d · ambiguous: %d · decision mismatches: %d · unsupported: %d',
            $t['unmapped'], $t['ambiguous'], $t['mismatch'], $t['unsupported'],
        ));
        $this->line(sprintf(
            'Other-owner decisions: %d · unknown-owner decisions: %d',
            $t['otherOwner'], $t['unknownOwner'],
        ));

        foreach ($report['roles'] as $row) {
            foreach ($row['details']['otherOwners'] as $item) {
                $this->line(sprintf('  other-owner  %-10s %-28s %-6s %s', $row['roleCode'], $item['code'], $item['state'], $item['owner']));
            }
        }

        $orphans = $report['orphans'];

        $this->newLine();
        $this->line(sprintf('Legacy codes with no canonical target: %d', $orphans['total']));

        foreach ($orphans['partitions'] as $partition => $codes) {
            $this->line(sprintf('  %-32s %d', $partition, count($codes)));
        }

        foreach ($report['protectedRoles'] as $protected) {
            $this->newLine();
            $this->warn(sprintf(
                'Protected role %s: %d materialised ordinary grants — OUTSIDE ORDINARY MIGRATION GATE, Phase 18 remediation pending.',
                $protected['roleCode'],
                $protected['materialisedGrants'],
            ));
        }
    }

    private function details(array $roles): void
    {
        foreach ($roles as $row) {
            foreach (['pending', 'unmapped', 'ambiguous', 'mismatch', 'unsupported'] as $bucket) {
                foreach ($row['details'][$bucket] as $item) {
                    $this->line(sprintf(
                        '  %-10s %-12s %-32s targets=%s',
                        $row['roleCode'],
                        strtoupper($bucket),
                        $item['legacyCode'],
                        implode(', ', $item['targets'] ?? []) ?: '—',
                    ));
                }
            }
        }
    }

    private function gateResult(array $report): int
    {
        if (! $this->option('gate')) {
            return self::SUCCESS;
        }

        $blockers = $report['blockers'];

        if ($blockers === []) {
            $this->newLine();
            $this->info('Ordinary-role migration coverage is complete.');

            return self::SUCCESS;
        }

        $this->newLine();

        foreach ($blockers as $blocker) {
            $this->error(sprintf(
                'FAIL: role=%s reason=%s legacy=%s(%s)%s',
                $blocker['role'],
                $blocker['reason'],
                $blocker['legacy'],
                $blocker['legacyState'],
                $blocker['canonical'] ? sprintf(' canonical=%s(%s)', $blocker['canonical'], $blocker['canonicalState'] ?? '—') : '',
            ));

            if ($blocker['detail']) {
                $this->line('      ' . $blocker['detail']);
            }
        }

        return self::FAILURE;
    }
}
