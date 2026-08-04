<?php

namespace App\Console\Commands;

use App\Services\Authorization\SchemaSupport;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class HideSuperAdmin extends Command
{
    protected $signature = 'superadmin:hide
        {email : The email or employee code of the account to conceal}
        {--reveal : Reverse the operation and make the account visible again}';

    protected $description = 'Flag (or unflag) an account as a hidden, protected system super administrator';

    public function handle(): int
    {
        if (!SchemaSupport::hasColumn('users', 'is_hidden')) {
            $this->error('The hidden-account columns are not present. Run the migration first.');

            return self::FAILURE;
        }

        $identifier = (string) $this->argument('email');

        $user = DB::table('users')
            ->where('email', $identifier)
            ->orWhere('emp_code', $identifier)
            ->first(['id', 'role', 'company_code']);

        if (!$user) {
            $this->error('No account matches that email or employee code.');

            return self::FAILURE;
        }

        $reveal = (bool) $this->option('reveal');

        DB::table('users')->where('id', $user->id)->update([
            'is_hidden' => !$reveal,
            'is_super_admin' => !$reveal,
            'is_system_account' => !$reveal,
            'is_protected' => !$reveal,
            'updated_at' => now(),
        ]);

        $this->info($reveal
            ? "Account #{$user->id} is now visible and unprotected."
            : "Account #{$user->id} is now a hidden, protected super administrator.");

        return self::SUCCESS;
    }
}
