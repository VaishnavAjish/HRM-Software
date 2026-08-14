<?php

namespace App\Services\JobArchitecture;

use App\Models\JobDescription;
use App\Models\Job;
use App\Models\User;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * DOMAIN 03.01 — Job Description Service.
 *
 * Manages versioned structured job descriptions.
 * Never overwrites historical job descriptions used by past employees or recruitment campaigns.
 */
class JobDescriptionService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'job-descriptions';

    public function descriptions(int $jobId, array $filters, ?User $actor): array
    {
        $job = Job::query()->findOrFail($jobId);
        $this->assertJobVisible($job, $actor);

        $query = $job->descriptions()->orderByDesc('version');

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('status', $status);
        }

        return $query->get()->map(fn (JobDescription $desc) => $this->present($desc))->all();
    }

    public function present(JobDescription $desc): array
    {
        return [
            'id' => (int) $desc->id,
            'jobId' => (int) $desc->job_id,
            'version' => (int) $desc->version,
            'summary' => $desc->summary,
            'purpose' => $desc->purpose,
            'responsibilities' => $desc->responsibilities,
            'qualifications' => $desc->qualifications,
            'skills' => $desc->skills,
            'competencies' => $desc->competencies,
            'experience' => $desc->experience,
            'education' => $desc->education,
            'workConditions' => $desc->work_conditions,
            'travelRequirements' => $desc->travel_requirements,
            'risk' => $desc->risk,
            'remoteEligible' => (bool) $desc->remote_eligible,
            'remoteEligibilityType' => $desc->remote_eligibility_type,
            'remoteConditions' => $desc->remote_conditions,
            'status' => $desc->status,
            'createdBy' => $desc->created_by === null ? null : (int) $desc->created_by,
            'createdByName' => $desc->creator?->name,
            'approvedBy' => $desc->approved_by === null ? null : (int) $desc->approved_by,
            'approvedByName' => $desc->approver?->name,
            'approvedAt' => $desc->approved_at?->toISOString(),
            'effectiveFrom' => $desc->effective_from?->toDateString(),
            'effectiveTo' => $desc->effective_to?->toDateString(),
            'createdAt' => $desc->created_at,
        ];
    }

    public function create(int $jobId, array $data, User $actor): JobDescription
    {
        $job = Job::query()->findOrFail($jobId);
        $this->assertJobVisible($job, $actor);

        $nextVersion = $job->descriptions()->max('version') + 1;

        $desc = DB::transaction(function () use ($jobId, $data, $nextVersion, $actor) {
            return JobDescription::query()->create([
                'job_id' => $jobId,
                'version' => $nextVersion,
                'summary' => $this->blankToNull($data['summary'] ?? null),
                'purpose' => $this->blankToNull($data['purpose'] ?? null),
                'responsibilities' => $this->blankToNull($data['responsibilities'] ?? null),
                'qualifications' => $this->blankToNull($data['qualifications'] ?? null),
                'skills' => $this->blankToNull($data['skills'] ?? null),
                'competencies' => $this->blankToNull($data['competencies'] ?? null),
                'experience' => $this->blankToNull($data['experience'] ?? null),
                'education' => $this->blankToNull($data['education'] ?? null),
                'work_conditions' => $this->blankToNull($data['workConditions'] ?? null),
                'travel_requirements' => $this->blankToNull($data['travelRequirements'] ?? null),
                'risk' => $this->blankToNull($data['risk'] ?? null),
                'remote_eligible' => (bool) ($data['remoteEligible'] ?? false),
                'remote_eligibility_type' => $data['remoteEligibilityType'] ?? null,
                'remote_conditions' => $data['remoteConditions'] ?? null,
                'status' => $data['status'] ?? 'draft',
                'created_by' => $actor->id,
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);
        });

        $this->audit($actor, 'JOB_DESCRIPTION_CREATED', null, $this->snapshot($desc));

        return $desc;
    }

    public function update(JobDescription $desc, array $data, User $actor): JobDescription
    {
        $this->assertDescriptionVisible($desc, $actor);
        $before = $this->snapshot($desc);

        // Only allow updates to draft descriptions
        if ($desc->status !== 'draft') {
            throw new JobArchitectureException(
                'JOB_DESCRIPTION_NOT_DRAFT',
                'Only draft descriptions can be modified. Create a new version for changes.',
                422
            );
        }

        $fields = [
            'summary', 'purpose', 'responsibilities', 'qualifications', 'skills',
            'competencies', 'experience', 'education', 'work_conditions',
            'travel_requirements', 'risk', 'remote_eligible', 'remote_eligibility_type',
            'remote_conditions', 'status', 'effective_from', 'effective_to'
        ];

        foreach ($fields as $field) {
            $key = Str::studly($field);
            if (array_key_exists($key, $data)) {
                $desc->$field = $field === 'remote_eligible' ? (bool) $data[$key] : $this->blankToNull($data[$key]);
            }
        }

        if (array_key_exists('approvedBy', $data) && $data['approvedBy']) {
            $desc->approved_by = (int) $data['approvedBy'];
            $desc->approved_at = now();
            $desc->status = 'published';
        }

        DB::transaction(fn () => $desc->save());

        $this->audit($actor, 'JOB_DESCRIPTION_UPDATED', $before, $this->snapshot($desc));

        return $desc;
    }

    public function publish(JobDescription $desc, User $actor): JobDescription
    {
        $this->assertDescriptionVisible($desc, $actor);

        if ($desc->status === 'published') {
            throw new JobArchitectureException(
                'JOB_DESCRIPTION_ALREADY_PUBLISHED',
                'This description is already published.',
                422
            );
        }

        $before = $this->snapshot($desc);

        $desc->status = 'published';
        $desc->approved_by = $actor->id;
        $desc->approved_at = now();
        $desc->save();

        $this->audit($actor, 'JOB_DESCRIPTION_PUBLISHED', $before, $this->snapshot($desc));

        return $desc;
    }

    public function archive(JobDescription $desc, User $actor): JobDescription
    {
        $this->assertDescriptionVisible($desc, $actor);

        if ($desc->status === 'archived') {
            throw new JobArchitectureException(
                'JOB_DESCRIPTION_ALREADY_ARCHIVED',
                'This description is already archived.',
                422
            );
        }

        $before = $this->snapshot($desc);

        $desc->status = 'archived';
        $desc->save();

        $this->audit($actor, 'JOB_DESCRIPTION_ARCHIVED', $before, $this->snapshot($desc));

        return $desc;
    }

    private function assertDescriptionVisible(JobDescription $desc, ?User $actor): void
    {
        $this->assertJobVisible($desc->job, $actor);
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

    private function snapshot(JobDescription $desc): array
    {
        return [
            'id' => (int) $desc->id,
            'jobId' => (int) $desc->job_id,
            'version' => (int) $desc->version,
            'status' => $desc->status,
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