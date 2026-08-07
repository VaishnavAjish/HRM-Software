<?php

namespace Database\Seeders;

use App\Services\Authorization\Matrix\PermissionCatalogSync;
use App\Support\PermissionOwnership;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Projects the canonical permission registry into the permissions catalogue.
 *
 * This is the reproducible path: a fresh environment reaches the same registry
 * state by running this seeder, rather than by copying rows out of production.
 * `PermissionRegistry` is the only source of definitions — there is no second
 * hand-maintained list to drift from it.
 *
 * Two things it deliberately does not do:
 *
 *  - It writes only codes `PermissionOwnership` says core owns, so seeding can
 *    never reach an agent, employee-portal, legacy or unknown permission.
 *  - It grants nothing to anyone. Deriving role grants from existing business
 *    codes depends on what a given environment already has, so it stays behind
 *    an explicit, report-first command instead of running whenever someone seeds.
 */
class PermissionRegistrySeeder extends Seeder
{
    public function run(): void
    {
        $sync = app(PermissionCatalogSync::class);

        $before = $this->grantFingerprint();

        DB::transaction(function () use ($sync) {
            $result = $sync->sync();

            $this->command?->info(sprintf(
                'Canonical permissions: %d created, %d updated.',
                $result['created'],
                $result['updated'],
            ));

            foreach ($result['preserved'] as $owner => $count) {
                $this->command?->line(sprintf('  preserved %-16s %d', $owner, $count));
            }

            foreach ($result['refused'] as $code) {
                $this->command?->warn('  refused (not core-owned): ' . $code);
            }
        });

        // Proves the seeder kept to definitions. A grant changing here would mean
        // seeding had silently altered who can do what.
        $after = $this->grantFingerprint();

        if ($before !== $after) {
            $this->command?->error('Role grants changed during registry seeding — this seeder must only synchronise definitions.');

            return;
        }

        $this->command?->info('Role grants unchanged.');
    }

    /**
     * A stable fingerprint of every role grant.
     *
     * Deliberately excludes timestamps so an idempotent metadata refresh does not
     * look like a change.
     */
    private function grantFingerprint(): string
    {
        $rows = DB::table('role_permissions as rp')
            ->join('permissions as p', 'p.id', '=', 'rp.permission_id')
            ->orderBy('rp.role_id')
            ->orderBy('p.code')
            ->get(['rp.role_id', 'p.code', 'rp.effect'])
            ->map(fn ($row) => $row->role_id . '|' . $row->code . '|' . ($row->effect ?? ''))
            ->implode("\n");

        return hash('sha256', $rows);
    }

    /** Owner breakdown of the catalogue, for the reviewer. */
    public static function ownershipSummary(): array
    {
        return PermissionOwnership::counts(DB::table('permissions')->pluck('code'));
    }
}
