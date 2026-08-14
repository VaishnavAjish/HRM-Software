<?php

namespace App\Services\JobArchitecture;

use App\Models\JobCategory;
use App\Models\Enterprise;
use App\Models\Company;
use App\Models\User;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * DOMAIN 03.01 — Job Category Service.
 *
 * Manages categorical classification of jobs (Management, Professional, Technical, etc.).
 */
class JobCategoryService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'job-categories';

    public function categories(array $filters, ?User $actor): array
    {
        $query = JobCategory::query()
            ->with(['enterprise', 'company'])
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

        return $query->get()->map(fn (JobCategory $cat) => $this->present($cat))->all();
    }

    public function present(JobCategory $cat): array
    {
        return [
            'id' => (int) $cat->id,
            'enterpriseId' => $cat->enterprise_id === null ? null : (int) $cat->enterprise_id,
            'enterpriseName' => $cat->enterprise?->name,
            'companyId' => $cat->company_id === null ? null : (int) $cat->company_id,
            'companyName' => $cat->company?->name,
            'code' => $cat->code,
            'name' => $cat->name,
            'description' => $cat->description,
            'status' => $cat->status,
            'sortOrder' => (int) $cat->sort_order,
            'effectiveFrom' => $cat->effective_from?->toDateString(),
            'effectiveTo' => $cat->effective_to?->toDateString(),
            'jobCount' => $cat->jobs()->count(),
            'createdAt' => $cat->created_at,
        ];
    }

    public function create(array $data, User $actor): JobCategory
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
                    'Job categories cannot be added to an inactive company.',
                    422
                );
            }
        }

        $code = $data['code'] ?? Str::upper(Str::slug($data['name'], '-'));
        $this->assertCodeFree($enterpriseId, $companyId, $code, null);

        $cat = DB::transaction(function () use ($data, $enterpriseId, $companyId, $code, $actor) {
            return JobCategory::query()->create([
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

        $this->audit($actor, 'JOB_CATEGORY_CREATED', null, $this->snapshot($cat));

        return $cat;
    }

    public function update(JobCategory $cat, array $data, User $actor): JobCategory
    {
        $this->assertCategoryVisible($cat, $actor);
        $before = $this->snapshot($cat);

        if (array_key_exists('enterpriseId', $data)) {
            $enterpriseId = $data['enterpriseId'] === '' || $data['enterpriseId'] === null ? null : (int) $data['enterpriseId'];
            if ($enterpriseId !== $cat->enterprise_id) {
                if ($enterpriseId) {
                    $enterprise = Enterprise::query()->findOrFail($enterpriseId);
                    $this->assertEnterpriseVisible($enterprise, $actor);
                }
                $cat->enterprise_id = $enterpriseId;
            }
        }

        if (array_key_exists('companyId', $data)) {
            $companyId = $data['companyId'] === '' || $data['companyId'] === null ? null : (int) $data['companyId'];
            if ($companyId !== $cat->company_id) {
                if ($companyId) {
                    $company = Company::query()->findOrFail($companyId);
                    $this->assertCompanyVisible($company, $actor);
                }
                $cat->company_id = $companyId;
            }
        }

        if (array_key_exists('code', $data)) {
            $code = trim((string) $data['code']);
            $this->assertCodeFree($cat->enterprise_id, $cat->company_id, $code, $cat->id);
            $cat->code = $code;
        }

        if (array_key_exists('name', $data)) {
            $cat->name = trim((string) $data['name']);
        }

        if (array_key_exists('description', $data)) {
            $cat->description = $this->blankToNull($data['description']);
        }

        if (array_key_exists('status', $data)) {
            $cat->status = $data['status'];
        }

        if (array_key_exists('sortOrder', $data)) {
            $cat->sort_order = (int) $data['sortOrder'];
        }

        if (array_key_exists('effectiveFrom', $data)) {
            $cat->effective_from = $this->blankToNull($data['effectiveFrom']);
        }

        if (array_key_exists('effectiveTo', $data)) {
            $cat->effective_to = $this->blankToNull($data['effectiveTo']);
        }

        DB::transaction(fn () => $cat->save());

        $this->audit($actor, 'JOB_CATEGORY_UPDATED', $before, $this->snapshot($cat));

        return $cat;
    }

    public function delete(JobCategory $cat, User $actor): void
    {
        $this->assertCategoryVisible($cat, $actor);

        if ($cat->jobs()->exists()) {
            throw new JobArchitectureException(
                'JOB_CATEGORY_HAS_JOBS',
                'Cannot delete this category while jobs reference it. Reassign jobs first.',
                422
            );
        }

        $snapshot = $this->snapshot($cat);

        DB::transaction(fn () => $cat->delete());

        $this->audit($actor, 'JOB_CATEGORY_DELETED', $snapshot, null);
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

    private function assertCodeFree(?int $enterpriseId, ?int $companyId, string $code, ?int $ignoreId): void
    {
        $exists = JobCategory::query()
            ->where('enterprise_id', $enterpriseId)
            ->where('company_id', $companyId)
            ->where('code', $code)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new JobArchitectureException(
                'JOB_CATEGORY_CODE_TAKEN',
                'That scope already has a job category with this code.',
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

    private function snapshot(JobCategory $cat): array
    {
        return [
            'id' => (int) $cat->id,
            'enterpriseId' => $cat->enterprise_id === null ? null : (int) $cat->enterprise_id,
            'companyId' => $cat->company_id === null ? null : (int) $cat->company_id,
            'code' => $cat->code,
            'name' => $cat->name,
            'status' => $cat->status,
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