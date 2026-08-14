<?php

namespace App\Services\JobArchitecture;

use App\Models\JobRequirement;
use App\Models\Job;
use App\Models\User;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * DOMAIN 03.01 — Job Requirement Service.
 *
 * Manages structured requirements for jobs.
 * Supports: Education, Experience, Skill, Certification, Competency, Language, Travel, Security Clearance.
 * Each requirement can be: mandatory, preferred, minimum, maximum.
 */
class JobRequirementService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'job-requirements';

    public function requirements(int $jobId, array $filters, ?User $actor): array
    {
        $job = Job::query()->findOrFail($jobId);
        $this->assertJobVisible($job, $actor);

        $query = $job->requirements()->orderBy('type')->orderBy('category');

        if (!empty($filters['type'])) {
            $query->where('type', $filters['type']);
        }

        if (!empty($filters['category'])) {
            $query->where('category', $filters['category']);
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

        return $query->get()->map(fn (JobRequirement $req) => $this->present($req))->all();
    }

    public function present(JobRequirement $req): array
    {
        return [
            'id' => (int) $req->id,
            'jobId' => (int) $req->job_id,
            'type' => $req->type,
            'requirement' => $req->requirement,
            'category' => $req->category,
            'details' => $req->details,
            'effectiveFrom' => $req->effective_from?->toDateString(),
            'effectiveTo' => $req->effective_to?->toDateString(),
            'createdAt' => $req->created_at,
        ];
    }

    public function create(int $jobId, array $data, User $actor): JobRequirement
    {
        $job = Job::query()->findOrFail($jobId);
        $this->assertJobVisible($job, $actor);

        $this->validateRequirement($data);

        $req = DB::transaction(function () use ($jobId, $data, $actor) {
            return JobRequirement::query()->create([
                'job_id' => $jobId,
                'type' => $data['type'],
                'requirement' => trim((string) $data['requirement']),
                'category' => $data['category'] ?? 'mandatory',
                'details' => $data['details'] ?? null,
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);
        });

        $this->audit($actor, 'JOB_REQUIREMENT_CREATED', null, $this->snapshot($req));

        return $req;
    }

    public function update(JobRequirement $req, array $data, User $actor): JobRequirement
    {
        $this->assertRequirementVisible($req, $actor);
        $before = $this->snapshot($req);

        $this->validateRequirement($data, $req->id);

        if (array_key_exists('type', $data)) {
            $req->type = $data['type'];
        }

        if (array_key_exists('requirement', $data)) {
            $req->requirement = trim((string) $data['requirement']);
        }

        if (array_key_exists('category', $data)) {
            $req->category = $data['category'];
        }

        if (array_key_exists('details', $data)) {
            $req->details = $data['details'];
        }

        if (array_key_exists('effectiveFrom', $data)) {
            $req->effective_from = $this->blankToNull($data['effectiveFrom']);
        }

        if (array_key_exists('effectiveTo', $data)) {
            $req->effective_to = $this->blankToNull($data['effectiveTo']);
        }

        DB::transaction(fn () => $req->save());

        $this->audit($actor, 'JOB_REQUIREMENT_UPDATED', $before, $this->snapshot($req));

        return $req;
    }

    public function delete(JobRequirement $req, User $actor): void
    {
        $this->assertRequirementVisible($req, $actor);

        $snapshot = $this->snapshot($req);

        DB::transaction(fn () => $req->delete());

        $this->audit($actor, 'JOB_REQUIREMENT_DELETED', $snapshot, null);
    }

    private function validateRequirement(array $data, ?int $ignoreId = null): void
    {
        if (empty($data['type']) || !in_array($data['type'], JobRequirement::TYPES)) {
            throw new JobArchitectureException(
                'INVALID_REQUIREMENT_TYPE',
                'Invalid requirement type. Must be one of: ' . implode(', ', JobRequirement::TYPES),
                422
            );
        }

        if (!empty($data['category']) && !in_array($data['category'], JobRequirement::CATEGORIES)) {
            throw new JobArchitectureException(
                'INVALID_REQUIREMENT_CATEGORY',
                'Invalid requirement category. Must be one of: ' . implode(', ', JobRequirement::CATEGORIES),
                422
            );
        }

        // Validate details structure based on type
        if (!empty($data['details']) && is_array($data['details'])) {
            $this->validateDetailsByType($data['type'], $data['details']);
        }
    }

    private function validateDetailsByType(string $type, array $details): void
    {
        switch ($type) {
            case 'education':
                // { qualification, degree, field, min_level, preferred_level, institution }
                break;
            case 'experience':
                // { min_years, max_years, relevant, industry, functional }
                if (isset($details['min_years']) && !is_numeric($details['min_years'])) {
                    throw new JobArchitectureException('INVALID_EXPERIENCE', 'min_years must be numeric', 422);
                }
                if (isset($details['max_years']) && !is_numeric($details['max_years'])) {
                    throw new JobArchitectureException('INVALID_EXPERIENCE', 'max_years must be numeric', 422);
                }
                break;
            case 'skill':
                // { skill, proficiency, mandatory, years, certification_link }
                break;
            case 'certification':
                // { certification, authority, mandatory, expiry, renewal, verification }
                break;
            case 'competency':
                // { competency, level, behavioral, functional, leadership, technical }
                break;
            case 'language':
                // { language, speaking, reading, writing, listening, proficiency }
                break;
            case 'travel':
                // { type, percentage, domestic, international }
                break;
            case 'security_clearance':
                // { type, required, level, expiry, verification }
                break;
        }
    }

    private function assertRequirementVisible(JobRequirement $req, ?User $actor): void
    {
        $this->assertJobVisible($req->job, $actor);
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

    private function snapshot(JobRequirement $req): array
    {
        return [
            'id' => (int) $req->id,
            'jobId' => (int) $req->job_id,
            'type' => $req->type,
            'requirement' => $req->requirement,
            'category' => $req->category,
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