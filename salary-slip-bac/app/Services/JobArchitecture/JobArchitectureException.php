<?php

namespace App\Services\JobArchitecture;

use Exception;

/**
 * Exception for Job Architecture domain errors.
 */
class JobArchitectureException extends Exception
{
    public string $errorCode;

    public function __construct(string $errorCode, string $message = '', int $code = 422, ?Throwable $previous = null)
    {
        parent::__construct($message, $code, $previous);
        $this->errorCode = $errorCode;
    }
}