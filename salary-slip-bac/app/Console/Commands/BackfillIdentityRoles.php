<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\SchemaSupport;
use App\Support\UserTypeRoles;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Give existing accounts the canonical role their user type already implies.
 *
 * User type lives on users.role as a number, and the Permission Matrix grants to
 * the canonical roles table. UserAccountService keeps the two in step for
 * accounts it creates, but every account made before that — or through one of
 * the other creation paths — has a user type and no canonical role. Those users
 * resolve to zero permissions no matter what the matrix says, because the role
 * the matrix is configuring is not one they hold.
 *
 * The mapping is UserTypeRoles', not this command's: it is the same lookup
 * account creation uses, so a backfilled user is indistinguishable from a newly
 * created one. Types with no mapping are reported and skipped rather than
 * guessed at.
 *
 * Non-identity roles are preserved. Someone holding HR Manager keeps it — that
 * is capability, not identity, and this command has no business revoking it.
 *
 * Reports by default and writes only with --apply, because assigning roles in
 * bulk grants access to real accounts.
 */
class BackfillIdentityRoles extends Command
{
    protected $signature = 'users:backfill-identity-roles
                            {--apply : Write the assignments. Without this the command only reports.}
                            {--type= : Restrict to one users.role value.}';

    protected $description = 'Assign the canonical role implied by each account\'s user type.';

    public function handle(AuthorizationCache $cache): int
    {
        if (! SchemaSupport::hasTable('user_roles')) {
            $this->error('user_roles table is absent; nothing to backfill.');

            return self::FAILURE;
        }

        $apply = (bool) $this->option('apply');
        $identityIds = UserTypeRoles::identityRoleIds();

        $query = User::query()->orderBy('id');

        if ($this->option('type') !== null) {
            $query->where('role', $this->option('type'));
        }

        $assigned = 0;
        $already = 0;
        $unmapped = [];
        $touchedTenants = [];

        foreach ($query->cursor() as $user) {
            $target = UserTypeRoles::roleFor($user->role);

            if ($target === null) {
                $unmapped[(string) $user->role] = ($unmapped[(string) $user->role] ?? 0) + 1;
                continue;
            }

            $held = DB::table('user_roles')->where('user_id', $user->id)->pluck('role_id')->all();

            if (in_array($target->id, $held, true)) {
                $already++;
                continue;
            }

            $assigned++;
            $touchedTenants[(string) $user->company_code] = $user->company_code;

            if (! $apply) {
                continue;
            }

            DB::transaction(function () use ($user, $target, $held, $identityIds) {
                $keep = array_values(array_filter(
                    $held,
                    fn ($id) => ! in_array($id, $identityIds, true)
                ));
                $keep[] = $target->id;

                $user->roles()->sync(array_values(array_unique($keep)));
            });
        }

        $this->newLine();
        $this->line($apply ? 'Applied.' : 'Dry run — nothing was written. Re-run with --apply to commit.');
        $this->table(
            ['Outcome', 'Users'],
            [
                [$apply ? 'assigned' : 'would assign', $assigned],
                ['already correct', $already],
                ['skipped, user type has no role', array_sum($unmapped)],
            ]
        );

        foreach ($unmapped as $type => $count) {
            $this->warn("users.role={$type}: {$count} account(s) have no canonical role mapping.");
        }

        if ($apply && $assigned > 0) {
            foreach ($touchedTenants as $tenant) {
                $cache->invalidate($tenant ?: null);
            }
            $cache->invalidate(null);
            $this->info('Authorization snapshots invalidated.');
        }

        return self::SUCCESS;
    }
}
