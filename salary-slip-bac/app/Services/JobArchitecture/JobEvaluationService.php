<?php

namespace App\Services\JobArchitecture;

use App\Models\JobEvaluation;
use App\Models\Job;
use App\Models\User;
use App\Services\Organization\Concerns\VerifiesCompanyAccess;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * DOMAIN 03.01 — Job Evaluation Service.
 *
 * Manages configurable job evaluation records.
 * Supports configurable factors: Responsibility, Complexity, Skills, Decision Making, Leadership, Impact, Experience, Risk.
 * Provides evaluation form, score, evaluator, review date, history, result.
 * Does not build compensation decisions directly unless explicitly configured.
 */
class JobEvaluationService
{
    use VerifiesCompanyAccess;

    public const MODULE = 'job-evaluations';

    public function evaluations(int $jobId, array $filters, ?User $actor): array
    {
        $job = Job::query()->findOrFail($jobId);
        $this->assertJobVisible($job, $actor);

        $query = $job->evaluations()->orderByDesc('review_date');

        if (($status = strtoupper((string) ($filters['status'] ?? ''))) !== '' && $status !== 'ALL') {
            $query->where('status', $status);
        }

        return $query->get()->map(fn (JobEvaluation $eval) => $this->present($eval))->all();
    }

    public function present(JobEvaluation $eval): array
    {
        return [
            'id' => (int) $eval->id,
            'jobId' => (int) $eval->job_id,
            'evaluatorId' => $eval->evaluator_id === null ? null : (int) $eval->evaluator_id,
            'evaluatorName' => $eval->evaluator?->name,
            'factorScores' => $eval->factor_scores,
            'totalScore' => $eval->total_score ? (float) $eval->total_score : null,
            'result' => $eval->result,
            'notes' => $eval->notes,
            'reviewDate' => $eval->review_date?->toDateString(),
            'status' => $eval->status,
            'approvedBy' => $eval->approved_by === null ? null : (int) $eval->approved_by,
            'approvedByName' => $eval->approver?->name,
            'approvedAt' => $eval->approved_at?->toISOString(),
            'effectiveFrom' => $eval->effective_from?->toDateString(),
            'effectiveTo' => $eval->effective_to?->toDateString(),
            'createdAt' => $eval->created_at,
        ];
    }

    public function create(int $jobId, array $data, User $actor): JobEvaluation
    {
        $job = Job::query()->findOrFail($jobId);
        $this->assertJobVisible($job, $actor);

        $evaluatorId = $data['evaluatorId'] ?? $actor->id;

        $this->validateFactorScores($data['factorScores'] ?? []);

        $eval = DB::transaction(function () use ($jobId, $data, $evaluatorId, $actor) {
            return JobEvaluation::query()->create([
                'job_id' => $jobId,
                'evaluator_id' => $evaluatorId,
                'factor_scores' => $data['factorScores'] ?? [],
                'total_score' => $this->calculateTotalScore($data['factorScores'] ?? []),
                'result' => $this->blankToNull($data['result'] ?? null),
                'notes' => $this->blankToNull($data['notes'] ?? null),
                'review_date' => $this->blankToNull($data['reviewDate'] ?? null),
                'status' => $data['status'] ?? 'draft',
                'approved_by' => $data['approvedBy'] ?? null,
                'approved_at' => $data['approvedBy'] ? now() : null,
                'effective_from' => $this->blankToNull($data['effectiveFrom'] ?? null),
                'effective_to' => $this->blankToNull($data['effectiveTo'] ?? null),
            ]);
        });

        $this->audit($actor, 'JOB_EVALUATION_CREATED', null, $this->snapshot($eval));

        return $eval;
    }

    public function update(JobEvaluation $eval, array $data, User $actor): JobEvaluation
    {
        $this->assertEvaluationVisible($eval, $actor);
        $before = $this->snapshot($eval);

        if (array_key_exists('factorScores', $data)) {
            $this->validateFactorScores($data['factorScores']);
            $eval->factor_scores = $data['factorScores'];
            $eval->total_score = $this->calculateTotalScore($data['factorScores']);
        }

        if (array_key_exists('result', $data)) {
            $eval->result = $this->blankToNull($data['result']);
        }

        if (array_key_exists('notes', $data)) {
            $eval->notes = $this->blankToNull($data['notes']);
        }

        if (array_key_exists('reviewDate', $data)) {
            $eval->review_date = $this->blankToNull($data['reviewDate']);
        }

        if (array_key_exists('status', $data)) {
            $eval->status = $data['status'];
        }

        if (array_key_exists('approvedBy', $data)) {
            $eval->approved_by = $data['approvedBy'] ?? null;
            $eval->approved_at = $data['approvedBy'] ? now() : null;
        }

        if (array_key_exists('effectiveFrom', $data)) {
            $eval->effective_from = $this->blankToNull($data['effectiveFrom']);
        }

        if (array_key_exists('effectiveTo', $data)) {
            $eval->effective_to = $this->blankToNull($data['effectiveTo']);
        }

        DB::transaction(fn () => $eval->save());

        $this->audit($actor, 'JOB_EVALUATION_UPDATED', $before, $this->snapshot($eval));

        return $eval;
    }

    public function submit(JobEvaluation $eval, User $actor): JobEvaluation
    {
        $this->assertEvaluationVisible($eval, $actor);

        if ($eval->status !== 'draft') {
            throw new JobArchitectureException(
                'JOB_EVALUATION_NOT_DRAFT',
                'Only draft evaluations can be submitted.',
                422
            );
        }

        if (empty($eval->factor_scores)) {
            throw new JobArchitectureException(
                'JOB_EVALUATION_NO_SCORES',
                'Evaluation must have factor scores before submission.',
                422
            );
        }

        $before = $this->snapshot($eval);

        $eval->status = 'submitted';
        $eval->save();

        $this->audit($actor, 'JOB_EVALUATION_SUBMITTED', $before, $this->snapshot($eval));

        return $eval;
    }

    public function approve(JobEvaluation $eval, User $actor): JobEvaluation
    {
        $this->assertEvaluationVisible($eval, $actor);

        if ($eval->status !== 'submitted') {
            throw new JobArchitectureException(
                'JOB_EVALUATION_NOT_SUBMITTED',
                'Only submitted evaluations can be approved.',
                422
            );
        }

        $before = $this->snapshot($eval);

        $eval->status = 'approved';
        $eval->approved_by = $actor->id;
        $eval->approved_at = now();
        $eval->save();

        $this->audit($actor, 'JOB_EVALUATION_APPROVED', $before, $this->snapshot($eval));

        return $eval;
    }

    public function reject(JobEvaluation $eval, User $actor): JobEvaluation
    {
        $this->assertEvaluationVisible($eval, $actor);

        if ($eval->status !== 'submitted') {
            throw new JobArchitectureException(
                'JOB_EVALUATION_NOT_SUBMITTED',
                'Only submitted evaluations can be rejected.',
                422
            );
        }

        $before = $this->snapshot($eval);

        $eval->status = 'rejected';
        $eval->approved_by = $actor->id;
        $eval->approved_at = now();
        $eval->save();

        $this->audit($actor, 'JOB_EVALUATION_REJECTED', $before, $this->snapshot($eval));

        return $eval;
    }

    public function delete(JobEvaluation $eval, User $actor): void
    {
        $this->assertEvaluationVisible($eval, $actor);

        $snapshot = $this->snapshot($eval);

        DB::transaction(fn () => $eval->delete());

        $this->audit($actor, 'JOB_EVALUATION_DELETED', $snapshot, null);
    }

    private function validateFactorScores(array $scores): void
    {
        foreach (JobEvaluation::FACTORS as $factor) {
            if (isset($scores[$factor])) {
                $score = $scores[$factor];
                if (!is_numeric($score) || $score < 1 || $score > 5) {
                    throw new JobArchitectureException(
                        'INVALID_FACTOR_SCORE',
                        "Factor '$factor' score must be between 1 and 5.",
                        422
                    );
                }
            }
        }
    }

    private function calculateTotalScore(array $scores): ?float
    {
        if (empty($scores)) {
            return null;
        }

        $validScores = array_filter($scores, fn ($v) => is_numeric($v));
        if (empty($validScores)) {
            return null;
        }

        return round(array_sum($validScores) / count($validScores), 2);
    }

    private function assertEvaluationVisible(JobEvaluation $eval, ?User $actor): void
    {
        $this->assertJobVisible($eval->job, $actor);
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

    private function snapshot(JobEvaluation $eval): array
    {
        return [
            'id' => (int) $eval->id,
            'jobId' => (int) $eval->job_id,
            'evaluatorId' => $eval->evaluator_id === null ? null : (int) $eval->evaluator_id,
            'factorScores' => $eval->factor_scores,
            'totalScore' => $eval->total_score ? (float) $eval->total_score : null,
            'status' => $eval->status,
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