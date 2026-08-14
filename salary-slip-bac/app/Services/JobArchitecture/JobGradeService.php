<?php

namespace App\Services\JobArchitecture;

use App\Models\JobGrade;
use App\Models\JobLevel;
use App\Models\Enterprise;
use App\Models\Company;
use App\Models\User;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * DOMAIN 03.01 — Job Grade Service.
 *
 * Manages compensation grades linked to job levels.
 * Integrates with Payroll, Compensation, Promotion, Benefits, Workforce Planning.
 */
class JobGradeService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'job-grades';

    public function grades(array $filters, ?User $actor): array
    {
        $query = JobGrade::query()
            ->with(['enterprise', 'company', 'level'])
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

        if (!empty($filters['jobLevelId'])) {
            $query->where('job_level_id', (int) $filters['jobLevelId']);
        }

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('status', $status);
        }

        if (($search = trim((string) ($filters['search'] ?? ''))) !== '') {
            $query->where(function ($inner) use ($search) {
                $inner->where('name', 'like', "%{$search}%")
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

        return $query->get()->map(fn (JobGrade $grade) => $this->present($grade))->all();
    }

    public function present(JobGrade $grade): array
    {
        return [
            'id' => (int) $grade->id,
            'enterpriseId' => $grade->enterprise_id === null ? null : (int) $grade->enterprise_id,
            'enterpriseName' => $grade->enterprise?->name,
            'companyId' => $grade->company_id === null ? null : (int) $grade->company_id,
            'companyName' => $grade->company?->name,
            'jobLevelId' => $grade->job_level_id === null ? null : (int) $grade->job_level_id,
            'jobLevelName' => $grade->level?->name,
            'jobLevelCode' => $grade->level?->code,
            'code' => $grade->code,
            'name' => $grade->name,
            'description' => $grade->description,
            'currency' => $grade->currency,
            'minSalary' => $grade->min_salary ? (float) $grade->min_salary : null,
            'midSalary' => $grade->mid_salary ? (float) $grade->mid_salary : null,
            'maxSalary' => $grade->max_salary ? (float) $grade->max_salary : null,
            'eligibilityRules' => $grade->eligibility_rules,
            'status' => $grade->status,
            'effectiveFrom' => $grade->effective_from?->toDateString(),
            'effectiveTo' => $grade->effective_to?->toDateString(),
            'jobCount' => $grade->jobs()->count(),
            'designationCount' => $grade->designations()->count(),
            'createdAt' => $grade->created_at,
        ];
    }

    public function create(array $data, User $actor): JobGrade
    {
        $enterpriseId = isset($data['enterpriseId']) && $data['enterpriseId'] !== '' ? (int) $data['enterpriseId'] : null;
        $companyId = isset($data['companyId']) && $data['companyId'] !== '' ? (int) $data['companyId'] : null;
        $jobLevelId = isset($data['jobLevelId']) && $data['jobLevelId'] !== '' ? (int) $data['jobLevelId'] : null;

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
                    'Job grades cannot be added to an inactive company.',
                    422
                );
            }
        }

        if ($jobLevelId) {
            $level = JobLevel::query()->findOrFail($jobLevelId);
            $this->assertLevelVisible($level, $actor);
        }

        $code = $data['code'] ?? Str::upper(Str::slug($data['name'], '-'));
        $this->assertCodeFree($enterpriseId, $companyId, $code, null);

        $grade = DB::transaction(function () use ($data, $enterpriseId, $companyId, $jobLevelId, $code, $actor) {
            return JobGrade::query()->create([
                'enterprise_id' => $enterpriseId,
                'company_id' => $companyId,
                'job_level_id' => $jobLevelId,
                'code' => $code,
                'name' => trim((string) $data['name']),
                'description' => $this->blankToNull($data['description'] ?? null),
                'currency' => $data['currency'] ?? 'INR',
                'min_salary' => $data['minSalary'] ?? null,
                'mid_salary' => $data['midSalary'] ?? null,
                'max_salary' => $data['maxSalary'] ?? null,
                'eligibility_rules' => $data['eligibilityRules'] ?? null,
                'status' => $data['status'] ?? 'active',
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);
        });

        $this->audit($actor, 'JOB_GRADE_CREATED', null, $this->snapshot($grade));

        return $grade;
    }

    public function update(JobGrade $grade, array $data, User $actor): JobGrade
    {
        $this->assertGradeVisible($grade, $actor);
        $before = $this->snapshot($grade);

        if (array_key_exists('enterpriseId', $data)) {
            $enterpriseId = $data['enterpriseId'] === '' || $data['enterpriseId'] === null ? null : (int) $data['enterpriseId'];
            if ($enterpriseId !== $grade->enterprise_id) {
                if ($enterpriseId) {
                    $enterprise = Enterprise::query()->findOrFail($enterpriseId);
                    $this->assertEnterpriseVisible($enterprise, $actor);
                }
                $grade->enterprise_id = $enterpriseId;
            }
        }

        if (array_key_exists('companyId', $data)) {
            $companyId = $data['companyId'] === '' || $data['companyId'] === null ? null : (int) $data['companyId'];
            if ($companyId !== $grade->company_id) {
                if ($companyId) {
                    $company = Company::query()->findOrFail($companyId);
                    $this->assertCompanyVisible($company, $actor);
                }
                $grade->company_id = $companyId;
            }
        }

        if (array_key_exists('jobLevelId', $data)) {
            $jobLevelId = $data['jobLevelId'] === '' || $data['jobLevelId'] === null ? null : (int) $data['jobLevelId'];
            if ($jobLevelId !== $grade->job_level_id) {
                if ($jobLevelId) {
                    $level = JobLevel::query()->findOrFail($jobLevelId);
                    $this->assertLevelVisible($level, $actor);
                }
                $grade->job_level_id = $jobLevelId;
            }
        }

        if (array_key_exists('code', $data)) {
            $code = trim((string) $data['code']);
            $this->assertCodeFree($grade->enterprise_id, $grade->company_id, $code, $grade->id);
            $grade->code = $code;
        }

        if (array_key_exists('name', $data)) {
            $grade->name = trim((string) $data['name']);
        }

        if (array_key_exists('description', $data)) {
            $grade->description = $this->blankToNull($data['description']);
        }

        if (array_key_exists('currency', $data)) {
            $grade->currency = $data['currency'];
        }

        if (array_key_exists('minSalary', $data)) {
            $grade->min_salary = $data['minSalary'] ?? null;
        }

        if (array_key_exists('midSalary', $data)) {
            $grade->mid_salary = $data['midSalary'] ?? null;
        }

        if (array_key_exists('maxSalary', $data)) {
            $grade->max_salary = $data['maxSalary'] ?? null;
        }

        if (array_key_exists('eligibilityRules', $data)) {
            $grade->eligibility_rules = $data['eligibilityRules'];
        }

        if (array_key_exists('status', $data)) {
            $grade->status = $data['status'];
        }

        if (array_key_exists('effectiveFrom', $data)) {
            $grade->effective_from = $this->blankToNull($data['effectiveFrom']);
        }

        if (array_key_exists('effectiveTo', $data)) {
            $grade->effective_to = $this->blankToNull($data['effectiveTo']);
        }

        DB::transaction(fn () => $grade->save());

        $this->audit($actor, 'JOB_GRADE_UPDATED', $before, $this->snapshot($grade));

        return $grade;
    }

    public function delete(JobGrade $grade, User $actor): void
    {
        $this->assertGradeVisible($grade, $actor);

        if ($grade->jobs()->exists()) {
            throw new JobArchitectureException(
                'JOB_GRADE_HAS_JOBS',
                'Cannot delete this grade while jobs reference it. Reassign jobs first.',
                422
            );
        }

        if ($grade->designations()->exists()) {
            throw new JobArchitectureException(
                'JOB_GRADE_HAS_DESIGNATIONS',
                'Cannot delete this grade while designations reference it. Reassign designations first.',
                422
            );
        }

        $snapshot = $this->snapshot($grade);

        DB::transaction(fn () => $grade->delete());

        $this->audit($actor, 'JOB_GRADE_DELETED', $snapshot, null);
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

    private function assertLevelVisible(JobLevel $level, ?User $actor): void
    {
        if ($level->enterprise_id) {
            $this->assertEnterpriseVisible($level->enterprise, $actor);
        }
        if ($level->company_id) {
            $this->assertCompanyVisible($level->company, $actor);
        }
    }

    private function assertCodeFree(?int $enterpriseId, ?int $companyId, string $code, ?int $ignoreId): void
    {
        $exists = JobGrade::query()
            ->where('enterprise_id', $enterpriseId)
            ->where('company_id', $companyId)
            ->where('code', $code)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new JobArchitectureException(
                'JOB_GRADE_CODE_TAKEN',
                'That scope already has a job grade with this code.',
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

    private function snapshot(JobGrade $grade): array
    {
        return [
            'id' => (int) $grade->id,
            'enterpriseId' => $grade->enterprise_id === null ? null : (int) $grade->enterprise_id,
            'companyId' => $grade->company_id === null ? null : (int) $grade->company_id,
            'jobLevelId' => $grade->job_level_id === null ? null : (int) $grade->job_level_id,
            'code' => $grade->code,
            'name' => $grade->name,
            'status' => $grade->status,
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