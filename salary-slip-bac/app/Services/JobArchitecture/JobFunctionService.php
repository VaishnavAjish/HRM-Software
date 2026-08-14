<?php

namespace App\Services\JobArchitecture;

use App\Models\JobFunction;
use App\Models\Enterprise;
use App\Models\Company;
use App\Models\User;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * DOMAIN 03.01 — Job Function Service.
 *
 * Manages functional classification of jobs (HR, Finance, IT, Operations, etc.).
 */
class JobFunctionService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'job-functions';

    public function functions(array $filters, ?User $actor): array
    {
        $query = JobFunction::query()
            ->with(['enterprise', 'company', 'families'])
            ->orderBy('sort_order')
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

        return $query->get()->map(fn (JobFunction $fn) => $this->present($fn))->all();
    }

    public function present(JobFunction $fn): array
    {
        return [
            'id' => (int) $fn->id,
            'enterpriseId' => $fn->enterprise_id === null ? null : (int) $fn->enterprise_id,
            'enterpriseName' => $fn->enterprise?->name,
            'companyId' => $fn->company_id === null ? null : (int) $fn->company_id,
            'companyName' => $fn->company?->name,
            'code' => $fn->code,
            'name' => $fn->name,
            'description' => $fn->description,
            'status' => $fn->status,
            'sortOrder' => (int) $fn->sort_order,
            'effectiveFrom' => $fn->effective_from?->toDateString(),
            'effectiveTo' => $fn->effective_to?->toDateString(),
            'familyCount' => $fn->families()->count(),
            'createdAt' => $fn->created_at,
        ];
    }

    public function create(array $data, User $actor): JobFunction
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
                    'Job functions cannot be added to an inactive company.',
                    422
                );
            }
        }

        $code = $data['code'] ?? Str::upper(Str::slug($data['name'], '-'));
        $this->assertCodeFree($enterpriseId, $companyId, $code, null);

        $fn = DB::transaction(function () use ($data, $enterpriseId, $companyId, $code, $actor) {
            return JobFunction::query()->create([
                'enterprise_id' => $enterpriseId,
                'company_id' => $companyId,
                'code' => $code,
                'name' => trim((string) $data['name']),
                'description' => $this->blankToNull($data['description'] ?? null),
                'status' => $data['status'] ?? 'active',
                'sort_order' => (int) ($data['sortOrder'] ?? 0),
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);
        });

        $this->audit($actor, 'JOB_FUNCTION_CREATED', null, $this->snapshot($fn));

        return $fn;
    }

    public function update(JobFunction $fn, array $data, User $actor): JobFunction
    {
        $this->assertFunctionVisible($fn, $actor);
        $before = $this->snapshot($fn);

        if (array_key_exists('enterpriseId', $data)) {
            $enterpriseId = $data['enterpriseId'] === '' || $data['enterpriseId'] === null ? null : (int) $data['enterpriseId'];
            if ($enterpriseId !== $fn->enterprise_id) {
                if ($enterpriseId) {
                    $enterprise = Enterprise::query()->findOrFail($enterpriseId);
                    $this->assertEnterpriseVisible($enterprise, $actor);
                }
                $fn->enterprise_id = $enterpriseId;
            }
        }

        if (array_key_exists('companyId', $data)) {
            $companyId = $data['companyId'] === '' || $data['companyId'] === null ? null : (int) $data['companyId'];
            if ($companyId !== $fn->company_id) {
                if ($companyId) {
                    $company = Company::query()->findOrFail($companyId);
                    $this->assertCompanyVisible($company, $actor);
                }
                $fn->company_id = $companyId;
            }
        }

        if (array_key_exists('code', $data)) {
            $code = trim((string) $data['code']);
            $this->assertCodeFree($fn->enterprise_id, $fn->company_id, $code, $fn->id);
            $fn->code = $code;
        }

        if (array_key_exists('name', $data)) {
            $fn->name = trim((string) $data['name']);
        }

        if (array_key_exists('description', $data)) {
            $fn->description = $this->blankToNull($data['description']);
        }

        if (array_key_exists('status', $data)) {
            $fn->status = $data['status'];
        }

        if (array_key_exists('sortOrder', $data)) {
            $fn->sort_order = (int) $data['sortOrder'];
        }

        if (array_key_exists('effectiveFrom', $data)) {
            $fn->effective_from = $this->blankToNull($data['effectiveFrom']);
        }

        if (array_key_exists('effectiveTo', $data)) {
            $fn->effective_to = $this->blankToNull($data['effectiveTo']);
        }

        DB::transaction(fn () => $fn->save());

        $this->audit($actor, 'JOB_FUNCTION_UPDATED', $before, $this->snapshot($fn));

        return $fn;
    }

    public function delete(JobFunction $fn, User $actor): void
    {
        $this->assertFunctionVisible($fn, $actor);

        if ($fn->families()->exists()) {
            throw new JobArchitectureException(
                'JOB_FUNCTION_HAS_FAMILIES',
                'Cannot delete this function while job families exist under it. Move or delete them first.',
                422
            );
        }

        if ($fn->jobs()->exists()) {
            throw new JobArchitectureException(
                'JOB_FUNCTION_HAS_JOBS',
                'Cannot delete this function while jobs reference it. Reassign jobs first.',
                422
            );
        }

        $snapshot = $this->snapshot($fn);

        DB::transaction(fn () => $fn->delete());

        $this->audit($actor, 'JOB_FUNCTION_DELETED', $snapshot, null);
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
        $exists = JobFunction::query()
            ->where('enterprise_id', $enterpriseId)
            ->where('company_id', $companyId)
            ->where('code', $code)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new JobArchitectureException(
                'JOB_FUNCTION_CODE_TAKEN',
                'That scope already has a job function with this code.',
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

    private function snapshot(JobFunction $fn): array
    {
        return [
            'id' => (int) $fn->id,
            'enterpriseId' => $fn->enterprise_id === null ? null : (int) $fn->enterprise_id,
            'companyId' => $fn->company_id === null ? null : (int) $fn->company_id,
            'code' => $fn->code,
            'name' => $fn->name,
            'status' => $fn->status,
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