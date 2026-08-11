<?php

namespace App\Services\Provisioning;

use RuntimeException;

/**
 * A provisioning rule refused the request.
 *
 * Thrown rather than returned so it cannot be ignored: every one of these is
 * raised inside a transaction, and unwinding is the correct outcome. The code
 * and status travel with it so each controller can render it in whatever
 * envelope its endpoint already uses.
 */
class ProvisioningException extends RuntimeException
{
    /**
     * `errorCode`, not `code` — Exception already declares a non-readonly $code
     * and a subclass cannot redeclare it as readonly. The collision is a fatal
     * error at class-load time, so it fails everything that touches the file
     * rather than only the paths that throw.
     */
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $status = 422,
    ) {
        parent::__construct($message);
    }

    /** @param array{0:string,1:string,2:int} $rejection */
    public static function fromRejection(array $rejection): self
    {
        return new self($rejection[0], $rejection[1], $rejection[2]);
    }
}
