<?php

namespace App\Services\Authorization;

final class AuthorizationDecision
{
    public function __construct(
        public readonly bool $allowed,
        public readonly string $reasonCode,
        public readonly array $matchedPolicyIds = [],
        public readonly array $sources = [],
        public readonly array $obligations = [],
        public readonly array $failedConditions = [],
        public readonly string $effectiveState = 'NOT_ASSIGNED',
        public readonly ?array $legacyDecision = null,
    ) {
    }

    public function toArray(): array
    {
        return [
            'allowed' => $this->allowed,
            'reasonCode' => $this->reasonCode,
            'effectiveState' => $this->effectiveState,
            'matchedPolicyIds' => $this->matchedPolicyIds,
            'sources' => $this->sources,
            'obligations' => $this->obligations,
            'failedConditions' => $this->failedConditions,
            'legacyDecision' => $this->legacyDecision,
        ];
    }
}
