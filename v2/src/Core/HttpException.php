<?php

declare(strict_types=1);

namespace App\Core;

class HttpException extends \RuntimeException
{
    /** @param array<string,string>|null $fields */
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly ?array $fields = null,
    ) {
        parent::__construct($message);
    }
}
