<?php

namespace App\Console\Commands;

use App\Support\PermissionCoverageReport;
use Illuminate\Console\Command;

class PermissionCoverageCommand extends Command
{
    protected $signature = 'authz:coverage {--json} {--strict}';

    protected $description = 'Report navigation, route and registry authorization coverage gaps.';

    public function handle(): int
    {
        $report = PermissionCoverageReport::build();

        if ($this->option('json')) {
            $this->line(json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

            return PermissionCoverageReport::isClean($report) || ! $this->option('strict')
                ? self::SUCCESS
                : self::FAILURE;
        }

        $this->info(sprintf(
            'Navigation routes: %d   Registry-mapped: %d   Unmapped: %d',
            count($report['navRoutes']),
            count($report['registryRoutes']),
            count($report['unmappedNavRoutes'])
        ));

        $this->section('Navigation routes with NO registry mapping', $report['unmappedNavRoutes']);
        $this->section('Registry routes not present in navigation', $report['orphanRegistryRoutes']);
        $this->section('Registry codes missing from the permission catalogue', $report['missingPermissions']);
        $this->section('Registry codes no route middleware enforces', $report['unenforcedRegistryCodes']);
        $this->section('Duplicate permission codes', $report['duplicateNodeCodes']);
        $this->section('Invalid parents', $report['invalidParents']);
        $this->section('Cyclic nodes', $report['cycles']);

        $clean = PermissionCoverageReport::isClean($report);

        if ($clean) {
            $this->info('No fatal registry errors.');
        } else {
            $this->error('Registry has fatal errors (missing permissions, duplicates, bad parents or cycles).');
        }

        if ($report['unmappedNavRoutes'] !== []) {
            $this->warn(sprintf(
                '%d navigation routes have no authorization definition and cannot be gated.',
                count($report['unmappedNavRoutes'])
            ));
        }

        return $clean || ! $this->option('strict') ? self::SUCCESS : self::FAILURE;
    }

    private function section(string $title, array $rows): void
    {
        $this->newLine();
        $this->line("<comment>{$title}: " . count($rows) . '</comment>');

        foreach ($rows as $row) {
            $this->line('  - ' . $row);
        }
    }
}
