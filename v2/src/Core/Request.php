<?php

declare(strict_types=1);

namespace App\Core;

class Request
{
    public readonly string $method;
    public readonly string $path;
    /** @var array<string,mixed> */
    public readonly array $query;
    /** @var array<string,mixed> */
    private array $body;
    /** @var array<string,array> */
    public readonly array $files;
    public readonly string $ip;

    public function __construct()
    {
        $this->method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $this->path = rtrim((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/') ?: '/';
        $this->query = $_GET;
        $this->files = $_FILES;
        $this->ip = self::resolveIp();
        $this->body = $this->parseBody();
    }

    private static function resolveIp(): string
    {
        $forwarded = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? null;
        if ($forwarded) {
            return trim(explode(',', $forwarded)[0]);
        }
        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }

    /** @return array<string,mixed> */
    private function parseBody(): array
    {
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';

        if (str_starts_with($contentType, 'application/json')) {
            $raw = file_get_contents('php://input') ?: '';
            if ($raw === '') {
                return [];
            }
            $decoded = json_decode($raw, true);
            return is_array($decoded) ? $decoded : [];
        }

        if (in_array($this->method, ['POST', 'PUT', 'PATCH'], true)) {
            return $_POST;
        }

        return [];
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body[$key] ?? $this->query[$key] ?? $default;
    }

    /** @return array<string,mixed> */
    public function all(): array
    {
        return $this->body;
    }

    public function queryParam(string $key, mixed $default = null): mixed
    {
        return $this->query[$key] ?? $default;
    }

    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return $_SERVER[$key] ?? null;
    }

    public function isApi(): bool
    {
        return str_starts_with($this->path, '/api/');
    }
}
