<?php

namespace App\Services\JobArchitecture;

use App\Models\Job;
use App\Models\JobFamily;
use App\Models\JobFunction;
use App\Models\JobCategory;
use App\Models\JobLevel;
use App\Models\JobGrade;
use App\Models\Designation;
use App\Models\Enterprise;
use App\Models\Company;
use App\Models\User;
use App\Models\OrganizationPosition;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * DOMAIN 03.01 — Job Service.
 *
 * Manages the core job master.
 * Defines "what work is this?" — distinct from Position which defines "where does a seat exist?"
 * Links to Job Family, Function, Category, Level, Grade, Designation.
 * Supports Job Codes (auto-gen + manual), multiple titles, effective dating.
 */
class JobService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'jobs';

    public function jobs(array $filters, ?User $actor): array
    {
        $query = Job::query()
            ->with(['enterprise', 'company', 'family', 'function', 'category', 'level', 'grade', 'designation', 'latestDescription'])
            ->orderBy('code');

        if (!empty($filters['enterpriseId'])) {
            $query->where('enterprise_id', (int) $filters['enterpriseId']);
        }

        if (!empty($filters['companyIds'])) {
            $query->whereIn('company_id', array_map('intval', (array) $filters['companyIds']));
        } elseif (!$this->hasGlobalCompanyScope($actor)) {
            $codes = $this->authorizedCompanyCodes($actor);
            $companyIds = Company::query()->whereIn('code', $codes)->pluck('id')->all();
            $query->whereIn('company_id', $companyIds);
        }

        if (!empty($filters['jobFamilyId'])) {
            $query->where('job_family_id', (int) $filters['jobFamilyId']);
        }

        if (!empty($filters['jobFunctionId'])) {
            $query->where('job_function_id', (int) $filters['jobFunctionId']);
        }

        if (!empty($filters['jobCategoryId'])) {
            $query->where('job_category_id', (int) $filters['jobCategoryId']);
        }

        if (!empty($filters['jobLevelId'])) {
            $query->where('job_level_id', (int) $filters['jobLevelId']);
        }

        if (!empty($filters['jobGradeId'])) {
            $query->where('job_grade_id', (int) $filters['jobGradeId']);
        }

        if (!empty($filters['designationId'])) {
            $query->where('designation_id', (int) $filters['designationId']);
        }

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('status', $status);
        }

        if (($search = trim((string) ($filters['search'] ?? ''))) !== '') {
            $query->where(function ($inner) use ($search) {
                $inner->where('code', 'like', "%{$search}%")
                    ->orWhere('formal_title', 'like', "%{$search}%")
                    ->orWhere('display_title', 'like', "%{$search}%");
            });
        }

        if (($asOf = $filters['asOf'] ?? null) !== null) {
            $query->where(function ($inner) use ($asOf) {
                $inner->where('effective_from', '<=', $asOf)
                    ->orWhereNull('effective_from');
                $inner->where(function ($q) use ($asOf) {
                    $q->where('effective_to', '>=', $asOf)
                        ->orWhereNull('effective_to');
                });
            });
        }

        if (!empty($filters['includeInactive'])) {
            // include all
        } else {
            $query->where('status', 'active');
        }

        return $query->get()->map(fn (Job $job) => $this->present($job))->all();
    }

    public function present(Job $job): array
    {
        return [
            'id' => (int) $job->id,
            'enterpriseId' => $job->enterprise_id === null ? null : (int) $job->enterprise_id,
            'enterpriseName' => $job->enterprise?->name,
            'companyId' => $job->company_id === null ? null : (int) $job->company_id,
            'companyName' => $job->company?->name,
            'jobFamilyId' => $job->job_family_id === null ? null : (int) $job->job_family_id,
            'jobFamilyName' => $job->family?->name,
            'jobFunctionId' => $job->job_function_id === null ? null : (int) $job->job_function_id,
            'jobFunctionName' => $job->function?->name,
            'jobCategoryId' => $job->job_category_id === null ? null : (int) $job->job_category_id,
            'jobCategoryName' => $job->category?->name,
            'jobLevelId' => $job->job_level_id === null ? null : (int) $job->job_level_id,
            'jobLevelName' => $job->level?->name,
            'jobLevelCode' => $job->level?->code,
            'jobGradeId' => $job->job_grade_id === null ? null : (int) $job->job_grade_id,
            'jobGradeName' => $job->grade?->name,
            'designationId' => $job->designation_id === null ? null : (int) $job->designation_id,
            'designationTitle' => $job->designation?->title,
            'code' => $job->code,
            'formalTitle' => $job->formal_title,
            'displayTitle' => $job->display_title,
            'internalTitle' => $job->internal_title,
            'externalTitle' => $job->external_title,
            'localizedTitles' => $job->localized_titles,
            'summary' => $job->summary,
            'purpose' => $job->purpose,
            'status' => $job->status,
            'employmentType' => $job->employment_type,
            'isRemoteEligible' => (bool) $job->is_remote_eligible,
            'remoteEligibilityType' => $job->remote_eligibility_type,
            'remoteConditions' => $job->remote_conditions,
            'effectiveFrom' => $job->effective_from?->toDateString(),
            'effectiveTo' => $job->effective_to?->toDateString(),
            'positionCount' => $job->positions()->count(),
            'responsibilityCount' => $job->responsibilities()->count(),
            'requirementCount' => $job->requirements()->count(),
            'createdAt' => $job->created_at,
        ];
    }

    public function create(array $data, User $actor): Job
    {
        $enterpriseId = isset($data['enterpriseId']) && $data['enterpriseId'] !== '' ? (int) $data['enterpriseId'] : null;
        $companyId = isset($data['companyId']) && $data['companyId'] !== '' ? (int) $data['companyId'] : null;
        $jobFamilyId = isset($data['jobFamilyId']) && $data['jobFamilyId'] !== '' ? (int) $data['jobFamilyId'] : null;
        $jobFunctionId = isset($data['jobFunctionId']) && $data['jobFunctionId'] !== '' ? (int) $data['jobFunctionId'] : null;
        $jobCategoryId = isset($data['jobCategoryId']) && $data['jobCategoryId'] !== '' ? (int) $data['jobCategoryId'] : null;
        $jobLevelId = isset($data['jobLevelId']) && $data['jobLevelId'] !== '' ? (int) $data['jobLevelId'] : null;
        $jobGradeId = isset($data['jobGradeId']) && $data['jobGradeId'] !== '' ? (int) $data['jobGradeId'] : null;
        $designationId = isset($data['designationId']) && $data['designationId'] !== '' ? (int) $data['designationId'] : null;

        if ($enterpriseId) {
            $enterprise = Enterprise::query()->findOrFail($enterpriseId);
            $this->assertEnterpriseVisible($enterprise, $actor);
        }

        if ($companyId) {
            $company = Company::query()->findOrFail($companyId);
            $this->assertCompanyVisible($company, $actor);

            if (!$company->is_active) {
                throw new JobArchitectureException(
                    'COMPANY_INACTIVE',
                    'Jobs cannot be added to an inactive company.',
                    422
                );
            }
        }

        if ($jobFamilyId) {
            $family = JobFamily::query()->findOrFail($jobFamilyId);
            $this->assertFamilyVisible($family, $actor);
        }

        if ($jobFunctionId) {
            $function = JobFunction::query()->findOrFail($jobFunctionId);
            $this->assertFunctionVisible($function, $actor);
        }

        if ($jobCategoryId) {
            $category = JobCategory::query()->findOrFail($jobCategoryId);
            $this->assertCategoryVisible($category, $actor);
        }

        if ($jobLevelId) {
            $level = JobLevel::query()->findOrFail($jobLevelId);
            $this->assertLevelVisible($level, $actor);
        }

        if ($jobGradeId) {
            $grade = JobGrade::query()->findOrFail($jobGradeId);
            $this->assertGradeVisible($grade, $actor);
        }

        if ($designationId) {
            $designation = Designation::query()->findOrFail($designationId);
            $this->assertDesignationVisible($designation, $actor);
        }

        $code = $data['code'] ?? $this->generateJobCode($jobFamilyId, $jobFunctionId, $jobCategoryId);
        $this->assertCodeFree($enterpriseId, $companyId, $code, null);

        $job = DB::transaction(function () use ($data, $enterpriseId, $companyId, $jobFamilyId, $jobFunctionId, $jobCategoryId, $jobLevelId, $jobGradeId, $designationId, $code, $actor) {
            return Job::query()->create([
                'enterprise_id' => $enterpriseId,
                'company_id' => $companyId,
                'job_family_id' => $jobFamilyId,
                'job_function_id' => $jobFunctionId,
                'job_category_id' => $jobCategoryId,
                'job_level_id' => $jobLevelId,
                'job_grade_id' => $jobGradeId,
                'designation_id' => $designationId,
                'code' => $code,
                'formal_title' => trim((string) $data['formalTitle']),
                'display_title' => $this->blankToNull($data['displayTitle'] ?? null),
                'internal_title' => $this->blankToNull($data['internalTitle'] ?? null),
                'external_title' => $this->blankToNull($data['externalTitle'] ?? null),
                'localized_titles' => $data['localizedTitles'] ?? null,
                'summary' => $this->blankToNull($data['summary'] ?? null),
                'purpose' => $this->blankToNull($data['purpose'] ?? null),
                'status' => $data['status'] ?? 'draft',
                'employment_type' => $data['employmentType'] ?? null,
                'is_remote_eligible' => (bool) ($data['isRemoteEligible'] ?? false),
                'remote_eligibility_type' => $data['remoteEligibilityType'] ?? null,
                'remote_conditions' => $data['remoteConditions'] ?? null,
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);
        });

        $this->audit($actor, 'JOB_CREATED', null, $this->snapshot($job));

        return $job;
    }

    public function update(Job $job, array $data, User $actor): Job
    {
        $this->assertJobVisible($job, $actor);
        $before = $this->snapshot($job);

        if (array_key_exists('enterpriseId', $data)) {
            $enterpriseId = $data['enterpriseId'] === '' || $data['enterpriseId'] === null ? null : (int) $data['enterpriseId'];
            if ($enterpriseId !== $job->enterprise_id) {
                if ($enterpriseId) {
                    $enterprise = Enterprise::query()->findOrFail($enterpriseId);
                    $this->assertEnterpriseVisible($enterprise, $actor);
                }
                $job->enterprise_id = $enterpriseId;
            }
        }

        if (array_key_exists('companyId', $data)) {
            $companyId = $data['companyId'] === '' || $data['companyId'] === null ? null : (int) $data['companyId'];
            if ($companyId !== $job->company_id) {
                if ($companyId) {
                    $company = Company::query()->findOrFail($companyId);
                    $this->assertCompanyVisible($company, $actor);
                }
                $job->company_id = $companyId;
            }
        }

        if (array_key_exists('jobFamilyId', $data)) {
            $jobFamilyId = $data['jobFamilyId'] === '' || $data['jobFamilyId'] === null ? null : (int) $data['jobFamilyId'];
            if ($jobFamilyId !== $job->job_family_id) {
                if ($jobFamilyId) {
                    $family = JobFamily::query()->findOrFail($jobFamilyId);
                    $this->assertFamilyVisible($family, $actor);
                }
                $job->job_family_id = $jobFamilyId;
            }
        }

        if (array_key_exists('jobFunctionId', $data)) {
            $jobFunctionId = $data['jobFunctionId'] === '' || $data['jobFunctionId'] === null ? null : (int) $data['jobFunctionId'];
            if ($jobFunctionId !== $job->job_function_id) {
                if ($jobFunctionId) {
                    $function = JobFunction::query()->findOrFail($jobFunctionId);
                    $this->assertFunctionVisible($function, $actor);
                }
                $job->job_function_id = $jobFunctionId;
            }
        }

        if (array_key_exists('jobCategoryId', $data)) {
            $jobCategoryId = $data['jobCategoryId'] === '' || $data['jobCategoryId'] === null ? null : (int) $data['jobCategoryId'];
            if ($jobCategoryId !== $job->job_category_id) {
                if ($jobCategoryId) {
                    $category = JobCategory::query()->findOrFail($jobCategoryId);
                    $this->assertCategoryVisible($category, $actor);
                }
                $job->job_category_id = $jobCategoryId;
            }
        }

        if (array_key_exists('jobLevelId', $data)) {
            $jobLevelId = $data['jobLevelId'] === '' || $data['jobLevelId'] === null ? null : (int) $data['jobLevelId'];
            if ($jobLevelId !== $job->job_level_id) {
                if ($jobLevelId) {
                    $level = JobLevel::query()->findOrFail($jobLevelId);
                    $this->assertLevelVisible($level, $actor);
                }
                $job->job_level_id = $jobLevelId;
            }
        }

        if (array_key_exists('jobGradeId', $data)) {
            $jobGradeId = $data['jobGradeId'] === '' || $data['jobGradeId'] === null ? null : (int) $data['jobGradeId'];
            if ($jobGradeId !== $job->job_grade_id) {
                if ($jobGradeId) {
                    $grade = JobGrade::query()->findOrFail($jobGradeId);
                    $this->assertGradeVisible($grade, $actor);
                }
                $job->job_grade_id = $jobGradeId;
            }
        }

        if (array_key_exists('designationId', $data)) {
            $designationId = $data['designationId'] === '' || $data['designationId'] === null ? null : (int) $data['designationId'];
            if ($designationId !== $job->designation_id) {
                if ($designationId) {
                    $designation = Designation::query()->findOrFail($designationId);
                    $this->assertDesignationVisible($designation, $actor);
                }
                $job->designation_id = $designationId;
            }
        }

        if (array_key_exists('code', $data)) {
            $code = trim((string) $data['code']);
            $this->assertCodeFree($job->enterprise_id, $job->company_id, $code, $job->id);
            $job->code = $code;
        }

        if (array_key_exists('formalTitle', $data)) {
            $job->formal_title = trim((string) $data['formalTitle']);
        }

        if (array_key_exists('displayTitle', $data)) {
            $job->display_title = $this->blankToNull($data['displayTitle']);
        }

        if (array_key_exists('internalTitle', $data)) {
            $job->internal_title = $this->blankToNull($data['internalTitle']);
        }

        if (array_key_exists('externalTitle', $data)) {
            $job->external_title = $this->blankToNull($data['externalTitle']);
        }

        if (array_key_exists('localizedTitles', $data)) {
            $job->localized_titles = $data['localizedTitles'];
        }

        if (array_key_exists('summary', $data)) {
            $job->summary = $this->blankToNull($data['summary']);
        }

        if (array_key_exists('purpose', $data)) {
            $job->purpose = $this->blankToNull($data['purpose']);
        }

        if (array_key_exists('status', $data)) {
            $job->status = $data['status'];
        }

        if (array_key_exists('employmentType', $data)) {
            $job->employment_type = $data['employmentType'];
        }

        if (array_key_exists('isRemoteEligible', $data)) {
            $job->is_remote_eligible = (bool) $data['isRemoteEligible'];
        }

        if (array_key_exists('remoteEligibilityType', $data)) {
            $job->remote_eligibility_type = $data['remoteEligibilityType'];
        }

        if (array_key_exists('remoteConditions', $data)) {
            $job->remote_conditions = $data['remoteConditions'];
        }

        if (array_key_exists('effectiveFrom', $data)) {
            $job->effective_from = $this->blankToNull($data['effectiveFrom']);
        }

        if (array_key_exists('effectiveTo', $data)) {
            $job->effective_to = $this->blankToNull($data['effectiveTo']);
        }

        DB::transaction(fn () => $job->save());

        $this->audit($actor, 'JOB_UPDATED', $before, $this->snapshot($job));

        return $job;
    }

    public function delete(Job $job, User $actor): void
    {
        $this->assertJobVisible($job, $actor);

        if ($job->positions()->exists()) {
            throw new JobArchitectureException(
                'JOB_HAS_POSITIONS',
                'Cannot delete this job while positions reference it. Reassign positions first.',
                422
            );
        }

        if ($job->descriptions()->exists()) {
            throw new JobArchitectureException(
                'JOB_HAS_DESCRIPTIONS',
                'Cannot delete this job while job descriptions exist. Delete them first.',
                422
            );
        }

        if ($job->responsibilities()->exists()) {
            throw new JobArchitectureException(
                'JOB_HAS_RESPONSIBILITIES',
                'Cannot delete this job while responsibilities exist. Delete them first.',
                422
            );
        }

        if ($job->requirements()->exists()) {
            throw new JobArchitectureException(
                'JOB_HAS_REQUIREMENTS',
                'Cannot delete this job while requirements exist. Delete them first.',
                422
            );
        }

        if ($job->evaluations()->exists()) {
            throw new JobArchitectureException(
                'JOB_HAS_EVALUATIONS',
                'Cannot delete this job while evaluations exist. Delete them first.',
                422
            );
        }

        if ($job->classification) {
            throw new JobArchitectureException(
                'JOB_HAS_CLASSIFICATION',
                'Cannot delete this job while classification exists. Delete it first.',
                422
            );
        }

        $snapshot = $this->snapshot($job);

        DB::transaction(fn () => $job->delete());

        $this->audit($actor, 'JOB_DELETED', $snapshot, null);
    }

    public function clone(Job $job, array $data, User $actor): Job
    {
        $this->assertJobVisible($job, $actor);

        $newCode = $data['code'] ?? $this->generateJobCode($job->job_family_id, $job->job_function_id, $job->job_category_id);
        $this->assertCodeFree($job->enterprise_id, $job->company_id, $newCode, null);

        $newJob = DB::transaction(function () use ($job, $data, $newCode, $actor) {
            $newJob = $job->replicate([
                'id', 'code', 'created_at', 'updated_at'
            ]);
            $newJob->code = $newCode;
            $newJob->formal_title = $data['formalTitle'] ?? $job->formal_title . ' (Copy)';
            $newJob->status = 'draft';
            $newJob->effective_from = $this->blankToNull($data['effectiveFrom'] ?? null);
            $newJob->effective_to = $this->blankToNull($data['effectiveTo'] ?? null);
            $newJob->save();

            // Clone descriptions
            foreach ($job->descriptions as $desc) {
                $newDesc = $desc->replicate(['id', 'job_id', 'created_at', 'updated_at']);
                $newDesc->job_id = $newJob->id;
                $newDesc->status = 'draft';
                $newDesc->approved_by = null;
                $newDesc->approved_at = null;
                $newDesc->save();
            }

            // Clone responsibilities
            foreach ($job->responsibilities as $resp) {
                $newResp = $resp->replicate(['id', 'job_id', 'created_at', 'updated_at']);
                $newResp->job_id = $newJob->id;
                $newResp->save();
            }

            // Clone requirements
            foreach ($job->requirements as $req) {
                $newReq = $req->replicate(['id', 'job_id', 'created_at', 'updated_at']);
                $newReq->job_id = $newJob->id;
                $newReq->save();
            }

            // Clone classification
            if ($job->classification) {
                $newClass = $job->classification->replicate(['id', 'job_id', 'created_at', 'updated_at']);
                $newClass->job_id = $newJob->id;
                $newClass->save();
            }

            return $newJob;
        });

        $this->audit($actor, 'JOB_CLONED', null, $this->snapshot($newJob));

        return $newJob;
    }

    private function generateJobCode(?int $familyId, ?int $functionId, ?int $categoryId): string
    {
        $prefix = '';

        if ($familyId) {
            $family = JobFamily::query()->find($familyId);
            if ($family) {
                $prefix .= Str::upper(substr($family->code, 0, 3)) . '-';
            }
        } elseif ($functionId) {
            $function = JobFunction::query()->find($functionId);
            if ($function) {
                $prefix .= Str::upper(substr($function->code, 0, 3)) . '-';
            }
        } elseif ($categoryId) {
            $category = JobCategory::query()->find($categoryId);
            if ($category) {
                $prefix .= Str::upper(substr($category->code, 0, 3)) . '-';
            }
        }

        $sequence = Job::query()
            ->where('code', 'like', $prefix . '%')
            ->count() + 1;

        return $prefix . str_pad((string) $sequence, 3, '0', STR_PAD_LEFT);
    }

    private function assertJobVisible(Job $job, ?User $actor): void
    {
        if ($job->enterprise_id) {
            $this->assertEnterpriseVisible($job->enterprise, $actor);
        }
        if ($job->company_id) {
            $this->assertCompanyVisible($job->company, $actor);
        }
    }

    private function assertFamilyVisible(JobFamily $fam, ?User $actor): void
    {
        if ($fam->enterprise_id) {
            $this->assertEnterpriseVisible($fam->enterprise, $actor);
        }
        if ($fam->company_id) {
            $this->assertCompanyVisible($fam->company, $actor);
        }
    }

    private function assertFunctionVisible(JobFunction $fn, ?User $actor): void
    {
        if ($fn->enterprise_id) {
            $this->assertEnterpriseVisible($fn->enterprise, $actor);
        }
        if ($fn->company_id) {
            $this->assertCompanyVisible($fn->company, $actor);
        }
    }

    private function assertCategoryVisible(JobCategory $cat, ?User $actor): void
    {
        if ($cat->enterprise_id) {
            $this->assertEnterpriseVisible($cat->enterprise, $actor);
        }
        if ($cat->company_id) {
            $this->assertCompanyVisible($cat->company, $actor);
        }
    }

    private function assertLevelVisible(JobLevel $level, ?User $actor): void
    {
        if ($level->enterprise_id) {
            $this->assertEnterpriseVisible($level->enterprise, $actor);
        }
        if ($level->company_id) {
            $this->assertCompanyVisible($level->company, $actor);
        }
    }

    private function assertGradeVisible(JobGrade $grade, ?User $actor): void
    {
        if ($grade->enterprise_id) {
            $this->assertEnterpriseVisible($grade->enterprise, $actor);
        }
        if ($grade->company_id) {
            $this->assertCompanyVisible($grade->company, $actor);
        }
    }

    private function assertDesignationVisible(Designation $des, ?User $actor): void
    {
        if ($des->enterprise_id) {
            $this->assertEnterpriseVisible($des->enterprise, $actor);
        }
        if ($des->company_id) {
            $this->assertCompanyVisible($des->company, $actor);
        }
    }

    private function assertCodeFree(?int $enterpriseId, ?int $companyId, string $code, ?int $ignoreId): void
    {
        $exists = Job::query()
            ->where('enterprise_id', $enterpriseId)
            ->where('company_id', $companyId)
            ->where('code', $code)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new JobArchitectureException(
                'JOB_CODE_TAKEN',
                'That scope already has a job with this code.',
                422
            );
        }
    }

    private function blankToNull(mixed $value): ?string
    {
        if ($value === null || (is_string($value) && trim($value) === '')) {
            return null;
        }
        return trim((string) $value);
    }

    private function snapshot(Job $job): array
    {
        return [
            'id' => (int) $job->id,
            'enterpriseId' => $job->enterprise_id === null ? null : (int) $job->enterprise_id,
            'companyId' => $job->company_id === null ? null : (int) $job->company_id,
            'jobFamilyId' => $job->job_family_id === null ? null : (int) $job->job_family_id,
            'jobFunctionId' => $job->job_function_id === null ? null : (int) $job->job_function_id,
            'jobCategoryId' => $job->job_category_id === null ? null : (int) $job->job_category_id,
            'jobLevelId' => $job->job_level_id === null ? null : (int) $job->job_level_id,
            'jobGradeId' => $job->job_grade_id === null ? null : (int) $job->job_grade_id,
            'designationId' => $job->designation_id === null ? null : (int) $job->designation_id,
            'code' => $job->code,
            'formalTitle' => $job->formal_title,
            'status' => $job->status,
        ];
    }

    private function audit(User $actor, string $changeType, ?array $old, ?array $new): void
    {
        $request = request();
        if ($request) {
            AuditLogger::log($request, $changeType, self::MODULE, $old, $new);
        }
    }
}