<?php

namespace App\Services\JobArchitecture;

use App\Models\JobClassification;
use App\Models\Job;
use App\Models\User;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * DOMAIN 03.01 — Job Classification Service.
 *
 * Manages compliance and regulatory classifications.
 * Supports: Job Class, Worker Class, Employee Group, Job Type, Occupational Category, Compliance Classification.
 */
class JobClassificationService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'job-classifications';

    public function classification(int $jobId, ?User $actor): ?array
    {
        $job = Job::query()->findOrFail($jobId);
        $this->assertJobVisible($job, $actor);

        $classification = $job->classification;

        if (!$classification) {
            return null;
        }

        return $this->present($classification);
    }

    public function present(JobClassification $class): array
    {
        return [
            'id' => (int) $class->id,
            'jobId' => (int) $class->job_id,
            'jobClass' => $class->job_class,
            'workerClass' => $class->worker_class,
            'employeeGroup' => $class->employee_group,
            'jobType' => $class->job_type,
            'occupationalCategory' => $class->occupational_category,
            'complianceClassification' => $class->compliance_classification,
            'additionalClassifications' => $class->additional_classifications,
            'effectiveFrom' => $class->effective_from?->toDateString(),
            'effectiveTo' => $class->effective_to?->toDateString(),
            'createdAt' => $class->created_at,
        ];
    }

    public function createOrUpdate(int $jobId, array $data, User $actor): JobClassification
    {
        $job = Job::query()->findOrFail($jobId);
        $this->assertJobVisible($job, $actor);

        $classification = $job->classification;

        if ($classification) {
            return $this->update($classification, $data, $actor);
        }

        return $this->create($jobId, $data, $actor);
    }

    public function create(int $jobId, array $data, User $actor): JobClassification
    {
        $job = Job::query()->findOrFail($jobId);
        $this->assertJobVisible($job, $actor);

        if ($job->classification) {
            throw new JobArchitectureException(
                'JOB_CLASSIFICATION_EXISTS',
                'This job already has a classification. Use update instead.',
                422
            );
        }

        $class = DB::transaction(function () use ($jobId, $data, $actor) {
            return JobClassification::query()->create([
                'job_id' => $jobId,
                'job_class' => $this->blankToNull($data['jobClass'] ?? null),
                'worker_class' => $this->blankToNull($data['workerClass'] ?? null),
                'employee_group' => $this->blankToNull($data['employeeGroup'] ?? null),
                'job_type' => $this->blankToNull($data['jobType'] ?? null),
                'occupational_category' => $this->blankToNull($data['occupationalCategory'] ?? null),
                'compliance_classification' => $this->blankToNull($data['complianceClassification'] ?? null),
                'additional_classifications' => $data['additionalClassifications'] ?? null,
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);
        });

        $this->audit($actor, 'JOB_CLASSIFICATION_CREATED', null, $this->snapshot($class));

        return $class;
    }

    public function update(JobClassification $class, array $data, User $actor): JobClassification
    {
        $this->assertClassificationVisible($class, $actor);
        $before = $this->snapshot($class);

        $fields = [
            'jobClass' => 'job_class',
            'workerClass' => 'worker_class',
            'employeeGroup' => 'employee_group',
            'jobType' => 'job_type',
            'occupationalCategory' => 'occupational_category',
            'complianceClassification' => 'compliance_classification',
            'additionalClassifications' => 'additional_classifications',
            'effectiveFrom' => 'effective_from',
            'effectiveTo' => 'effective_to',
        ];

        foreach ($fields as $key => $column) {
            if (array_key_exists($key, $data)) {
                $class->$column = $key === 'additionalClassifications' ? $data[$key] : $this->blankToNull($data[$key]);
            }
        }

        DB::transaction(fn () => $class->save());

        $this->audit($actor, 'JOB_CLASSIFICATION_UPDATED', $before, $this->snapshot($class));

        return $class;
    }

    public function delete(JobClassification $class, User $actor): void
    {
        $this->assertClassificationVisible($class, $actor);

        $snapshot = $this->snapshot($class);

        DB::transaction(fn () => $class->delete());

        $this->audit($actor, 'JOB_CLASSIFICATION_DELETED', $snapshot, null);
    }

    private function assertClassificationVisible(JobClassification $class, ?User $actor): void
    {
        $this->assertJobVisible($class->job, $actor);
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

    private function snapshot(JobClassification $class): array
    {
        return [
            'id' => (int) $class->id,
            'jobId' => (int) $class->job_id,
            'jobClass' => $class->job_class,
            'workerClass' => $class->worker_class,
            'employeeGroup' => $class->employee_group,
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