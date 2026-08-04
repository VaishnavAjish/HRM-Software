<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Thrown when a write is attempted against a protected system account by an
 * actor that is not itself a super administrator. The message is deliberately
 * generic — it names no account, id or email, so a probe cannot confirm the
 * target exists from the error alone.
 */
class ProtectedAccountException extends RuntimeException
{
    public function __construct(string $message = 'This account cannot be modified.')
    {
        parent::__construct($message);
    }
}
