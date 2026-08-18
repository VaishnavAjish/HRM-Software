<?php

use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\Matrix\PermissionCatalogSync;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Assessment permissions previously piggybacked entirely on hr.training.* —
 * seeded ad hoc in 2026_08_05_000000_create_training_quizzes_table.php,
 * bypassing PermissionRegistry, with no distinction between "manage the quiz
 * library" and "assign/send/revoke an assessment". This registers the real
 * codes through the same registry+matrix pipeline every other hiring feature
 * uses, and grants them to whichever roles already hold the corresponding
 * hr.training.* code so nothing regresses at release — the Matrix gains
 * control of assignment/send/revoke going forward without anyone losing
 * access they already had.
 *
 * hr.training.* itself is untouched and still gates the Quiz Library tab
 * (create/edit/delete quiz definitions) — only the assignment-facing actions
 * (routes/api.php quiz-attempts group) moved to these new codes.
 */
return new class extends Migration
{
    private const CODES = [
        'assessment.view' => ['view', 'READ', false],
        'assessment.assign' => ['assign', 'WRITE', false],
        'assessment.preview_email' => ['preview_email', 'READ', false],
        'assessment.send_invitation' => ['send_invitation', 'WRITE', false],
        'assessment.resend_invitation' => ['resend_invitation', 'WRITE', false],
        'assessment.revoke' => ['revoke', 'WRITE', true],
        'assessment.view_result' => ['view_result', 'READ', false],
        'assessment.extend_deadline' => ['extend_deadline', 'WRITE', false],
        'assessment.reset_attempt' => ['reset_attempt', 'WRITE', true],
        'assessment.manage' => ['manage', 'WRITE', true],
    ];

    private const NODES = [
        'ui.hr.hiring.assessment' => ['Assessments', 75],
        'ui.hr.hiring.assessment_assign' => ['Assign & Send Assessment', 76],
        'ui.hr.hiring.assessment_revoke' => ['Revoke Assessment', 77],
    ];

    public function up(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('role_permissions')) {
            return;
        }

        app(PermissionCatalogSync::class)->sync();

        $groupId = Schema::hasTable('permission_groups')
            ? DB::table('permission_groups')->where('name', 'HR Talent & Assets')->value('id')
            : null;

        foreach (self::CODES as $code => [$action, $level, $sensitive]) {
            if (DB::table('permissions')->where('code', $code)->exists()) {
                continue;
            }
            DB::table('permissions')->insert([
                'name' => $code,
                'code' => $code,
                'resource' => str($code)->beforeLast('.')->toString(),
                'action' => $action,
                'level' => $level,
                'group_id' => $groupId,
                'description' => ucwords(str_replace(['.', '_'], ' ', $code)),
                'is_sensitive' => $sensitive,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // Read + assign-family codes inherit from whoever could already read/
        // create quiz attempts; revoke inherits from whoever could delete them.
        $this->copyAllows('hr.training.read', ['assessment.view', 'assessment.view_result']);
        $this->copyAllows('hr.training.create', ['assessment.assign', 'assessment.preview_email', 'assessment.send_invitation', 'assessment.resend_invitation']);
        $this->copyAllows('hr.training.update', ['assessment.extend_deadline', 'assessment.reset_attempt', 'assessment.manage']);
        $this->copyAllows('hr.training.delete', ['assessment.revoke']);

        $this->copyAllows('hr.training.read', ['ui.hr.hiring.assessment']);
        $this->copyAllows('hr.training.create', ['ui.hr.hiring.assessment_assign']);
        $this->copyAllows('hr.training.delete', ['ui.hr.hiring.assessment_revoke']);

        app(AuthorizationCache::class)->invalidate();
    }

    public function down(): void
    {
    }

    private function copyAllows(string $sourceCode, array $targetCodes): void
    {
        $sourceId = DB::table('permissions')->where('code', $sourceCode)->value('id');
        if ($sourceId === null) {
            return;
        }

        $roleIds = DB::table('role_permissions')
            ->where('permission_id', $sourceId)
            ->where('effect', 'ALLOW')
            ->pluck('role_id');

        foreach ($targetCodes as $targetCode) {
            $targetId = DB::table('permissions')->where('code', $targetCode)->value('id');
            if ($targetId === null) {
                continue;
            }
            foreach ($roleIds as $roleId) {
                DB::table('role_permissions')->insertOrIgnore([
                    'role_id' => $roleId,
                    'permission_id' => $targetId,
                    'effect' => 'ALLOW',
                    'obligations' => null,
                    'inherit_to_children' => true,
                ]);
            }
        }
    }
};
