<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\JobRequisition;

/**
 * Deterministic, explainable resume-to-requisition match score.
 *
 * Not AI/LLM-based on purpose: a keyword/skill-overlap score can always show
 * its work ("2 of your 3 listed skills matched"), which is what lets HR
 * treat this as decision support rather than a black-box gate. There is no
 * "education" category because Candidate carries no structured education
 * field — scoring against data that doesn't exist would be a fabricated
 * number, not a real match.
 */
class AtsScoringService
{
    public function __construct(
        private readonly ResumeTextExtractor $resumeExtractor,
    ) {
    }

    /**
     * Scores the candidate against their linked requisition and persists the
     * result. Returns null (and touches nothing) if there is no requisition
     * to score against — there is nothing to compute a "match" to.
     */
    public function score(Candidate $candidate): ?array
    {
        $requisition = $candidate->requisition_id
            ? JobRequisition::query()->find($candidate->requisition_id)
            : null;

        if (!$requisition) {
            return null;
        }

        $breakdown = $this->buildBreakdown($candidate, $requisition);

        $candidate->forceFill([
            'ats_score' => $breakdown['overall'],
            'ats_score_breakdown' => $breakdown,
            'ats_scored_at' => now(),
            'ats_score_source' => 'system',
        ])->save();

        return $breakdown;
    }

    public function buildBreakdown(Candidate $candidate, JobRequisition $requisition): array
    {
        $weights = config('ats.weights');
        $requirementText = trim(($requisition->requirements ?? '') . ' ' . ($requisition->description ?? ''));
        $requirementKeywords = $this->tokenize($requirementText);

        $resumeText = $this->resumeExtractor->extract($candidate->resume_path);
        $resumeTokens = $resumeText ? $this->tokenize($resumeText) : [];

        $skills = $this->skillsCategory($candidate, $requirementText);
        $experience = $this->experienceCategory($candidate, $requisition);
        $keywords = $this->keywordsCategory($resumeTokens, $requirementKeywords, $resumeText !== null);

        $categories = ['skills' => $skills, 'experience' => $experience, 'keywords' => $keywords];

        $totalWeight = array_sum($weights) ?: 1;
        $overall = 0.0;
        foreach ($categories as $key => $cat) {
            $overall += $cat['score'] * (($weights[$key] ?? 0) / $totalWeight);
        }

        // If no resume is available, cap the overall ATS score to prevent false confidence
        if ($resumeText === null && $overall > 60.0) {
            $overall = 60.0;
        }

        return [
            'overall' => round($overall, 2),
            'weights' => $weights,
            'categories' => $categories,
            'requisition_id' => $requisition->id,
            'requisition_title' => $requisition->title,
            'resume_text_available' => $resumeText !== null,
            'computed_at' => now()->toIso8601String(),
        ];
    }

    private function skillsCategory(Candidate $candidate, string $requirementText): array
    {
        $skills = collect($candidate->skills ?? [])
            ->map(fn ($s) => trim((string) $s))
            ->filter()
            ->values();

        if ($skills->isEmpty()) {
            return [
                'score' => 0.0,
                'weight' => config('ats.weights.skills'),
                'matched' => [],
                'missing' => [],
                'note' => 'Candidate has no skills listed on their profile.',
            ];
        }

        $haystack = mb_strtolower($requirementText);
        $matched = $skills->filter(fn ($skill) => $skill !== '' && str_contains($haystack, mb_strtolower($skill)));
        $missing = $skills->diff($matched);

        // Score based on matching a baseline of 3 skills instead of punishing extra skills
        $targetSkillMatches = 3;
        $score = min(100.0, ($matched->count() / $targetSkillMatches) * 100);

        return [
            'score' => round($score, 2),
            'weight' => config('ats.weights.skills'),
            'matched' => $matched->values()->all(),
            'missing' => $missing->values()->all(),
            'note' => $matched->isEmpty() ? 'No skills matched the job description.' : null,
        ];
    }

    private function experienceCategory(Candidate $candidate, JobRequisition $requisition): array
    {
        $min = $requisition->min_experience !== null ? (float) $requisition->min_experience : null;
        $max = $requisition->max_experience !== null ? (float) $requisition->max_experience : null;
        $years = $candidate->experience_years !== null ? (float) $candidate->experience_years : null;

        $base = [
            'weight' => config('ats.weights.experience'),
            'candidate_years' => $years,
            'required_min' => $min,
            'required_max' => $max,
        ];

        if ($min === null && $max === null) {
            return $base + ['score' => 100.0, 'note' => 'This requisition has no experience range set.'];
        }

        if ($years === null) {
            return $base + ['score' => 0.0, 'note' => 'Candidate has no experience value on file.'];
        }

        if ($min !== null && $years < $min) {
            $score = $min > 0 ? max(0, ($years / $min) * 100) : 0.0;

            return $base + ['score' => round($score, 2), 'note' => 'Candidate does not meet the minimum required experience.'];
        }

        if ($max !== null && $years > $max) {
            // Penalize overqualification slightly (up to 30% drop)
            $excess = $years - $max;
            $penalty = min(30, ($excess / $max) * 30);
            return $base + ['score' => round(100.0 - $penalty, 2), 'note' => 'Candidate exceeds the maximum requested experience.'];
        }

        return $base + ['score' => 100.0, 'note' => null];
    }

    private function keywordsCategory(array $resumeTokens, array $requirementKeywords, bool $resumeAvailable): array
    {
        $weight = config('ats.weights.keywords');

        if (!$resumeAvailable) {
            return [
                'score' => 0.0,
                'weight' => $weight,
                'matched_count' => 0,
                'total_keywords' => count($requirementKeywords),
                'note' => 'Resume text could not be read for matching (missing file or unsupported/unparseable format).',
            ];
        }

        if ($requirementKeywords === []) {
            return [
                'score' => 100.0,
                'weight' => $weight,
                'matched_count' => 0,
                'total_keywords' => 0,
                'note' => 'This requisition has no description/requirements text to match against.',
            ];
        }

        $resumeSet = array_flip($resumeTokens);
        $matched = array_filter($requirementKeywords, fn ($kw) => isset($resumeSet[$kw]));

        return [
            'score' => round((count($matched) / count($requirementKeywords)) * 100, 2),
            'weight' => $weight,
            'matched_count' => count($matched),
            'total_keywords' => count($requirementKeywords),
            'note' => null,
        ];
    }

    /** @return string[] unique, lowercase, stopword-free tokens */
    private function tokenize(string $text): array
    {
        $minLength = (int) config('ats.min_keyword_length', 3);
        $stopwords = array_flip(config('ats.stopwords', []));

        preg_match_all('/[a-zA-Z][a-zA-Z0-9+#.]*/', mb_strtolower($text), $matches);

        $tokens = array_filter(
            $matches[0] ?? [],
            fn ($token) => mb_strlen($token) >= $minLength && !isset($stopwords[$token])
        );

        return array_values(array_unique($tokens));
    }
}
