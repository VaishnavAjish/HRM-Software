<?php

namespace App\Services\JobArchitecture;

use App\Models\JobFamily;
use App\Models\JobFunction;
use App\Models\Enterprise;
use App\Models\Company;
use App\Models\User;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * DOMAIN 03.01 — Job Family Service.
 *
 * Manages groups of related jobs within a function.
 * Example: Technology → Software Engineering, Data, Infrastructure, Cyber Security.
 */
class JobFamilyService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'job-families';

    public function families(array $filters, ?User $actor): array
    {
        $query = JobFamily::query()
            ->with(['enterprise', 'company', 'function'])
            ->orderBy('name');

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

        if (!empty($filters['jobFunctionId'])) {
            $query->where('job_function_id', (int) $filters['jobFunctionId']);
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

        return $query->get()->map(fn (JobFamily $fam) => $this->present($fam))->all();
    }

    public function present(JobFamily $fam): array
    {
        return [
            'id' => (int) $fam->id,
            'enterpriseId' => $fam->enterprise_id === null ? null : (int) $fam->enterprise_id,
            'enterpriseName' => $fam->enterprise?->name,
            'companyId' => $fam->company_id === null ? null : (int) $fam->company_id,
            'companyName' => $fam->company?->name,
            'jobFunctionId' => $fam->job_function_id === null ? null : (int) $fam->job_function_id,
            'jobFunctionName' => $fam->function?->name,
            'jobFunctionCode' => $fam->function?->code,
            'code' => $fam->code,
            'name' => $fam->name,
            'description' => $fam->description,
            'status' => $fam->status,
            'effectiveFrom' => $fam->effective_from?->toDateString(),
            'effectiveTo' => $fam->effective_to?->toDateString(),
            'jobCount' => $fam->jobs()->count(),
            'designationCount' => $fam->designations()->count(),
            'createdAt' => $fam->created_at,
        ];
    }

    public function create(array $data, User $actor): JobFamily
    {
        $enterpriseId = isset($data['enterpriseId']) && $data['enterpriseId'] !== '' ? (int) $data['enterpriseId'] : null;
        $companyId = isset($data['companyId']) && $data['companyId'] !== '' ? (int) $data['companyId'] : null;
        $jobFunctionId = isset($data['jobFunctionId']) && $data['jobFunctionId'] !== '' ? (int) $data['jobFunctionId'] : null;

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
                    'Job families cannot be added to an inactive company.',
                    422
                );
            }
        }

        if ($jobFunctionId) {
            $function = JobFunction::query()->findOrFail($jobFunctionId);
            $this->assertFunctionVisible($function, $actor);
        }

        $code = $data['code'] ?? Str::upper(Str::slug($data['name'], '-'));
        $this->assertCodeFree($enterpriseId, $companyId, $code, null);

        $fam = DB::transaction(function () use ($data, $enterpriseId, $companyId, $jobFunctionId, $code, $actor) {
            return JobFamily::query()->create([
                'enterprise_id' => $enterpriseId,
                'company_id' => $companyId,
                'job_function_id' => $jobFunctionId,
                'code' => $code,
                'name' => trim((string) $data['name']),
                'description' => $this->blankToNull($data['description'] ?? null),
                'status' => $data['status'] ?? 'active',
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);
        });

        $this->audit($actor, 'JOB_FAMILY_CREATED', null, $this->snapshot($fam));

        return $fam;
    }

    public function update(JobFamily $fam, array $data, User $actor): JobFamily
    {
        $this->assertFamilyVisible($fam, $actor);
        $before = $this->snapshot($fam);

        if (array_key_exists('enterpriseId', $data)) {
            $enterpriseId = $data['enterpriseId'] === '' || $data['enterpriseId'] === null ? null : (int) $data['enterpriseId'];
            if ($enterpriseId !== $fam->enterprise_id) {
                if ($enterpriseId) {
                    $enterprise = Enterprise::query()->findOrFail($enterpriseId);
                    $this->assertEnterpriseVisible($enterprise, $actor);
                }
                $fam->enterprise_id = $enterpriseId;
            }
        }

        if (array_key_exists('companyId', $data)) {
            $companyId = $data['companyId'] === '' || $data['companyId'] === null ? null : (int) $data['companyId'];
            if ($companyId !== $fam->company_id) {
                if ($companyId) {
                    $company = Company::query()->findOrFail($companyId);
                    $this->assertCompanyVisible($company, $actor);
                }
                $fam->company_id = $companyId;
            }
        }

        if (array_key_exists('jobFunctionId', $data)) {
            $jobFunctionId = $data['jobFunctionId'] === '' || $data['jobFunctionId'] === null ? null : (int) $data['jobFunctionId'];
            if ($jobFunctionId !== $fam->job_function_id) {
                if ($jobFunctionId) {
                    $function = JobFunction::query()->findOrFail($jobFunctionId);
                    $this->assertFunctionVisible($function, $actor);
                }
                $fam->job_function_id = $jobFunctionId;
            }
        }

        if (array_key_exists('code', $data)) {
            $code = trim((string) $data['code']);
            $this->assertCodeFree($fam->enterprise_id, $fam->company_id, $code, $fam->id);
            $fam->code = $code;
        }

        if (array_key_exists('name', $data)) {
            $fam->name = trim((string) $data['name']);
        }

        if (array_key_exists('description', $data)) {
            $fam->description = $this->blankToNull($data['description']);
        }

        if (array_key_exists('status', $data)) {
            $fam->status = $data['status'];
        }

        if (array_key_exists('effectiveFrom', $data)) {
            $fam->effective_from = $this->blankToNull($data['effectiveFrom']);
        }

        if (array_key_exists('effectiveTo', $data)) {
            $fam->effective_to = $this->blankToNull($data['effectiveTo']);
        }

        DB::transaction(fn () => $fam->save());

        $this->audit($actor, 'JOB_FAMILY_UPDATED', $before, $this->snapshot($fam));

        return $fam;
    }

    public function delete(JobFamily $fam, User $actor): void
    {
        $this->assertFamilyVisible($fam, $actor);

        if ($fam->jobs()->exists()) {
            throw new JobArchitectureException(
                'JOB_FAMILY_HAS_JOBS',
                'Cannot delete this family while jobs reference it. Reassign jobs first.',
                422
            );
        }

        if ($fam->designations()->exists()) {
            throw new JobArchitectureException(
                'JOB_FAMILY_HAS_DESIGNATIONS',
                'Cannot delete this family while designations reference it. Reassign designations first.',
                422
            );
        }

        $snapshot = $this->snapshot($fam);

        DB::transaction(fn () => $fam->delete());

        $this->audit($actor, 'JOB_FAMILY_DELETED', $snapshot, null);
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

    private function assertCodeFree(?int $enterpriseId, ?int $companyId, string $code, ?int $ignoreId): void
    {
        $exists = JobFamily::query()
            ->where('enterprise_id', $enterpriseId)
            ->where('company_id', $companyId)
            ->where('code', $code)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new JobArchitectureException(
                'JOB_FAMILY_CODE_TAKEN',
                'That scope already has a job family with this code.',
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

    private function snapshot(JobFamily $fam): array
    {
        return [
            'id' => (int) $fam->id,
            'enterpriseId' => $fam->enterprise_id === null ? null : (int) $fam->enterprise_id,
            'companyId' => $fam->company_id === null ? null : (int) $fam->company_id,
            'jobFunctionId' => $fam->job_function_id === null ? null : (int) $fam->job_function_id,
            'code' => $fam->code,
            'name' => $fam->name,
            'status' => $fam->status,
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