<?php

namespace App\Services\JobArchitecture;

use App\Models\JobResponsibility;
use App\Models\Job;
use App\Models\User;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * DOMAIN 03.01 — Job Responsibility Service.
 *
 * Manages structured responsibilities linked to jobs.
 * Multiple responsibilities per job with priority, percentage, competency, KPI/KRA linkage.
 */
class JobResponsibilityService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'job-responsibilities';

    public function responsibilities(int $jobId, array $filters, ?User $actor): array
    {
        $job = Job::query()->findOrFail($jobId);
        $this->assertJobVisible($job, $actor);

        $query = $job->responsibilities()->orderBy('priority');

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

        return $query->get()->map(fn (JobResponsibility $resp) => $this->present($resp))->all();
    }

    public function present(JobResponsibility $resp): array
    {
        return [
            'id' => (int) $resp->id,
            'jobId' => (int) $resp->job_id,
            'responsibility' => $resp->responsibility,
            'priority' => (int) $resp->priority,
            'percentage' => $resp->percentage ? (float) $resp->percentage : null,
            'competencyId' => $resp->competency_id === null ? null : (int) $resp->competency_id,
            'kpiLinkage' => $resp->kpi_linkage,
            'kraLinkage' => $resp->kra_linkage,
            'effectiveFrom' => $resp->effective_from?->toDateString(),
            'effectiveTo' => $resp->effective_to?->toDateString(),
            'createdAt' => $resp->created_at,
        ];
    }

    public function create(int $jobId, array $data, User $actor): JobResponsibility
    {
        $job = Job::query()->findOrFail($jobId);
        $this->assertJobVisible($job, $actor);

        $resp = DB::transaction(function () use ($jobId, $data, $actor) {
            return JobResponsibility::query()->create([
                'job_id' => $jobId,
                'responsibility' => trim((string) $data['responsibility']),
                'priority' => (int) ($data['priority'] ?? 0),
                'percentage' => $data['percentage'] ?? null,
                'competency_id' => $data['competencyId'] ?? null,
                'kpi_linkage' => $this->blankToNull($data['kpiLinkage'] ?? null),
                'kra_linkage' => $this->blankToNull($data['kraLinkage'] ?? null),
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);
        });

        $this->audit($actor, 'JOB_RESPONSIBILITY_CREATED', null, $this->snapshot($resp));

        return $resp;
    }

    public function update(JobResponsibility $resp, array $data, User $actor): JobResponsibility
    {
        $this->assertResponsibilityVisible($resp, $actor);
        $before = $this->snapshot($resp);

        if (array_key_exists('responsibility', $data)) {
            $resp->responsibility = trim((string) $data['responsibility']);
        }

        if (array_key_exists('priority', $data)) {
            $resp->priority = (int) $data['priority'];
        }

        if (array_key_exists('percentage', $data)) {
            $resp->percentage = $data['percentage'] ?? null;
        }

        if (array_key_exists('competencyId', $data)) {
            $resp->competency_id = $data['competencyId'] ?? null;
        }

        if (array_key_exists('kpiLinkage', $data)) {
            $resp->kpi_linkage = $this->blankToNull($data['kpiLinkage']);
        }

        if (array_key_exists('kraLinkage', $data)) {
            $resp->kra_linkage = $this->blankToNull($data['kraLinkage']);
        }

        if (array_key_exists('effectiveFrom', $data)) {
            $resp->effective_from = $this->blankToNull($data['effectiveFrom']);
        }

        if (array_key_exists('effectiveTo', $data)) {
            $resp->effective_to = $this->blankToNull($data['effectiveTo']);
        }

        DB::transaction(fn () => $resp->save());

        $this->audit($actor, 'JOB_RESPONSIBILITY_UPDATED', $before, $this->snapshot($resp));

        return $resp;
    }

    public function delete(JobResponsibility $resp, User $actor): void
    {
        $this->assertResponsibilityVisible($resp, $actor);

        $snapshot = $this->snapshot($resp);

        DB::transaction(fn () => $resp->delete());

        $this->audit($actor, 'JOB_RESPONSIBILITY_DELETED', $snapshot, null);
    }

    private function assertResponsibilityVisible(JobResponsibility $resp, ?User $actor): void
    {
        $this->assertJobVisible($resp->job, $actor);
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

    private function blankToNull(mixed $value): ?string
    {
        if ($value === null || (is_string($value) && trim($value) === '')) {
            return null;
        }
        return trim((string) $value);
    }

    private function snapshot(JobResponsibility $resp): array
    {
        return [
            'id' => (int) $resp->id,
            'jobId' => (int) $resp->job_id,
            'responsibility' => $resp->responsibility,
            'priority' => (int) $resp->priority,
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