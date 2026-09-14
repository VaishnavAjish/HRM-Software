<?php

namespace Database\Seeders;

use App\Models\Mediclaim\MediclaimHospital;
use App\Models\Mediclaim\MediclaimPolicy;
use App\Models\Mediclaim\MediclaimPolicyVersion;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Schema;

/**
 * Seeds the initial Mediclaim policy (+ one published version) for each
 * company, plus the two known network hospitals. Entirely idempotent
 * (firstOrCreate throughout, keyed on the same columns a real duplicate would
 * collide on) so running it again costs nothing.
 *
 * Deliberately does NOT seed:
 *  - `mediclaim_hospital_contacts` — HR enters those manually through the
 *    admin Hospitals screen once numbers/emails are confirmed.
 *  - a `mediclaim_rule_books` row — the actual rule-book PDF is uploaded
 *    through the admin Rule Books screen after deployment; never committed
 *    to source control or referenced by local path here.
 *  - `mediclaim_policy_hospitals` network-membership rows — linking these
 *    two hospitals into a policy version's network is an admin action for a
 *    later phase, not assumed here.
 */
class MediclaimPolicySeeder extends Seeder
{
    /**
     * Rules JSON shared by both companies' initial policy version.
     * PolicyEligibilityService reads every numeric rule from here at claim
     * time — never hardcoded in the service — so this is the single source
     * of truth for the floater cap and the child/parent age limits.
     */
    private const INITIAL_RULES = [
        'floater_limit_amount' => 300000,
        'max_covered_children' => 2,
        'child_max_age_years' => 18,
        'parent_max_age_years' => 55,
        'intimation_required_for_planned' => true,
        // An employee only becomes eligible for Mediclaim self-service
        // (viewing coverage, adding family members, filing claims) once
        // this many full months have passed since their joining_date.
        'eligibility_waiting_period_months' => 3,
    ];

    /** company_code => [policy_code, policy name]. */
    private const POLICIES = [
        'nidhi-impex' => ['NIDHI-IMPEX-MEDICLAIM', 'Nidhi Impex Group Mediclaim Policy'],
        'silver-star' => ['SILVER-STAR-MEDICLAIM', 'Silver Star Group Mediclaim Policy'],
    ];

    /**
     * The two real network hospitals, seeded per company since
     * `mediclaim_hospitals.company_code` is required (not shareable across
     * companies). name => [city, state].
     */
    private const HOSPITALS = [
        'Surat Diamond Hospital' => ['Surat', 'Gujarat'],
        'Kiran Hospital' => ['Surat', 'Gujarat'],
    ];

    public function run(): void
    {
        if (! Schema::hasTable('mediclaim_policies')
            || ! Schema::hasTable('mediclaim_policy_versions')
            || ! Schema::hasTable('mediclaim_hospitals')) {
            return;
        }

        foreach (self::POLICIES as $companyCode => [$policyCode, $policyName]) {
            $policy = MediclaimPolicy::firstOrCreate(
                ['policy_code' => $policyCode],
                [
                    'company_code' => $companyCode,
                    'name' => $policyName,
                    'status' => 'active',
                ]
            );

            // version_number 1 is the only version on first run; a later
            // policy change creates version 2+ through the admin Policies
            // screen, never by editing this row. `rules` is refreshed on
            // every run (not just at creation) so a local dev database
            // picks up rule changes made here without a manual DB edit —
            // a real, admin-published version 2+ is untouched by this,
            // since this seeder only ever targets version_number 1.
            $version = MediclaimPolicyVersion::firstOrCreate(
                ['policy_id' => $policy->id, 'version_number' => 1],
                [
                    'status' => 'active',
                    'rules' => self::INITIAL_RULES,
                    'effective_from' => today(),
                    'published_at' => now(),
                ]
            );
            $version->update(['rules' => self::INITIAL_RULES]);
        }

        foreach (array_keys(self::POLICIES) as $companyCode) {
            foreach (self::HOSPITALS as $name => [$city, $state]) {
                MediclaimHospital::firstOrCreate(
                    ['company_code' => $companyCode, 'name' => $name],
                    ['city' => $city, 'state' => $state]
                );
            }
        }
    }
}
