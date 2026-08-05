<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The pipeline used to have three interview stages (hr_interview,
 * technical_interview, final_interview); it's now a single "interview"
 * stage. Any candidate already sitting in one of the three old values is
 * moved forward into the new one so they don't get stranded in a stage the
 * app no longer recognises.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('candidates')
            ->whereIn('stage', ['hr_interview', 'technical_interview', 'final_interview'])
            ->update(['stage' => 'interview']);
    }

    public function down(): void
    {
        // Not reversible — the original three-stage split can't be
        // reconstructed once collapsed.
    }
};
