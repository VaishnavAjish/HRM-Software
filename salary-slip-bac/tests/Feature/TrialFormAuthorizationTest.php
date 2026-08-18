<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Trial-form update and delete operated on any user row at all.
 *
 * getTrialForms() narrows to `type = 'trial'` and scopes by the caller's role,
 * but updateTrialForm()/deleteTrialForm() did neither — each took the id
 * straight from the URL, called User::find(), and acted on whatever came back.
 * Two consequences:
 *
 *  1. updateTrialForm() ran $user->update($request->all()), and User::$fillable
 *     contains role, password, company_code and is_deleted. POST
 *     /trial-form/update/{id} is open to agents, so any agent could set
 *     role = 0 on themselves or overwrite a super admin's password — full
 *     privilege escalation and account takeover from an ordinary agent login.
 *
 *  2. User has no SoftDeletes trait, so deleteTrialForm()'s $user->delete() is
 *     a hard delete of any row by id, across every company.
 *
 * The fields the UI actually submits here are small — {print: 1},
 * {checkbox: 0|1}, and the trial-form body — so none of this was reachable by
 * the app itself, only by hand-made requests.
 */
class TrialFormAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private function agent(string $company = 'nidhi-impex'): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Agent {$n}", 'email' => "tf-agent-{$n}@test.local",
            'password' => 'x', 'role' => 4, 'type' => 'agent',
            'company_code' => $company, 'status' => 0, 'is_deleted' => 0,
        ]);
    }

    private function admin(string $company = 'nidhi-impex', int $role = 1): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Admin {$n}", 'email' => "tf-admin-{$n}@test.local",
            'password' => 'x', 'role' => $role, 'company_code' => $company,
            'status' => 0, 'is_deleted' => 0,
        ]);
    }

    private function trialForm(string $company = 'nidhi-impex', ?User $addedBy = null): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Trial {$n}", 'email' => "tf-{$n}@test.local",
            'password' => 'x', 'role' => 3, 'type' => 'trial', 'processed' => 0,
            'company_code' => $company, 'unit' => 'Ichapur',
            'added_by' => $addedBy?->id, 'status' => 0, 'is_deleted' => 0,
        ]);
    }

    private function update(User $actor, int $id, array $payload)
    {
        return $this->withToken(auth('api')->login($actor))
            ->postJson("/api/trial-form/update/{$id}", $payload);
    }

    // ---- privilege escalation --------------------------------------------

    public function test_an_agent_cannot_make_themselves_a_super_admin(): void
    {
        $agent = $this->agent();

        $this->update($agent, $agent->id, ['role' => 0]);

        $this->assertSame(4, (int) $agent->fresh()->role, 'an agent escalated their own role');
    }

    public function test_an_agent_cannot_overwrite_an_administrators_password(): void
    {
        $agent = $this->agent();
        $admin = $this->admin();
        $before = $admin->fresh()->password;

        $this->update($agent, $admin->id, ['password' => 'attacker-chosen']);

        $this->assertSame($before, $admin->fresh()->password, 'an agent reset an admin password');
    }

    public function test_an_agent_cannot_move_a_record_into_another_company(): void
    {
        $agent = $this->agent();
        $form = $this->trialForm('nidhi-impex', $agent);

        $this->update($agent, $form->id, ['company_code' => 'silver-star']);

        $this->assertSame('nidhi-impex', $form->fresh()->company_code);
    }

    public function test_an_agent_cannot_deactivate_an_account(): void
    {
        $agent = $this->agent();
        $admin = $this->admin();

        $this->update($agent, $admin->id, ['is_deleted' => 1]);

        $this->assertSame(0, (int) $admin->fresh()->is_deleted);
    }

    // ---- wrong record type / wrong company --------------------------------

    public function test_the_endpoint_refuses_a_record_that_is_not_a_trial_form(): void
    {
        $admin = $this->admin();
        $victim = $this->admin();

        $this->update($admin, $victim->id, ['name' => 'Renamed'])->assertNotFound();

        $this->assertNotSame('Renamed', $victim->fresh()->name);
    }

    public function test_an_admin_cannot_edit_another_companys_trial_form(): void
    {
        $admin = $this->admin('nidhi-impex');
        $form = $this->trialForm('silver-star');

        $this->update($admin, $form->id, ['name' => 'Renamed'])->assertNotFound();

        $this->assertNotSame('Renamed', $form->fresh()->name);
    }

    public function test_an_admin_cannot_delete_another_companys_trial_form(): void
    {
        $admin = $this->admin('nidhi-impex');
        $form = $this->trialForm('silver-star');

        $this->withToken(auth('api')->login($admin))
            ->deleteJson("/api/trial-form/delete/{$form->id}")
            ->assertNotFound();

        $this->assertNotNull($form->fresh(), 'a cross-company trial form was deleted');
    }

    public function test_delete_refuses_a_record_that_is_not_a_trial_form(): void
    {
        $admin = $this->admin();
        $victim = $this->admin();

        $this->withToken(auth('api')->login($admin))
            ->deleteJson("/api/trial-form/delete/{$victim->id}")
            ->assertNotFound();

        // User has no SoftDeletes, so this would have been permanent.
        $this->assertNotNull($victim->fresh(), 'an administrator was hard-deleted');
    }

    // ---- what must keep working ------------------------------------------

    public function test_an_admin_can_still_mark_a_form_printed(): void
    {
        $admin = $this->admin();
        $form = $this->trialForm('nidhi-impex');

        $this->update($admin, $form->id, ['print' => 1])->assertOk();

        $this->assertSame(1, (int) $form->fresh()->print);
    }

    public function test_an_admin_can_still_approve_a_form(): void
    {
        $admin = $this->admin();
        $form = $this->trialForm('nidhi-impex');

        $this->update($admin, $form->id, ['checkbox' => 1])->assertOk();

        $this->assertSame(1, (int) $form->fresh()->checkbox);
    }

    public function test_an_admin_can_still_edit_the_form_body(): void
    {
        $admin = $this->admin();
        $form = $this->trialForm('nidhi-impex');

        $this->update($admin, $form->id, [
            'name' => 'Corrected Name', 'mobile_number' => '9876543210',
        ])->assertOk();

        $this->assertSame('Corrected Name', $form->fresh()->name);
        $this->assertSame('9876543210', $form->fresh()->mobile_number);
    }

    public function test_an_agent_can_still_edit_their_own_trial_form(): void
    {
        $agent = $this->agent();
        $form = $this->trialForm('nidhi-impex', $agent);

        $this->update($agent, $form->id, ['name' => 'Corrected Name'])->assertOk();

        $this->assertSame('Corrected Name', $form->fresh()->name);
    }

    public function test_an_admin_can_still_delete_their_own_companys_form(): void
    {
        $admin = $this->admin();
        $form = $this->trialForm('nidhi-impex');

        $this->withToken(auth('api')->login($admin))
            ->deleteJson("/api/trial-form/delete/{$form->id}")
            ->assertOk();

        $this->assertNull(User::find($form->id));
    }

    /** A super admin (role 0) is not company-bound and must keep full reach. */
    public function test_a_super_admin_can_edit_any_companys_trial_form(): void
    {
        $super = $this->admin('nidhi-impex', 0);
        $form = $this->trialForm('silver-star');

        $this->update($super, $form->id, ['name' => 'Corrected Name'])->assertOk();

        $this->assertSame('Corrected Name', $form->fresh()->name);
    }

    public function test_super_admin_filling_trial_form_sets_added_by(): void
    {
        $super = $this->admin('nidhi-impex', 0);

        $response = $this->withToken(auth('api')->login($super))
            ->postJson('/api/trial-form/store', [
                'name' => 'Superadmin Candidate',
                'mobile_number' => '9998887770',
                'company_code' => 'nidhi-impex',
            ]);

        $response->assertOk();
        $created = User::where('name', 'Superadmin Candidate')->first();
        $this->assertNotNull($created);
        $this->assertSame($super->id, (int) $created->added_by, 'trial form filled by superadmin must set added_by');
    }

    public function test_agent_only_sees_trial_forms_filled_by_themselves(): void
    {
        $super = $this->admin('nidhi-impex', 0);
        $agent1 = $this->agent('nidhi-impex');
        $agent2 = $this->agent('nidhi-impex');

        $formSuper = $this->trialForm('nidhi-impex', $super);
        $formAgent1 = $this->trialForm('nidhi-impex', $agent1);
        $formAgent2 = $this->trialForm('nidhi-impex', $agent2);

        // Agent 1 lists trial forms
        $response1 = $this->withToken(auth('api')->login($agent1))
            ->getJson('/api/trial-form/list');

        $response1->assertOk();
        $ids1 = collect($response1->json('data'))->pluck('id')->all();

        $this->assertContains($formAgent1->id, $ids1, 'Agent 1 must see their own trial form');
        $this->assertNotContains($formSuper->id, $ids1, 'Agent 1 must NOT see superadmin trial form');
        $this->assertNotContains($formAgent2->id, $ids1, 'Agent 1 must NOT see Agent 2 trial form');
    }

    /**
     * Regression test for a real cross-tenant leak found 2026-08-18: this
     * branch applied no company filter at all for company_code=all/empty
     * regardless of role, so a role-1 (company-scoped) admin could pass
     * ?company_code=all and see every other company's trial-form applicants
     * — including their Aadhaar numbers via AadhaarDisclosure.
     */
    public function test_a_company_admin_cannot_see_another_companys_trial_forms_via_company_code_all(): void
    {
        $admin = $this->admin('nidhi-impex', 1);
        $ownForm = $this->trialForm('nidhi-impex');
        $otherForm = $this->trialForm('silver-star');

        $response = $this->withToken(auth('api')->login($admin))
            ->getJson('/api/trial-form/list?company_code=all');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();

        $this->assertContains($ownForm->id, $ids, 'a company admin must still see their own company\'s trial forms');
        $this->assertNotContains($otherForm->id, $ids, 'a company admin must NOT see another company\'s trial forms via company_code=all');
    }

    /** Same gap, no query string at all — must still fall back to the admin's own company, not everyone's. */
    public function test_a_company_admin_cannot_see_another_companys_trial_forms_with_no_company_code(): void
    {
        $admin = $this->admin('nidhi-impex', 1);
        $ownForm = $this->trialForm('nidhi-impex');
        $otherForm = $this->trialForm('silver-star');

        $response = $this->withToken(auth('api')->login($admin))->getJson('/api/trial-form/list');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();

        $this->assertContains($ownForm->id, $ids);
        $this->assertNotContains($otherForm->id, $ids, 'a company admin must NOT see another company\'s trial forms when no company_code is given');
    }

    /** A super admin (role 0) is the one role that IS meant to be unscoped. */
    public function test_a_super_admin_sees_trial_forms_across_companies(): void
    {
        $super = $this->admin('nidhi-impex', 0);
        $formA = $this->trialForm('nidhi-impex');
        $formB = $this->trialForm('silver-star');

        $response = $this->withToken(auth('api')->login($super))
            ->getJson('/api/trial-form/list?company_code=all');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();

        $this->assertContains($formA->id, $ids);
        $this->assertContains($formB->id, $ids, 'a super admin must still see every company\'s trial forms');
    }
}

