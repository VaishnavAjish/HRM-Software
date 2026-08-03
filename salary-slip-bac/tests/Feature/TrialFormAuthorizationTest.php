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
}
