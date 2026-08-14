<?php

namespace App\Services\JobArchitecture;

use App\Models\JobLevel;
use App\Models\Enterprise;
use App\Models\Company;
use App\Models\User;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * DOMAIN 03.01 — Job Level Service.
 *
 * Manages hierarchical job levels (L1, L2, L3, etc.).
 */
class JobLevelService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'job-levels';

    public function levels(array $filters, ?User $actor): array
    {
        $query = JobLevel::query()
            ->with(['enterprise', 'company', 'grades'])
            ->orderBy('rank')
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

        return $query->get()->map(fn (JobLevel $level) => $this->present($level))->all();
    }

    public function present(JobLevel $level): array
    {
        return [
            'id' => (int) $level->id,
            'enterpriseId' => $level->enterprise_id === null ? null : (int) $level->enterprise_id,
            'enterpriseName' => $level->enterprise?->name,
            'companyId' => $level->company_id === null ? null : (int) $level->company_id,
            'companyName' => $level->company?->name,
            'code' => $level->code,
            'name' => $level->name,
            'rank' => (int) $level->rank,
            'description' => $level->description,
            'careerStage' => $level->career_stage,
            'status' => $level->status,
            'effectiveFrom' => $level->effective_from?->toDateString(),
            'effectiveTo' => $level->effective_to?->toDateString(),
            'gradeCount' => $level->grades()->count(),
            'jobCount' => $level->jobs()->count(),
            'createdAt' => $level->created_at,
        ];
    }

    public function create(array $data, User $actor): JobLevel
    {
        $enterpriseId = isset($data['enterpriseId']) && $data['enterpriseId'] !== '' ? (int) $data['enterpriseId'] : null;
        $companyId = isset($data['companyId']) && $data['companyId'] !== '' ? (int) $data['companyId'] : null;

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
                    'Job levels cannot be added to an inactive company.',
                    422
                );
            }
        }

        $code = $data['code'] ?? Str::upper(Str::slug($data['name'], '-'));
        $this->assertCodeFree($enterpriseId, $companyId, $code, null);

        $level = DB::transaction(function () use ($data, $enterpriseId, $companyId, $code, $actor) {
            return JobLevel::query()->create([
                'enterprise_id' => $enterpriseId,
                'company_id' => $companyId,
                'code' => $code,
                'name' => trim((string) $data['name']),
                'rank' => (int) ($data['rank'] ?? 0),
                'description' => $this->blankToNull($data['description'] ?? null),
                'career_stage' => $data['careerStage'] ?? null,
                'status' => $data['status'] ?? 'active',
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);
        });

        $this->audit($actor, 'JOB_LEVEL_CREATED', null, $this->snapshot($level));

        return $level;
    }

    public function update(JobLevel $level, array $data, User $actor): JobLevel
    {
        $this->assertLevelVisible($level, $actor);
        $before = $this->snapshot($level);

        if (array_key_exists('enterpriseId', $data)) {
            $enterpriseId = $data['enterpriseId'] === '' || $data['enterpriseId'] === null ? null : (int) $data['enterpriseId'];
            if ($enterpriseId !== $level->enterprise_id) {
                if ($enterpriseId) {
                    $enterprise = Enterprise::query()->findOrFail($enterpriseId);
                    $this->assertEnterpriseVisible($enterprise, $actor);
                }
                $level->enterprise_id = $enterpriseId;
            }
        }

        if (array_key_exists('companyId', $data)) {
            $companyId = $data['companyId'] === '' || $data['companyId'] === null ? null : (int) $data['companyId'];
            if ($companyId !== $level->company_id) {
                if ($companyId) {
                    $company = Company::query()->findOrFail($companyId);
                    $this->assertCompanyVisible($company, $actor);
                }
                $level->company_id = $companyId;
            }
        }

        if (array_key_exists('code', $data)) {
            $code = trim((string) $data['code']);
            $this->assertCodeFree($level->enterprise_id, $level->company_id, $code, $level->id);
            $level->code = $code;
        }

        if (array_key_exists('name', $data)) {
            $level->name = trim((string) $data['name']);
        }

        if (array_key_exists('rank', $data)) {
            $level->rank = (int) $data['rank'];
        }

        if (array_key_exists('description', $data)) {
            $level->description = $this->blankToNull($data['description']);
        }

        if (array_key_exists('careerStage', $data)) {
            $level->career_stage = $data['careerStage'];
        }

        if (array_key_exists('status', $data)) {
            $level->status = $data['status'];
        }

        if (array_key_exists('effectiveFrom', $data)) {
            $level->effective_from = $this->blankToNull($data['effectiveFrom']);
        }

        if (array_key_exists('effectiveTo', $data)) {
            $level->effective_to = $this->blankToNull($data['effectiveTo']);
        }

        DB::transaction(fn () => $level->save());

        $this->audit($actor, 'JOB_LEVEL_UPDATED', $before, $this->snapshot($level));

        return $level;
    }

    public function delete(JobLevel $level, User $actor): void
    {
        $this->assertLevelVisible($level, $actor);

        if ($level->grades()->exists()) {
            throw new JobArchitectureException(
                'JOB_LEVEL_HAS_GRADES',
                'Cannot delete this level while job grades exist under it. Move or delete them first.',
                422
            );
        }

        if ($level->jobs()->exists()) {
            throw new JobArchitectureException(
                'JOB_LEVEL_HAS_JOBS',
                'Cannot delete this level while jobs reference it. Reassign jobs first.',
                422
            );
        }

        if ($level->designations()->exists()) {
            throw new JobArchitectureException(
                'JOB_LEVEL_HAS_DESIGNATIONS',
                'Cannot delete this level while designations reference it. Reassign designations first.',
                422
            );
        }

        $snapshot = $this->snapshot($level);

        DB::transaction(fn () => $level->delete());

        $this->audit($actor, 'JOB_LEVEL_DELETED', $snapshot, null);
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
        $exists = JobLevel::query()
            ->where('enterprise_id', $enterpriseId)
            ->where('company_id', $companyId)
            ->where('code', $code)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new JobArchitectureException(
                'JOB_LEVEL_CODE_TAKEN',
                'That scope already has a job level with this code.',
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

    private function snapshot(JobLevel $level): array
    {
        return [
            'id' => (int) $level->id,
            'enterpriseId' => $level->enterprise_id === null ? null : (int) $level->enterprise_id,
            'companyId' => $level->company_id === null ? null : (int) $level->company_id,
            'code' => $level->code,
            'name' => $level->name,
            'rank' => (int) $level->rank,
            'status' => $level->status,
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