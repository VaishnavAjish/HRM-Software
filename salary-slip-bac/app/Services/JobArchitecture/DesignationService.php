<?php

namespace App\Services\JobArchitecture;

use App\Models\Department;
use App\Models\Designation;
use App\Models\JobFamily;
use App\Models\JobFunction;
use App\Models\JobLevel;
use App\Models\JobGrade;
use App\Models\Enterprise;
use App\Models\Company;
use App\Models\User;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * DOMAIN 03.01 — Designation Service.
 *
 * Manages formal job titles within the architecture.
 * Distinct from Job: Designation is the formal title used in contracts, org charts, etc.
 * Links to Job Family, Function, Level, Grade.
 */
class DesignationService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'designations';

    public function designations(array $filters, ?User $actor): array
    {
        $query = Designation::query()
            ->with(['enterprise', 'company', 'family', 'function', 'level', 'grade', 'department'])
            ->orderBy('title');

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

        if (!empty($filters['jobLevelId'])) {
            $query->where('job_level_id', (int) $filters['jobLevelId']);
        }

        if (!empty($filters['jobGradeId'])) {
            $query->where('job_grade_id', (int) $filters['jobGradeId']);
        }

        if (!empty($filters['departmentId'])) {
            $query->where('department_id', (int) $filters['departmentId']);
        }

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('status', $status);
        }

        if (($search = trim((string) ($filters['search'] ?? ''))) !== '') {
            $query->where(function ($inner) use ($search) {
                $inner->where('title', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%");
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

        return $query->get()->map(fn (Designation $des) => $this->present($des))->all();
    }

    public function present(Designation $des): array
    {
        return [
            'id' => (int) $des->id,
            'enterpriseId' => $des->enterprise_id === null ? null : (int) $des->enterprise_id,
            'enterpriseName' => $des->enterprise?->name,
            'companyId' => $des->company_id === null ? null : (int) $des->company_id,
            'companyName' => $des->company?->name,
            'jobFamilyId' => $des->job_family_id === null ? null : (int) $des->job_family_id,
            'jobFamilyName' => $des->family?->name,
            'jobFunctionId' => $des->job_function_id === null ? null : (int) $des->job_function_id,
            'jobFunctionName' => $des->function?->name,
            'jobLevelId' => $des->job_level_id === null ? null : (int) $des->job_level_id,
            'jobLevelName' => $des->level?->name,
            'jobLevelCode' => $des->level?->code,
            'jobGradeId' => $des->job_grade_id === null ? null : (int) $des->job_grade_id,
            'jobGradeName' => $des->grade?->name,
            'departmentId' => $des->department_id === null ? null : (int) $des->department_id,
            'departmentName' => $des->department?->name,
            'code' => $des->code,
            'title' => $des->title,
            'description' => $des->description,
            'status' => $des->status,
            'effectiveFrom' => $des->effective_from?->toDateString(),
            'effectiveTo' => $des->effective_to?->toDateString(),
            'jobCount' => $des->jobs()->count(),
            'createdAt' => $des->created_at,
        ];
    }

    public function create(array $data, User $actor): Designation
    {
        $enterpriseId = isset($data['enterpriseId']) && $data['enterpriseId'] !== '' ? (int) $data['enterpriseId'] : null;
        $companyId = isset($data['companyId']) && $data['companyId'] !== '' ? (int) $data['companyId'] : null;
        $jobFamilyId = isset($data['jobFamilyId']) && $data['jobFamilyId'] !== '' ? (int) $data['jobFamilyId'] : null;
        $jobFunctionId = isset($data['jobFunctionId']) && $data['jobFunctionId'] !== '' ? (int) $data['jobFunctionId'] : null;
        $jobLevelId = isset($data['jobLevelId']) && $data['jobLevelId'] !== '' ? (int) $data['jobLevelId'] : null;
        $jobGradeId = isset($data['jobGradeId']) && $data['jobGradeId'] !== '' ? (int) $data['jobGradeId'] : null;
        $departmentId = isset($data['departmentId']) && $data['departmentId'] !== '' ? (int) $data['departmentId'] : null;

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
                    'Designations cannot be added to an inactive company.',
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

        if ($jobLevelId) {
            $level = JobLevel::query()->findOrFail($jobLevelId);
            $this->assertLevelVisible($level, $actor);
        }

        if ($jobGradeId) {
            $grade = JobGrade::query()->findOrFail($jobGradeId);
            $this->assertGradeVisible($grade, $actor);
        }

        if ($departmentId) {
            Department::query()->findOrFail($departmentId);
        }

        $code = $data['code'] ?? Str::upper(Str::slug($data['title'], '-'));
        $this->assertCodeFree($enterpriseId, $companyId, $code, null);

        $des = DB::transaction(function () use ($data, $enterpriseId, $companyId, $jobFamilyId, $jobFunctionId, $jobLevelId, $jobGradeId, $departmentId, $code, $actor) {
            return Designation::query()->create([
                'enterprise_id' => $enterpriseId,
                'company_id' => $companyId,
                'job_family_id' => $jobFamilyId,
                'job_function_id' => $jobFunctionId,
                'job_level_id' => $jobLevelId,
                'job_grade_id' => $jobGradeId,
                'department_id' => $departmentId,
                'code' => $code,
                'title' => trim((string) $data['title']),
                'description' => $this->blankToNull($data['description'] ?? null),
                'status' => $data['status'] ?? 'active',
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);
        });

        $this->audit($actor, 'DESIGNATION_CREATED', null, $this->snapshot($des));

        return $des;
    }

    public function update(Designation $des, array $data, User $actor): Designation
    {
        $this->assertDesignationVisible($des, $actor);
        $before = $this->snapshot($des);

        if (array_key_exists('enterpriseId', $data)) {
            $enterpriseId = $data['enterpriseId'] === '' || $data['enterpriseId'] === null ? null : (int) $data['enterpriseId'];
            if ($enterpriseId !== $des->enterprise_id) {
                if ($enterpriseId) {
                    $enterprise = Enterprise::query()->findOrFail($enterpriseId);
                    $this->assertEnterpriseVisible($enterprise, $actor);
                }
                $des->enterprise_id = $enterpriseId;
            }
        }

        if (array_key_exists('companyId', $data)) {
            $companyId = $data['companyId'] === '' || $data['companyId'] === null ? null : (int) $data['companyId'];
            if ($companyId !== $des->company_id) {
                if ($companyId) {
                    $company = Company::query()->findOrFail($companyId);
                    $this->assertCompanyVisible($company, $actor);
                }
                $des->company_id = $companyId;
            }
        }

        if (array_key_exists('jobFamilyId', $data)) {
            $jobFamilyId = $data['jobFamilyId'] === '' || $data['jobFamilyId'] === null ? null : (int) $data['jobFamilyId'];
            if ($jobFamilyId !== $des->job_family_id) {
                if ($jobFamilyId) {
                    $family = JobFamily::query()->findOrFail($jobFamilyId);
                    $this->assertFamilyVisible($family, $actor);
                }
                $des->job_family_id = $jobFamilyId;
            }
        }

        if (array_key_exists('jobFunctionId', $data)) {
            $jobFunctionId = $data['jobFunctionId'] === '' || $data['jobFunctionId'] === null ? null : (int) $data['jobFunctionId'];
            if ($jobFunctionId !== $des->job_function_id) {
                if ($jobFunctionId) {
                    $function = JobFunction::query()->findOrFail($jobFunctionId);
                    $this->assertFunctionVisible($function, $actor);
                }
                $des->job_function_id = $jobFunctionId;
            }
        }

        if (array_key_exists('jobLevelId', $data)) {
            $jobLevelId = $data['jobLevelId'] === '' || $data['jobLevelId'] === null ? null : (int) $data['jobLevelId'];
            if ($jobLevelId !== $des->job_level_id) {
                if ($jobLevelId) {
                    $level = JobLevel::query()->findOrFail($jobLevelId);
                    $this->assertLevelVisible($level, $actor);
                }
                $des->job_level_id = $jobLevelId;
            }
        }

        if (array_key_exists('jobGradeId', $data)) {
            $jobGradeId = $data['jobGradeId'] === '' || $data['jobGradeId'] === null ? null : (int) $data['jobGradeId'];
            if ($jobGradeId !== $des->job_grade_id) {
                if ($jobGradeId) {
                    $grade = JobGrade::query()->findOrFail($jobGradeId);
                    $this->assertGradeVisible($grade, $actor);
                }
                $des->job_grade_id = $jobGradeId;
            }
        }

        if (array_key_exists('departmentId', $data)) {
            $departmentId = $data['departmentId'] === '' || $data['departmentId'] === null ? null : (int) $data['departmentId'];
            if ($departmentId !== $des->department_id) {
                if ($departmentId) {
                    Department::query()->findOrFail($departmentId);
                }
                $des->department_id = $departmentId;
            }
        }

        if (array_key_exists('code', $data)) {
            $code = trim((string) $data['code']);
            $this->assertCodeFree($des->enterprise_id, $des->company_id, $code, $des->id);
            $des->code = $code;
        }

        if (array_key_exists('title', $data)) {
            $des->title = trim((string) $data['title']);
        }

        if (array_key_exists('description', $data)) {
            $des->description = $this->blankToNull($data['description']);
        }

        if (array_key_exists('status', $data)) {
            $des->status = $data['status'];
        }

        if (array_key_exists('effectiveFrom', $data)) {
            $des->effective_from = $this->blankToNull($data['effectiveFrom']);
        }

        if (array_key_exists('effectiveTo', $data)) {
            $des->effective_to = $this->blankToNull($data['effectiveTo']);
        }

        DB::transaction(fn () => $des->save());

        $this->audit($actor, 'DESIGNATION_UPDATED', $before, $this->snapshot($des));

        return $des;
    }

    public function delete(Designation $des, User $actor): void
    {
        $this->assertDesignationVisible($des, $actor);

        if ($des->jobs()->exists()) {
            throw new JobArchitectureException(
                'DESIGNATION_HAS_JOBS',
                'Cannot delete this designation while jobs reference it. Reassign jobs first.',
                422
            );
        }

        $snapshot = $this->snapshot($des);

        DB::transaction(fn () => $des->delete());

        $this->audit($actor, 'DESIGNATION_DELETED', $snapshot, null);
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

    private function assertCodeFree(?int $enterpriseId, ?int $companyId, string $code, ?int $ignoreId): void
    {
        $exists = Designation::query()
            ->where('enterprise_id', $enterpriseId)
            ->where('company_id', $companyId)
            ->where('code', $code)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new JobArchitectureException(
                'DESIGNATION_CODE_TAKEN',
                'That scope already has a designation with this code.',
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

    private function snapshot(Designation $des): array
    {
        return [
            'id' => (int) $des->id,
            'enterpriseId' => $des->enterprise_id === null ? null : (int) $des->enterprise_id,
            'companyId' => $des->company_id === null ? null : (int) $des->company_id,
            'jobFamilyId' => $des->job_family_id === null ? null : (int) $des->job_family_id,
            'jobFunctionId' => $des->job_function_id === null ? null : (int) $des->job_function_id,
            'jobLevelId' => $des->job_level_id === null ? null : (int) $des->job_level_id,
            'jobGradeId' => $des->job_grade_id === null ? null : (int) $des->job_grade_id,
            'departmentId' => $des->department_id === null ? null : (int) $des->department_id,
            'code' => $des->code,
            'title' => $des->title,
            'status' => $des->status,
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